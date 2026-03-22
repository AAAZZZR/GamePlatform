// app/page.tsx
"use client";
import React, { useState, useEffect } from 'react';
import { useSocketConnection } from '@/hooks/useSocketConnection';
import Lobby from '@/components/Lobby';
import GameShell from '@/platform/GameShell';
import { GameId } from '@/types/game';

export default function Home() {
  const { socket, joinLink, isControllerConnected, roomId } = useSocketConnection();
  const [currentView, setCurrentView] = useState<GameId>('LOBBY');

  useEffect(() => {
    if (!socket) return;
    socket.on('game-changed', (gameId: GameId) => {
      setCurrentView(gameId);
    });
    return () => { socket.off('game-changed'); };
  }, [socket]);

  if (!socket) {
    return <div className="h-screen bg-black text-white flex items-center justify-center">Initializing System...</div>;
  }

  // Game View — GameShell 統一管理
  if (currentView !== 'LOBBY') {
    return (
      <GameShell
        gameId={currentView}
        socket={socket}
        roomId={roomId}
        onExit={() => {
          socket.emit('select-game', { roomId, gameId: 'LOBBY' });
        }}
      />
    );
  }

  // Lobby View
  return (
    <Lobby
      joinLink={joinLink}
      isControllerConnected={isControllerConnected}
      onSelectGame={(gameId) => {
        socket.emit('select-game', { roomId, gameId });
      }}
    />
  );
}
