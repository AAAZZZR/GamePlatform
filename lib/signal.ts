// lib/signal.ts — 牽線（WebRTC signaling）的共用規格：Worker 和瀏覽器都 import 這個檔
// 遊戲資料不走這裡。牽線只負責交換 WebRTC 的 offer / answer / ICE，P2P 連上後手機就斷開。

/** 牽線 WebSocket 的路徑 */
export const SIGNAL_PATH = '/ws';

/** 防護數字（改這裡就好，Worker 和前端都讀這份） */
export const LIMITS = {
  /** 同一個 IP 每 60 秒最多開幾條牽線連線（在 wrangler.jsonc 的 ratelimits 設定，這裡只是文件） */
  connectionsPerIpPerMinute: 10,
  /** 一個房間最多同時幾支手機在牽線 */
  playersPerRoom: 2,
  /** 手機牽線時限（毫秒）；超過伺服器就斷線，前端也用同一個數字提示失敗 */
  playerHandshakeMs: 30_000,
  /** 每條連線最多送幾則訊息 */
  playerMessageBudget: 50,
  hostMessageBudget: 200,
  /** 電腦送給「不在房間的手機」的訊息最多容忍幾則（例如手機剛斷、晚到的 ICE） */
  hostStrayMessageBudget: 20,
  /** 每條連線每秒最多幾則 */
  messagesPerSecond: 10,
  /** 單則訊息最大長度（字元） */
  maxMessageChars: 16_384,
} as const;

/** 房號：12 碼，不含容易看錯的字元 */
export const ROOM_ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const ROOM_ID_LENGTH = 12;
const ROOM_ID_PATTERN = new RegExp(`^[${ROOM_ID_ALPHABET}]{${ROOM_ID_LENGTH}}$`);

export function isValidRoomId(value: string | null): value is string {
  return value !== null && ROOM_ID_PATTERN.test(value);
}

export type SignalRole = 'host' | 'player';

export function isSignalRole(value: string | null): value is SignalRole {
  return value === 'host' || value === 'player';
}

/** 伺服器主動斷線的代碼（WebSocket close code 4000–4999 給應用程式用） */
export const CLOSE = {
  roomFull: 4001,
  noHost: 4002,
  tooFast: 4003,
  tooManyMessages: 4004,
  badMessage: 4005,
  handshakeTimeout: 4006,
  hostReplaced: 4007,
  ipLimited: 4029,
  dailyLimit: 4030,
} as const;

export type CloseCode = (typeof CLOSE)[keyof typeof CLOSE];

/** 瀏覽器 → 伺服器：只有一種訊息。手機的 to 會被忽略（一律轉給電腦） */
export interface ClientSignal {
  t: 'signal';
  to?: string;
  data: unknown;
}

/** 伺服器 → 瀏覽器 */
export type ServerSignal =
  | { t: 'welcome'; peer: string }
  | { t: 'peer-joined'; peer: string }
  | { t: 'peer-left'; peer: string }
  | { t: 'signal'; from: string; data: unknown };

/** 電腦送給手機的 signal，from 一律是這個值 */
export const HOST_PEER_ID = 'host';
