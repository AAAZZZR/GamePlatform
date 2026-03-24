// platform/useNormalizedInput.ts — 統一輸入管理器
// 監聽 socket 事件，將陀螺儀 + 按鈕正規化成 NormalizedInput
import React, { useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { NormalizedInput } from './types';
import type { PlayerNumber } from '@/types/game';

function applyDeadzone(value: number, dz: number): number {
  if (Math.abs(value) < dz) return 0;
  const sign = Math.sign(value);
  return sign * (Math.abs(value) - dz) / (1 - dz);
}

export function useNormalizedInput(
  socket: Socket | null,
  settings: { speed: number; maxAngle: number }
) {
  const inputRef = useRef<NormalizedInput>({
    move: { x: 0, y: 0 },
    actions: {},
  });

  // 用 ref 存最新 settings 避免 effect 頻繁重建
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!socket) return;

    const handleGyro = (data: any) => {
      const s = settingsRef.current;
      const rawX = (data.gamma ?? 0) / s.maxAngle;
      const rawY = (data.beta ?? 0) / s.maxAngle;

      inputRef.current.move = {
        x: Math.max(-1, Math.min(1, applyDeadzone(rawX, 0.05))) * s.speed,
        y: Math.max(-1, Math.min(1, applyDeadzone(rawY, 0.05))) * s.speed,
      };
    };

    const handleAction = (action: string) => {
      // 持續按住型 (-start / -end)
      if (action.endsWith('-start')) {
        inputRef.current.actions[action.replace('-start', '')] = true;
      } else if (action.endsWith('-end')) {
        inputRef.current.actions[action.replace('-end', '')] = false;
      } else {
        // 單次觸發型：設 true，150ms 後自動清除
        inputRef.current.actions[action] = true;
        setTimeout(() => {
          inputRef.current.actions[action] = false;
        }, 150);
      }
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
  settings: { speed: number; maxAngle: number }
): Map<PlayerNumber, React.MutableRefObject<NormalizedInput>> {
  const p1Ref = useRef<NormalizedInput>({ move: { x: 0, y: 0 }, actions: {} });
  const p2Ref = useRef<NormalizedInput>({ move: { x: 0, y: 0 }, actions: {} });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!socket) return;

    const handleGyro = (data: any) => {
      const s = settingsRef.current;
      const playerNum = data.playerNumber || 1;
      const rawX = (data.gamma ?? 0) / s.maxAngle;
      const rawY = (data.beta ?? 0) / s.maxAngle;
      const move = {
        x: Math.max(-1, Math.min(1, applyDeadzone(rawX, 0.05))) * s.speed,
        y: Math.max(-1, Math.min(1, applyDeadzone(rawY, 0.05))) * s.speed,
      };

      if (playerNum === 2) {
        p2Ref.current.move = move;
      } else {
        p1Ref.current.move = move;
      }
    };

    const handleAction = (data: any) => {
      // data can be string (solo compat) or { action, playerNumber }
      const action = typeof data === 'string' ? data : data.action;
      const playerNum = typeof data === 'string' ? 1 : (data.playerNumber || 1);
      const ref = playerNum === 2 ? p2Ref : p1Ref;

      if (action.endsWith('-start')) {
        ref.current.actions[action.replace('-start', '')] = true;
      } else if (action.endsWith('-end')) {
        ref.current.actions[action.replace('-end', '')] = false;
      } else {
        ref.current.actions[action] = true;
        setTimeout(() => { ref.current.actions[action] = false; }, 150);
      }
    };

    socket.on('update-game-state', handleGyro);
    socket.on('controller-action', handleAction);
    return () => {
      socket.off('update-game-state', handleGyro);
      socket.off('controller-action', handleAction);
    };
  }, [socket]);

  const map = useRef(new Map<PlayerNumber, React.MutableRefObject<NormalizedInput>>());
  map.current.set(1, p1Ref as any);
  map.current.set(2, p2Ref as any);
  return map.current;
}
