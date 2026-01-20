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

app.prepare().then(() => {
  const expressApp = express();
  const server = createServer(expressApp);
  const io = new Server(server);

  io.on('connection', (socket: Socket) => {
    // 1. Join Room
    socket.on('join-room', (roomId: string) => {
      socket.join(roomId);
      console.log(`[Socket] ${socket.id} joined room: ${roomId}`);
      // Notify host that controller is ready
      socket.to(roomId).emit('controller-connected');
    });

    // 2. Handle Gyro Data
    socket.on('gyro-data', ({ roomId, data }: { roomId: string, data: any }) => {
      // Broadcast to the host (PC) in the same room
      socket.to(roomId).emit('update-game-state', data);
    });

    socket.on('disconnect', () => {
      // Optional: Notify host to pause game
    });

    socket.on('select-game', (data: { roomId: string, gameId: string }) => {
      console.log(`[Room ${data.roomId}] switch game to: ${data.gameId}`);
      // 廣播給房間內所有人 (包含電腦和手機)
      io.to(data.roomId).emit('game-changed', data.gameId);
    });
    socket.on('controller-action', (payload: { roomId: string, action: string }) => {
      // 廣播給同房間的電腦
      socket.to(payload.roomId).emit('controller-action', payload.action);
    });
    socket.on('reset-position', (data: { roomId: string }) => {
      // 通知同房間的電腦 (Host)
      socket.to(data.roomId).emit('reset-game-position');
    });

    // Sync Game Status (PC -> Mobile)
    socket.on('sync-game-status', (data: { roomId: string, status: string }) => {
      socket.to(data.roomId).emit('sync-game-status', data.status);
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