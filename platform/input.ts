// platform/input.ts — 把陀螺儀角度和按鈕事件轉成 NormalizedInput（純函式，平台和 /dev 試玩頁共用）
import type { GameSettings } from '@/types/game';
import type { NormalizedInput } from './types';

export const DEFAULT_GAME_SETTINGS: GameSettings = { speed: 15, maxAngle: 30 };

const DEADZONE = 0.05;
const ONE_SHOT_MS = 150;

export function emptyInput(): NormalizedInput {
  return { move: { x: 0, y: 0 }, actions: {} };
}

function applyDeadzone(value: number): number {
  if (Math.abs(value) < DEADZONE) return 0;
  return Math.sign(value) * (Math.abs(value) - DEADZONE) / (1 - DEADZONE);
}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/** gamma（度）→ move.x，beta（度）→ move.y；結果範圍是 ±settings.speed */
export function gyroToMove(beta: number, gamma: number, settings: GameSettings): NormalizedInput['move'] {
  return {
    x: clampUnit(applyDeadzone(gamma / settings.maxAngle)) * settings.speed,
    y: clampUnit(applyDeadzone(beta / settings.maxAngle)) * settings.speed,
  };
}

/**
 * 按鈕事件：
 * - `xxx-start` / `xxx-end`：按住型，actions.xxx 在按住期間是 true
 * - 其他（例如 `start-game`）：單次觸發，actions[action] 變 true，150ms 後自動清掉
 */
export function applyAction(input: NormalizedInput, action: string): void {
  if (action.endsWith('-start')) {
    input.actions[action.slice(0, -'-start'.length)] = true;
    return;
  }
  if (action.endsWith('-end')) {
    input.actions[action.slice(0, -'-end'.length)] = false;
    return;
  }
  input.actions[action] = true;
  setTimeout(() => {
    input.actions[action] = false;
  }, ONE_SHOT_MS);
}
