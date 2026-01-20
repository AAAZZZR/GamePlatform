// hooks/useMobileSocket.ts
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useMobileSocket(roomId: string | null) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!roomId) return;

    // 1. 建立連線
    const newSocket = io();
    setSocket(newSocket);

    // 2. 加入房間
    newSocket.emit('join-room', roomId);

    // 3. 監聽狀態
    newSocket.on('connect', () => setIsConnected(true));
    newSocket.on('disconnect', () => setIsConnected(false));

    return () => {
      newSocket.disconnect();
    };
  }, [roomId]);

  return { socket, isConnected };
}