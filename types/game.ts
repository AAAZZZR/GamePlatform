// types/game.ts

export interface GameSettings {
  speed: number;        // 移動速度加成
  maxAngle: number;     // 最大傾角 (正規化分母，如 30 或 45)
}

// 遊戲狀態
export type GameStatus = 'IDLE' | 'READY' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

// Multiplayer types
export type GameMode = 'solo' | 'multi';
export type PlayerNumber = 1 | 2;

/** 可以玩的遊戲；新增遊戲時這裡和 games/registry.ts 一起改 */
export type GamePlayId = 'game5' | 'game9';

/** 目前畫面：大廳或某個遊戲 */
export type GameId = 'LOBBY' | GamePlayId;
