// hooks/useSocketConnection.ts
import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

export function useSocketConnection() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isControllerConnected, setIsControllerConnected] = useState(false);
  const [joinLink, setJoinLink] = useState('');
  const [roomId, setRoomId] = useState('');

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

    // 2. 加入房間
    newSocket.emit('join-room', id);

    // 3. 監聽手機連線狀態
    newSocket.on('controller-connected', () => {
      console.log('Mobile Controller Connected!');
      setIsControllerConnected(true);
    });

    // 清理
    return () => {
      newSocket.disconnect();
    };
  }, []);

  return {
    socket,
    roomId,
    joinLink,
    isControllerConnected
  };
}