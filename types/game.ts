// types/game.ts
export interface GyroData {
  alpha: number | null; // Z-axis rotation
  beta: number | null;  // X-axis rotation (front/back)
  gamma: number | null; // Y-axis rotation (left/right)
}

export interface RoomEvent {
  roomId: string;
}

export interface GyroEvent extends RoomEvent {
  data: GyroData;
}

export interface GameSettings {
  speed: number;        // 移動速度加成
  maxAngle: number;     // 最大傾角 (正規化分母，如 30 或 45)
}

// [新增] 遊戲狀態枚舉
export type GameStatus = 'IDLE' | 'READY' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type GameId = 'LOBBY' | 'game1' | 'game2' | 'game3'; // 未來有新資料夾就加在這

// 2. 擴充 Socket 事件
export interface GameStateEvent {
  roomId: string;
  gameId: GameId; // 告訴大家現在是哪個遊戲
}