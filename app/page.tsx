// app/page.tsx
"use client";
import React, { useState, useEffect } from 'react';
import { useSocketConnection } from '@/hooks/useSocketConnection';
import Lobby from '@/components/Lobby';
import GameSettingsPanel from '@/components/GameSettings';
import GameOverlay from '@/components/GameOverlay';
import { GAME_REGISTRY } from '@/games/registry';
import { GameId, GameSettings, GameStatus } from '@/types/game';

export default function Home() {
  // 1. Hook: 連線
  const { socket, joinLink, isControllerConnected, roomId } = useSocketConnection();

  // 2. Hook: Global Game State
  const [currentView, setCurrentView] = useState<GameId>('LOBBY');
  const [gameStatus, setGameStatus] = useState<GameStatus>('PLAYING');
  const [score, setScore] = useState(0); // [NEW] Lifted score state
  const [gameSettings, setGameSettings] = useState<GameSettings>({
    speed: 15,
    maxAngle: 30
  });
  const [restartKey, setRestartKey] = useState(0);

  // 3. Hook: Effect (Socket Listeners)
  useEffect(() => {
    if (!socket) return;
    socket.on('game-changed', (gameId: GameId) => {
      setCurrentView(gameId);
      setGameStatus('PLAYING');
      setScore(0); // Reset score
      setRestartKey(0);
    });
    return () => { socket.off('game-changed'); };
  }, [socket]);

  // Handle Actions
  const handleBackToLobby = () => {
    if (socket && roomId) {
      socket.emit('select-game', { roomId, gameId: 'LOBBY' });
    }
  };

  const handleRestart = () => {
    setRestartKey(k => k + 1);
    setGameStatus('PLAYING');
    setScore(0);
  };

  // 4. Loading Check
  if (!socket) {
    return <div className="h-screen bg-black text-white flex items-center justify-center">Initializing System...</div>;
  }

  // 5. Render Logic
  const CurrentGame = GAME_REGISTRY[currentView]?.desktop;

  // A. Game View
  if (currentView !== 'LOBBY' && CurrentGame) {
    return (
      <div className="relative w-full h-full">
        {/* Global Settings Panel (Overlay) */}
        <GameSettingsPanel
          status={gameStatus}
          settings={gameSettings}
          onStatusChange={setGameStatus}
          onSettingsChange={setGameSettings}
          onRestart={handleRestart}
          onBackToLobby={handleBackToLobby}
        />

        {/* Shared Game Overlay (Ready / Game Over / Pause) */}
        <GameOverlay
          status={gameStatus}
          score={score}
        />

        {/* The Actual Game */}
        <CurrentGame
          key={`${currentView}-${restartKey}`}
          socket={socket}
          roomId={roomId}
          paused={gameStatus === 'PAUSED'}
          onPause={() => setGameStatus('PAUSED')}
          onResume={() => setGameStatus('PLAYING')}
          onScoreChange={setScore} // [NEW]
          onStatusChange={setGameStatus} // [NEW] Better than just internal status handling
          settings={gameSettings}
          onExit={handleBackToLobby}
        />
      </div>
    );
  }

  // B. Lobby View
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