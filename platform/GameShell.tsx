// platform/GameShell.tsx — 遊戲外殼
// 統一管理：輸入正規化、分數/狀態、UI 覆蓋層、設定面板
'use client';

import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { GAME_REGISTRY } from '@/games/registry';
import { GameSettings } from '@/types/game';
import { useNormalizedInput } from './useNormalizedInput';
import type { GameStatus } from './types';
import GameSettingsPanel from '@/components/GameSettings';
import GameOverlay from '@/components/GameOverlay';

interface GameShellProps {
  gameId: string;
  socket: Socket;
  roomId: string;
  onExit: () => void;
}

export default function GameShell({ gameId, socket, roomId, onExit }: GameShellProps) {
  const [gameStatus, setGameStatus] = useState<GameStatus>('READY');
  const [score, setScore] = useState(0);
  const [settings, setSettings] = useState<GameSettings>({ speed: 15, maxAngle: 30 });
  const [restartKey, setRestartKey] = useState(0);

  // 統一輸入（gyro + 按鈕 → NormalizedInput ref）
  const inputRef = useNormalizedInput(socket, settings);

  // 同步遊戲狀態到手機端
  useEffect(() => {
    if (socket && roomId) {
      socket.emit('sync-game-status', { roomId, status: gameStatus });
    }
  }, [socket, roomId, gameStatus]);

  const handleRestart = () => {
    setRestartKey(k => k + 1);
    setScore(0);
    // 不設 gameStatus — 讓新掛載的遊戲元件自己回報初始狀態
  };

  const game = GAME_REGISTRY[gameId];
  if (!game) return null;

  const GameComponent = game.desktop;

  return (
    <div className="relative w-full h-full">
      {/* 設定面板 */}
      <GameSettingsPanel
        status={gameStatus}
        settings={settings}
        onStatusChange={setGameStatus}
        onSettingsChange={setSettings}
        onRestart={handleRestart}
        onBackToLobby={onExit}
      />

      {/* 狀態覆蓋層（Ready / Game Over / Paused） */}
      <GameOverlay status={gameStatus} score={score} />

      {/* 遊戲本體 — 同時傳新舊 API，各遊戲取所需 */}
      <GameComponent
        key={`${gameId}-${restartKey}`}
        // ─── 新 Platform API ───
        inputRef={inputRef}
        callbacks={{
          onScoreChange: setScore,
          onStatusChange: setGameStatus,
          onExit,
        }}
        // ─── 舊 Legacy API（games 2-5 用） ───
        socket={socket}
        roomId={roomId}
        paused={gameStatus === 'PAUSED'}
        onPause={() => setGameStatus('PAUSED')}
        onResume={() => setGameStatus('PLAYING')}
        onScoreChange={setScore}
        onStatusChange={setGameStatus}
        settings={settings}
        onExit={onExit}
      />
    </div>
  );
}
