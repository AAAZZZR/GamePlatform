// lib/peer/messages.ts — 電腦和手機之間的訊息格式（牽線內容 + P2P 連上後的遊戲訊息）
import { ROOM_ID_ALPHABET, ROOM_ID_LENGTH, SIGNAL_PATH, type ServerSignal, type SignalRole } from '@/lib/signal';
import type { GameId, GameMode, GameStatus, PlayerNumber } from '@/types/game';

/** 牽線時放在 signal.data 裡的內容 */
export type SignalPayload =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'candidate'; candidate: RTCIceCandidateInit }
  | { kind: 'reject'; reason: 'full' };

/** P2P 連上後：手機 → 電腦 */
export type PlayerMessage =
  | { type: 'gyro'; beta: number; gamma: number }
  | { type: 'action'; action: string }
  | { type: 'select-game'; gameId: GameId };

/** P2P 連上後：電腦 → 手機 */
export type HostMessage =
  | { type: 'assigned'; playerNumber: PlayerNumber; mode: GameMode }
  | { type: 'game-changed'; gameId: GameId }
  | { type: 'game-status'; status: GameStatus };

/** 只用免費的 STUN；沒有 TURN 中繼，所以 P2P 連不上就是連不上（不會改走伺服器） */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
];

/** 可靠、有序：按鈕、切換遊戲、狀態同步 */
export const CHANNEL_CTRL = 'ctrl';
/** 不可靠、無序：陀螺儀，掉一筆沒差，要的是最新的 */
export const CHANNEL_INPUT = 'input';

export function signalUrl(roomId: string, role: SignalRole): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${SIGNAL_PATH}?room=${roomId}&role=${role}`;
}

export function createRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_ID_LENGTH));
  let id = '';
  for (const byte of bytes) {
    id += ROOM_ID_ALPHABET[byte % ROOM_ID_ALPHABET.length];
  }
  return id;
}

/** 解析收到的 JSON；格式壞掉就記錄並回傳 null */
export function parseJson(raw: unknown, source: string): unknown {
  if (typeof raw !== 'string') {
    console.warn(`[${source}] ignored non-text message`);
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[${source}] ignored invalid JSON`, error);
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isServerSignal(value: unknown): value is ServerSignal {
  if (!isRecord(value)) return false;
  if (value.t === 'welcome' || value.t === 'peer-joined' || value.t === 'peer-left') return typeof value.peer === 'string';
  if (value.t === 'signal') return typeof value.from === 'string';
  return false;
}

export function isSignalPayload(value: unknown): value is SignalPayload {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'offer':
    case 'answer':
      return typeof value.sdp === 'string';
    case 'candidate':
      return isRecord(value.candidate);
    case 'reject':
      return value.reason === 'full';
    default:
      return false;
  }
}

export function isPlayerMessage(value: unknown): value is PlayerMessage {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'gyro':
      return Number.isFinite(value.beta) && Number.isFinite(value.gamma);
    case 'action':
      return typeof value.action === 'string';
    case 'select-game':
      return typeof value.gameId === 'string';
    default:
      return false;
  }
}

export function isHostMessage(value: unknown): value is HostMessage {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'assigned':
      return (value.playerNumber === 1 || value.playerNumber === 2) && (value.mode === 'solo' || value.mode === 'multi');
    case 'game-changed':
      return typeof value.gameId === 'string';
    case 'game-status':
      return typeof value.status === 'string';
    default:
      return false;
  }
}
