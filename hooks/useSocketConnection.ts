// hooks/useSocketConnection.ts
import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { useP2PConnection } from './useP2PConnection';
import type { GameMode, PlayerNumber } from '../types/game';

export function useSocketConnection(mode: GameMode = 'solo') {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [joinLink, setJoinLink] = useState('');
  const [roomId, setRoomId] = useState('');
  const [connectedPlayers, setConnectedPlayers] = useState<Map<string, PlayerNumber>>(new Map());

  useEffect(() => {
    // 1. 初始化 Socket
    const newSocket = io();
    const id = uuidv4().slice(0, 6);

    setSocket(newSocket);
    setRoomId(id);

    // 產生連結 (Client Side Only)
    if (typeof window !== 'undefined') {
      setJoinLink(`${window.location.protocol}//${window.location.host}/controller?room=${id}`);
    }

    // 2. 加入房間 — send mode alongside roomId
    newSocket.emit('join-room', { roomId: id, mode });

    // 3. 監聯手機連線狀態 — now includes { socketId, playerNumber }
    newSocket.on('controller-connected', (payload: { socketId: string; playerNumber: PlayerNumber } | undefined) => {
      if (payload && payload.socketId && payload.playerNumber) {
        console.log(`Mobile Controller Connected! P${payload.playerNumber} (${payload.socketId})`);
        setConnectedPlayers(prev => {
          const next = new Map(prev);
          next.set(payload.socketId, payload.playerNumber);
          return next;
        });
      } else {
        // Legacy fallback (should not happen with updated server)
        console.log('Mobile Controller Connected!');
        setConnectedPlayers(prev => {
          const next = new Map(prev);
          next.set('unknown', 1);
          return next;
        });
      }
    });

    // 4. Listen for controller disconnections
    newSocket.on('controller-disconnected', (payload: { playerNumber: PlayerNumber }) => {
      console.log(`Controller disconnected: P${payload.playerNumber}`);
      setConnectedPlayers(prev => {
        const next = new Map(prev);
        // Remove by playerNumber (find the matching socketId)
        for (const [sid, pn] of next) {
          if (pn === payload.playerNumber) {
            next.delete(sid);
            break;
          }
        }
        return next;
      });
    });

    // 清理
    return () => {
      newSocket.disconnect();
    };
  }, [mode]);

  // 4. Attempt WebRTC P2P once socket + roomId are ready
  // (useP2PConnection only runs when both are non-null/non-empty)
  const { p2pActive } = useP2PConnection(socket, roomId);

  // Derived convenience booleans
  const isControllerConnected = connectedPlayers.size > 0;
  const isP1Connected = Array.from(connectedPlayers.values()).includes(1);
  const isP2Connected = Array.from(connectedPlayers.values()).includes(2);

  return {
    socket,
    roomId,
    joinLink,
    mode,
    connectedPlayers,
    isControllerConnected, // legacy compat
    isP1Connected,
    isP2Connected,
    p2pActive,
  };
}
