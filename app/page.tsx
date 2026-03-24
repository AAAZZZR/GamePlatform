// app/page.tsx
"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useSocketConnection } from '@/hooks/useSocketConnection';
import Lobby from '@/components/Lobby';
import GameShell from '@/platform/GameShell';
import { GameId, GameMode, PlayerNumber } from '@/types/game';
import { initAudio, startBgm, stopBgm } from '@/platform/audio';

export default function Home() {
  const { socket, joinLink, isControllerConnected, roomId } = useSocketConnection();
  const [currentView, setCurrentView] = useState<GameId>('LOBBY');
  const [audioReady, setAudioReady] = useState(false);
  const [desktopTilt, setDesktopTilt] = useState({ x: 0, y: 0 });

  // Multiplayer state
  const [mode, setMode] = useState<GameMode | null>(null);
  const [connectedPlayers, setConnectedPlayers] = useState<Map<string, PlayerNumber>>(new Map());

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
    // Listen to gyro data for tilt ball in lobby
    const handleGyro = (data: any) => {
      setDesktopTilt({
        x: Math.max(-1, Math.min(1, (data.gamma ?? 0) / 30)),
        y: Math.max(-1, Math.min(1, (data.beta ?? 0) / 30)),
      });
    };
    socket.on('update-game-state', handleGyro);

    // Listen for connected-players updates (from multiplayer hook, when available)
    const handlePlayersUpdate = (players: Record<string, PlayerNumber>) => {
      setConnectedPlayers(new Map(Object.entries(players)));
    };
    socket.on('players-updated', handlePlayersUpdate);

    return () => {
      socket.off('game-changed');
      socket.off('update-game-state', handleGyro);
      socket.off('players-updated', handlePlayersUpdate);
    };
  }, [socket]);

  // When mode changes, notify the server (if the hook supports it)
  useEffect(() => {
    if (!socket || !roomId || mode === null) return;
    socket.emit('set-mode', { roomId, mode });
  }, [socket, roomId, mode]);

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
      tilt={desktopTilt}
      onSelectGame={(gameId) => {
        socket.emit('select-game', { roomId, gameId });
      }}
      mode={mode}
      onModeSelect={setMode}
      connectedPlayers={connectedPlayers}
    />
  );
}
