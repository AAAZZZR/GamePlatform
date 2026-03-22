// platform/useNormalizedInput.ts — 統一輸入管理器
// 監聽 socket 事件，將陀螺儀 + 按鈕正規化成 NormalizedInput
import { useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { NormalizedInput } from './types';

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
