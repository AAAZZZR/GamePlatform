// platform/GameShell.tsx — 遊戲外殼
// 統一管理：輸入正規化、分數/狀態、UI 覆蓋層、設定面板、把遊戲狀態同步給手機
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { GAME_REGISTRY } from '@/games/registry';
import type { HostLink } from '@/lib/peer/hostLink';
import type { GameMode, GamePlayId, GameSettings } from '@/types/game';
import { useNormalizedInput, useMultiplayerInput } from './useNormalizedInput';
import { applyAction, DEFAULT_GAME_SETTINGS } from './input';
import type { GameStatus } from './types';
import GameSettingsPanel from '@/components/GameSettings';
import GameOverlay from '@/components/GameOverlay';
import { sfx } from '@/platform/audio';

interface GameShellProps {
  gameId: GamePlayId;
  link: HostLink;
  mode?: GameMode;
  onExit: () => void;
}

export default function GameShell({ gameId, link, mode = 'solo', onExit }: GameShellProps) {
  const [gameStatus, setGameStatus] = useState<GameStatus>('READY');
  const [score, setScore] = useState(0);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
  const [restartKey, setRestartKey] = useState(0);

  // 通用音效：開始 / Game Over
  const prevStatusRef = useRef<GameStatus>('READY');
  useEffect(() => {
    if (prevStatusRef.current !== gameStatus) {
      if (gameStatus === 'PLAYING' && prevStatusRef.current === 'READY') sfx.start();
      if (gameStatus === 'GAME_OVER') sfx.gameOver();
      prevStatusRef.current = gameStatus;
    }
  }, [gameStatus]);

  // 統一輸入（gyro + 按鈕 → NormalizedInput ref）
  const inputRef = useNormalizedInput(mode === 'solo' ? link : null, settings);
  const multiInputRefs = useMultiplayerInput(mode === 'multi' ? link : null, settings);

  // 同步遊戲狀態到手機端
  useEffect(() => {
    link.broadcast({ type: 'game-status', status: gameStatus });
  }, [link, gameStatus]);

  const handleRestart = () => {
    setRestartKey(k => k + 1);
    setScore(0);
    // 不設 gameStatus — 讓新掛載的遊戲元件自己回報初始狀態
  };

  // 電腦端設定列的按鈕：開始和重來要讓遊戲自己知道（跟手機送的動作一樣），不能只改平台狀態
  const handlePanelStatus = (next: GameStatus) => {
    const input = mode === 'solo' ? inputRef.current : multiInputRefs.get(1)?.current;
    if (next === 'PLAYING' && gameStatus === 'READY' && input) {
      applyAction(input, 'start-game');
      return;
    }
    if (next === 'PLAYING' && gameStatus === 'GAME_OVER' && input) {
      applyAction(input, 'restart-game');
      return;
    }
    setGameStatus(next);
  };

  const GameComponent = GAME_REGISTRY[gameId].desktop;

  return (
    <div className="relative w-full h-full">
      {/* 設定面板 */}
      <GameSettingsPanel
        status={gameStatus}
        settings={settings}
        onStatusChange={handlePanelStatus}
        onSettingsChange={setSettings}
        onRestart={handleRestart}
        onBackToLobby={onExit}
      />

      {/* 狀態覆蓋層（Ready / Game Over / Paused） */}
      <GameOverlay status={gameStatus} score={score} />

      <GameComponent
        key={`${gameId}-${restartKey}`}
        inputRef={mode === 'solo' ? inputRef : multiInputRefs.get(1)}
        {...(mode === 'multi' ? { inputRefs: multiInputRefs } : {})}
        paused={gameStatus === 'PAUSED'}
        callbacks={{
          onScoreChange: setScore,
          onStatusChange: setGameStatus,
          onExit,
        }}
      />
    </div>
  );
}
