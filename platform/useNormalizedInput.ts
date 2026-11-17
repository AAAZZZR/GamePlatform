// platform/useNormalizedInput.ts — 統一輸入管理器
// 監聽 socket 事件，將陀螺儀 + 按鈕正規化成 NormalizedInput
import React, { useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { NormalizedInput } from './types';
import type { GameSettings, PlayerNumber } from '@/types/game';
import { applyAction, emptyInput, gyroToMove } from './input';

export function useNormalizedInput(socket: Socket | null, settings: GameSettings) {
  const inputRef = useRef<NormalizedInput>(emptyInput());

  // 用 ref 存最新 settings 避免 effect 頻繁重建
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!socket) return;

    const handleGyro = (data: any) => {
      inputRef.current.move = gyroToMove(data.beta ?? 0, data.gamma ?? 0, settingsRef.current);
    };

    const handleAction = (action: string) => {
      applyAction(inputRef.current, action);
    };

    socket.on('update-game-state', handleGyro);
    socket.on('controller-action', handleAction);

    return () => {
      socket.off('update-game-state', handleGyro);
      socket.off('controller-action', handleAction);
    };
  }, [socket]);

  return inputRef;
}

// ─── 多人輸入管理器 ─────────────────────────────────────────────────
// Routes socket input by playerNumber into separate refs
export function useMultiplayerInput(
  socket: Socket | null,
  settings: GameSettings
): Map<PlayerNumber, React.MutableRefObject<NormalizedInput>> {
  const p1Ref = useRef<NormalizedInput>(emptyInput());
  const p2Ref = useRef<NormalizedInput>(emptyInput());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!socket) return;

    const handleGyro = (data: any) => {
      const ref = data.playerNumber === 2 ? p2Ref : p1Ref;
      ref.current.move = gyroToMove(data.beta ?? 0, data.gamma ?? 0, settingsRef.current);
    };

    const handleAction = (data: any) => {
      // data can be string (solo compat) or { action, playerNumber }
      const action = typeof data === 'string' ? data : data.action;
      const playerNum = typeof data === 'string' ? 1 : (data.playerNumber || 1);
      applyAction((playerNum === 2 ? p2Ref : p1Ref).current, action);
    };

    socket.on('update-game-state', handleGyro);
    socket.on('controller-action', handleAction);
    return () => {
      socket.off('update-game-state', handleGyro);
      socket.off('controller-action', handleAction);
    };
  }, [socket]);

  const map = useRef(new Map<PlayerNumber, React.MutableRefObject<NormalizedInput>>());
  map.current.set(1, p1Ref);
  map.current.set(2, p2Ref);
  return map.current;
}
