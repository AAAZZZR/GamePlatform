// games/game5/PowerupIcon.tsx — 道具圖示（DOM 版）。和畫布上用的是同一份 path（config.ts）。
import React from 'react';
import { ICON_STROKE, POWERUPS, type PowerupType } from './config';

export function PowerupIcon({ type, size }: { type: PowerupType; size: number }) {
  const icon = POWERUPS[type].icon;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d={icon.d}
        fill={icon.fill ? 'currentColor' : 'none'}
        fillRule={icon.rule}
        stroke={icon.fill ? 'none' : 'currentColor'}
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 和遊戲裡的道具球長得一樣：彩色圓球 + 白色圖示 */
export function PowerupBadge({ type, size }: { type: PowerupType; size: number }) {
  const color = POWERUPS[type].color;
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full text-white"
      style={{
        width: size,
        height: size,
        background: color,
        border: '1.5px solid rgba(255,255,255,0.75)',
        boxShadow: `0 0 12px ${color}99, inset 0 -3px 6px rgba(0,0,0,0.35)`,
      }}
    >
      <PowerupIcon type={type} size={Math.round(size * 0.62)} />
    </div>
  );
}
