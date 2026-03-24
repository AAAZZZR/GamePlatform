// server.ts
import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server, Socket } from 'socket.io';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const port = 3000;

// ── Room state management for multiplayer ──────────────────────────────────
type GameMode = 'solo' | 'multi';
type PlayerNumber = 1 | 2;

interface RoomState {
  mode: GameMode;
  hostSocketId: string;
  players: Map<string, PlayerNumber>; // socketId → playerNumber
}
const rooms = new Map<string, RoomState>();

// Track which room each socket belongs to for disconnect cleanup
const socketToRoom = new Map<string, string>();

app.prepare().then(() => {
  const expressApp = express();
  const server = createServer(expressApp);
  const io = new Server(server);

  io.on('connection', (socket: Socket) => {
    // 1. Join Room
    socket.on('join-room', (payload: string | { roomId: string; mode?: GameMode }) => {
      // Backward compatible: accept plain string (roomId) or object { roomId, mode }
      let roomId: string;
      let mode: GameMode = 'solo';

      if (typeof payload === 'string') {
        roomId = payload;
      } else {
        roomId = payload.roomId;
        mode = payload.mode ?? 'solo';
      }

      const existing = rooms.get(roomId);

      if (!existing) {
        // First joiner is the host — create room state
        const state: RoomState = {
          mode,
          hostSocketId: socket.id,
          players: new Map(),
        };
        rooms.set(roomId, state);
        socket.join(roomId);
        socketToRoom.set(socket.id, roomId);
        console.log(`[Socket] ${socket.id} created room: ${roomId} (mode=${mode})`);
      } else {
        // Subsequent joiner is a controller / player
        const maxPlayers = existing.mode === 'multi' ? 2 : 1;

        if (existing.players.size >= maxPlayers) {
          // Room is full
          socket.emit('room-full');
          console.log(`[Socket] ${socket.id} rejected — room ${roomId} is full`);
          return;
        }

        // Assign next available PlayerNumber
        const usedNumbers = new Set(existing.players.values());
        const playerNumber: PlayerNumber = usedNumbers.has(1) ? 2 : 1;

        existing.players.set(socket.id, playerNumber);
        socket.join(roomId);
        socketToRoom.set(socket.id, roomId);

        console.log(`[Socket] ${socket.id} joined room: ${roomId} as P${playerNumber}`);

        // Notify the controller of their assignment
        socket.emit('player-assigned', { playerNumber, mode: existing.mode });

        // Notify the room (host) that a controller connected
        socket.to(roomId).emit('controller-connected', { socketId: socket.id, playerNumber });
      }
    });

    // 2. Handle Gyro Data
    socket.on('gyro-data', ({ roomId, data }: { roomId: string; data: any }) => {
      const room = rooms.get(roomId);
      if (room && room.mode === 'multi') {
        // In multi mode, tag data with the sender's playerNumber
        const playerNumber = room.players.get(socket.id);
        socket.to(roomId).emit('update-game-state', { ...data, playerNumber });
      } else {
        // Solo mode: backward compatible — emit raw data
        socket.to(roomId).emit('update-game-state', data);
      }
    });

    // 3. Handle disconnect
    socket.on('disconnect', () => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) {
        socketToRoom.delete(socket.id);
        return;
      }

      const playerNumber = room.players.get(socket.id);

      if (playerNumber !== undefined) {
        // A player/controller disconnected
        room.players.delete(socket.id);
        socket.to(roomId).emit('controller-disconnected', { playerNumber });
        console.log(`[Socket] P${playerNumber} (${socket.id}) disconnected from room ${roomId}`);
      }

      if (room.hostSocketId === socket.id) {
        // Host disconnected — check if room is now empty
        // (Players may still be in the room; keep state for them)
        console.log(`[Socket] Host (${socket.id}) disconnected from room ${roomId}`);
      }

      socketToRoom.delete(socket.id);

      // Clean up room if all sockets have left
      const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
      if (!socketsInRoom || socketsInRoom.size === 0) {
        rooms.delete(roomId);
        console.log(`[Socket] Room ${roomId} cleaned up — no sockets left`);
      }
    });

    socket.on('select-game', (data: { roomId: string; gameId: string }) => {
      console.log(`[Room ${data.roomId}] switch game to: ${data.gameId}`);
      // 廣播給房間內所有人 (包含電腦和手機)
      io.to(data.roomId).emit('game-changed', data.gameId);
    });

    socket.on('controller-action', (payload: { roomId: string; action: string }) => {
      const room = rooms.get(payload.roomId);
      if (room && room.mode === 'multi') {
        // In multi mode, tag with playerNumber
        const playerNumber = room.players.get(socket.id);
        socket.to(payload.roomId).emit('controller-action', { action: payload.action, playerNumber });
      } else {
        // Solo mode: backward compatible — emit just the action string
        socket.to(payload.roomId).emit('controller-action', payload.action);
      }
    });

    socket.on('reset-position', (data: { roomId: string }) => {
      // 通知同房間的電腦 (Host)
      socket.to(data.roomId).emit('reset-game-position');
    });

    // Sync Game Status (PC -> Mobile)
    socket.on('sync-game-status', (data: { roomId: string; status: string }) => {
      socket.to(data.roomId).emit('sync-game-status', data.status);
    });

    // ── WebRTC Signaling Relay ──────────────────────────────────────────────
    // Tag WebRTC events with the sender's socketId so the host can maintain
    // separate P2P connections in multi mode.
    socket.on('webrtc-offer', (data: { roomId: string; sdp: RTCSessionDescriptionInit }) => {
      socket.to(data.roomId).emit('webrtc-offer', { sdp: data.sdp, fromSocketId: socket.id });
    });

    socket.on('webrtc-answer', (data: { roomId: string; sdp: RTCSessionDescriptionInit }) => {
      socket.to(data.roomId).emit('webrtc-answer', { sdp: data.sdp, fromSocketId: socket.id });
    });

    socket.on('webrtc-ice-candidate', (data: { roomId: string; candidate: RTCIceCandidateInit }) => {
      socket.to(data.roomId).emit('webrtc-ice-candidate', { candidate: data.candidate, fromSocketId: socket.id });
    });
  });

  // Handle Next.js routing
  expressApp.all(/.*/, (req: Request, res: Response) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
