// worker/room.ts — 一個房間一個 Durable Object，只負責牽線（轉發 WebRTC 的 offer / answer / ICE）
// 用 WebSocket Hibernation API：沒有訊息時房間會休眠，休眠期間不計費。
// 防護規則的數字都在 lib/signal.ts 的 LIMITS。
import { DurableObject } from 'cloudflare:workers';
import {
  CLOSE,
  HOST_PEER_ID,
  LIMITS,
  type ClientSignal,
  type CloseCode,
  type ServerSignal,
  type SignalRole,
} from '../lib/signal';

interface Attachment {
  role: SignalRole;
  /** 手機的 id；電腦固定是 HOST_PEER_ID */
  peer: string;
  joinedAt: number;
  /** 這條連線總共送了幾則 */
  sent: number;
  /** 電腦送給「不在房間的手機」幾則 */
  stray: number;
  /** 每秒限速用的時間窗 */
  windowStart: number;
  windowCount: number;
}

function readAttachment(ws: WebSocket): Attachment {
  return ws.deserializeAttachment() as Attachment;
}

function newAttachment(role: SignalRole, peer: string): Attachment {
  const now = Date.now();
  return { role, peer, joinedAt: now, sent: 0, stray: 0, windowStart: now, windowCount: 0 };
}

function send(ws: WebSocket, message: ServerSignal): void {
  try {
    ws.send(JSON.stringify(message));
  } catch (error) {
    // 對方剛好在關閉中，送不到是預期內的；記一下就好
    console.warn('signal send failed', message.t, error);
  }
}

function reject(ws: WebSocket, code: CloseCode, reason: string): void {
  ws.close(code, reason);
}

function isClientSignal(value: unknown): value is ClientSignal {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  if (msg.t !== 'signal') return false;
  if (msg.to !== undefined && typeof msg.to !== 'string') return false;
  return typeof msg.data === 'object' && msg.data !== null;
}

export class SignalRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    // Worker 已經驗證過 role 和房號
    const role = new URL(request.url).searchParams.get('role') as SignalRole;
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    if (role === 'host') {
      this.acceptHost(server);
    } else {
      this.acceptPlayer(server);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  private host(): WebSocket | undefined {
    return this.ctx.getWebSockets('host')[0];
  }

  private players(): WebSocket[] {
    return this.ctx.getWebSockets('player');
  }

  private acceptHost(ws: WebSocket): void {
    // 同一個房號再連一次電腦（例如電腦斷線重連）：新的取代舊的
    for (const old of this.ctx.getWebSockets('host')) {
      reject(old, CLOSE.hostReplaced, 'replaced by a new host connection');
    }
    this.ctx.acceptWebSocket(ws, ['host']);
    ws.serializeAttachment(newAttachment('host', HOST_PEER_ID));
  }

  private acceptPlayer(ws: WebSocket): void {
    // 先 accept 才能用 close code 告訴手機為什麼被拒絕；attachment 要先放好，webSocketClose 會讀
    const peer = crypto.randomUUID().slice(0, 8);
    this.ctx.acceptWebSocket(ws, ['player']);
    ws.serializeAttachment(newAttachment('player', peer));

    const host = this.host();
    if (!host) {
      reject(ws, CLOSE.noHost, 'no host in this room');
      return;
    }

    // 超過牽線時限還掛著的手機先踢掉，空出位子
    const now = Date.now();
    let active = 0;
    for (const other of this.players()) {
      if (other === ws) continue;
      if (now - readAttachment(other).joinedAt > LIMITS.playerHandshakeMs) {
        reject(other, CLOSE.handshakeTimeout, 'handshake timeout');
      } else {
        active += 1;
      }
    }
    if (active >= LIMITS.playersPerRoom) {
      reject(ws, CLOSE.roomFull, 'room is full');
      return;
    }

    send(ws, { t: 'welcome', peer });
    send(host, { t: 'peer-joined', peer });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const att = readAttachment(ws);
    const now = Date.now();

    if (typeof raw !== 'string' || raw.length > LIMITS.maxMessageChars) {
      reject(ws, CLOSE.badMessage, 'message must be text and not too long');
      return;
    }

    // 每秒限速
    if (now - att.windowStart >= 1000) {
      att.windowStart = now;
      att.windowCount = 0;
    }
    att.windowCount += 1;
    if (att.windowCount > LIMITS.messagesPerSecond) {
      reject(ws, CLOSE.tooFast, 'too many messages per second');
      return;
    }

    // 總量上限
    att.sent += 1;
    const budget = att.role === 'host' ? LIMITS.hostMessageBudget : LIMITS.playerMessageBudget;
    if (att.sent > budget) {
      reject(ws, CLOSE.tooManyMessages, 'message budget used up');
      return;
    }

    // 手機牽線時限
    if (att.role === 'player' && now - att.joinedAt > LIMITS.playerHandshakeMs) {
      reject(ws, CLOSE.handshakeTimeout, 'handshake timeout');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      reject(ws, CLOSE.badMessage, 'invalid JSON');
      return;
    }
    if (!isClientSignal(parsed)) {
      reject(ws, CLOSE.badMessage, 'unknown message');
      return;
    }

    if (att.role === 'player') {
      ws.serializeAttachment(att);
      const host = this.host();
      if (!host) {
        reject(ws, CLOSE.noHost, 'host left');
        return;
      }
      send(host, { t: 'signal', from: att.peer, data: parsed.data });
      return;
    }

    // 電腦 → 指定的手機
    const target = this.players().find(p => readAttachment(p).peer === parsed.to);
    if (!target) {
      att.stray += 1;
      if (att.stray > LIMITS.hostStrayMessageBudget) {
        reject(ws, CLOSE.badMessage, 'too many messages to unknown peers');
        return;
      }
      ws.serializeAttachment(att);
      return;
    }
    ws.serializeAttachment(att);
    send(target, { t: 'signal', from: HOST_PEER_ID, data: parsed.data });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // compatibility_date >= 2026-04-07 會自動回 Close frame，不用再呼叫 ws.close()
    const att = readAttachment(ws);
    if (att.role !== 'player') return;
    const host = this.host();
    if (host) send(host, { t: 'peer-left', peer: att.peer });
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.warn('signal socket error', readAttachment(ws).role, error);
  }
}
