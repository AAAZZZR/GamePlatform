// app/page.tsx
"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useSocketConnection } from '@/hooks/useSocketConnection';
import Lobby from '@/components/Lobby';
import GameShell from '@/platform/GameShell';
import { GameId } from '@/types/game';
import { initAudio, startBgm, stopBgm } from '@/platform/audio';

export default function Home() {
  const { socket, joinLink, isControllerConnected, roomId } = useSocketConnection();
  const [currentView, setCurrentView] = useState<GameId>('LOBBY');
  const [audioReady, setAudioReady] = useState(false);

  // 首次互動解鎖 AudioContext（瀏覽器政策需要 user gesture）
  useEffect(() => {
    const unlock = () => {
      initAudio();
      setAudioReady(true);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // BGM：大廳播放，進遊戲時停止
  useEffect(() => {
    if (!audioReady) return;
    if (currentView === 'LOBBY') startBgm();
    else stopBgm();
    return () => stopBgm();
  }, [currentView, audioReady]);

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
