// hooks/useMobileSocket.ts
import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameMode, PlayerNumber } from '../types/game';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function useMobileSocket(roomId: string | null) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [p2pChannel, setP2pChannel] = useState<RTCDataChannel | null>(null);
  const [playerNumber, setPlayerNumber] = useState<PlayerNumber | null>(null);
  const [mode, setMode] = useState<GameMode>('solo');
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (!roomId) return;

    // 1. 建立 Socket.IO 連線
    const newSocket = io();
    setSocket(newSocket);

    // 2. 加入房間
    newSocket.emit('join-room', roomId);

    // 3. 監聽狀態
    newSocket.on('connect', () => setIsConnected(true));
    newSocket.on('disconnect', () => setIsConnected(false));

    // 4. Listen for player assignment from server
    newSocket.on('player-assigned', (payload: { playerNumber: PlayerNumber; mode: GameMode }) => {
      console.log(`[Mobile] Assigned as P${payload.playerNumber} (mode=${payload.mode})`);
      setPlayerNumber(payload.playerNumber);
      setMode(payload.mode);
    });

    // 5. Listen for room-full rejection
    newSocket.on('room-full', () => {
      console.warn('[Mobile] Room is full — cannot join');
    });

    // ── WebRTC Signaling (mobile is answerer) ────────────────────────────
    let pc: RTCPeerConnection | null = null;

    newSocket.on('webrtc-offer', async (incoming: RTCSessionDescriptionInit | { sdp: RTCSessionDescriptionInit; fromSocketId?: string }) => {
      // Backward compat: accept raw sdp or wrapped { sdp, fromSocketId }
      const sdp = 'sdp' in incoming && 'fromSocketId' in incoming
        ? (incoming as { sdp: RTCSessionDescriptionInit }).sdp
        : incoming as RTCSessionDescriptionInit;
      try {
        pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        // ICE trickle
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            newSocket.emit('webrtc-ice-candidate', { roomId, candidate: e.candidate.toJSON() });
          }
        };

        // When PC creates the DataChannel we'll get it here
        pc.ondatachannel = (e) => {
          const ch = e.channel;
          ch.onopen = () => {
            console.log('[P2P] Mobile DataChannel open');
            setP2pChannel(ch);
          };
          ch.onclose = () => {
            console.log('[P2P] Mobile DataChannel closed');
            setP2pChannel(null);
          };
        };

        // Also create our own channel for sending gyro data
        const channel = pc.createDataChannel('gyro', { ordered: false, maxRetransmits: 0 });
        channel.onopen = () => {
          console.log('[P2P] Gyro DataChannel open');
          setP2pChannel(channel);
        };
        channel.onclose = () => {
          setP2pChannel(null);
        };

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        newSocket.emit('webrtc-answer', { roomId, sdp: pc.localDescription });
      } catch (err) {
        console.warn('[P2P] Mobile WebRTC setup failed:', err);
      }
    });

    newSocket.on('webrtc-ice-candidate', async (incoming: RTCIceCandidateInit | { candidate: RTCIceCandidateInit; fromSocketId?: string }) => {
      // Backward compat: accept raw candidate or wrapped { candidate, fromSocketId }
      const candidate = 'fromSocketId' in incoming
        ? (incoming as { candidate: RTCIceCandidateInit }).candidate
        : incoming as RTCIceCandidateInit;
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    return () => {
      if (pc) pc.close();
      newSocket.disconnect();
    };
  }, [roomId]);

  /** Send gyro data preferring P2P DataChannel; fall back to Socket.IO */
  const sendGyro = (data: any) => {
    // In multi mode, include playerNumber in the data
    const payload = playerNumber !== null && mode === 'multi'
      ? { ...data, playerNumber }
      : data;

    const ch = p2pChannel;
    if (ch && ch.readyState === 'open') {
      try {
        ch.send(JSON.stringify(payload));
        return;
      } catch { /* fall through */ }
    }
    // Fallback: Socket.IO relay
    if (socket && roomId) {
      socket.emit('gyro-data', { roomId, data: payload });
    }
  };

  /** Send controller action preferring P2P DataChannel; fall back to Socket.IO */
  const sendAction = (action: string) => {
    const ch = p2pChannel;
    if (ch && ch.readyState === 'open') {
      try {
        // In multi mode, include playerNumber
        const payload = playerNumber !== null && mode === 'multi'
          ? { _p2p: 'action', action, playerNumber }
          : { _p2p: 'action', action };
        ch.send(JSON.stringify(payload));
        return;
      } catch { /* fall through */ }
    }
    if (socket && roomId) {
      socket.emit('controller-action', { action, roomId });
    }
  };

  return { socket, isConnected, p2pChannel, sendGyro, sendAction, playerNumber, mode };
}
