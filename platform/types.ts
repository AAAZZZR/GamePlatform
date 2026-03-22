// platform/types.ts — 遊戲平台合約
import { MutableRefObject } from 'react';
import { GameStatus } from '@/types/game';

// ─── 統一輸入格式 ───────────────────────────────────────────────────
export interface NormalizedInput {
  /** 傾斜方向，已經乘上 speed 和 maxAngle 正規化 */
  move: { x: number; y: number };
  /** 按鈕狀態（fire: true/false, 'start-game': true 一次性, etc.） */
  actions: Record<string, boolean>;
}

// ─── 遊戲生命週期回呼 ──────────────────────────────────────────────
export type { GameStatus };

export interface GameCallbacks {
  onScoreChange: (score: number) => void;
  onStatusChange: (status: GameStatus) => void;
  onExit: () => void;
}

// ─── 新遊戲桌面端 Props（R3F 或任何引擎都接這個） ──────────────────
export interface DesktopGameProps {
  inputRef: MutableRefObject<NormalizedInput>;
  paused: boolean;
  callbacks: GameCallbacks;
}

// ─── 手機端 Props ──────────────────────────────────────────────────
export interface MobileControllerProps {
  sendAction: (action: string) => void;
}

// ─── 遊戲註冊表條目 ────────────────────────────────────────────────
export interface GameEntry {
  name: string;
  description: string;
  icon: string;
  // 接受 DesktopGameProps + 向下相容舊 Props（socket, roomId, etc.）
  desktop: React.ComponentType<any>;
  // 接受 MobileControllerProps + 向下相容舊 Props
  mobile: React.ComponentType<any>;
}
