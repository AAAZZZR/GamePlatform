// lib/peer/playerLink.ts — 手機端：連上房間、和電腦建立 P2P、送陀螺儀和按鈕
// P2P 一連上就關掉牽線 WebSocket，之後完全不經過伺服器。
// 連不上不會改走伺服器：直接告訴玩家原因（通常是手機和電腦不在同一個 Wi-Fi）。
import { CLOSE, LIMITS } from '@/lib/signal';
import type { GameId, GameMode, PlayerNumber } from '@/types/game';
import {
  CHANNEL_CTRL,
  CHANNEL_INPUT,
  ICE_SERVERS,
  isHostMessage,
  isServerSignal,
  isSignalPayload,
  parseJson,
  signalUrl,
  type HostMessage,
  type PlayerMessage,
  type SignalPayload,
} from './messages';

export type PlayerFailReason =
  | 'unreachable' // 牽線逾時或 P2P 打不通：通常是不在同一個 Wi-Fi
  | 'room-full'
  | 'no-host' // 電腦端的頁面已經關掉
  | 'rate-limited'
  | 'daily-limit'
  | 'lost' // 玩到一半 P2P 斷了
  | 'error';

export type PlayerLinkState =
  | { status: 'connecting' }
  | { status: 'connected'; playerNumber: PlayerNumber; mode: GameMode }
  | { status: 'failed'; reason: PlayerFailReason };

type MessageListener = (message: HostMessage) => void;

/** WebSocket 被伺服器關掉的代碼 → 失敗原因；null 代表不用因此判定失敗 */
function reasonForClose(code: number, p2pStarted: boolean): PlayerFailReason | null {
  switch (code) {
    case CLOSE.roomFull:
      return 'room-full';
    case CLOSE.noHost:
      return 'no-host';
    case CLOSE.ipLimited:
      return 'rate-limited';
    case CLOSE.dailyLimit:
      return 'daily-limit';
    case CLOSE.handshakeTimeout:
      return 'unreachable';
    case 1000:
      return null;
    default:
      // 牽線已經交換過，P2P 可能還在打洞，交給逾時或 P2P 的結果判定
      return p2pStarted ? null : 'error';
  }
}

export class PlayerLink {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private ctrl: RTCDataChannel | null = null;
  private input: RTCDataChannel | null = null;
  private remoteSet = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  /** 每次重新連線加一；舊連線的回呼看到不一樣就忽略 */
  private attempt = 0;
  private state: PlayerLinkState = { status: 'connecting' };
  private readonly stateListeners = new Set<() => void>();
  private readonly messageListeners = new Set<MessageListener>();

  constructor(readonly roomId: string) {
    this.start();
  }

  // ─── 給 React useSyncExternalStore 用 ─────────────────────────────
  getSnapshot = (): PlayerLinkState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  };

  // ─── 對外 API ─────────────────────────────────────────────────────
  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  retry(): void {
    this.cleanup();
    this.start();
  }

  close(): void {
    this.attempt += 1;
    this.cleanup();
  }

  sendGyro(beta: number, gamma: number): void {
    this.sendP2P(this.input, { type: 'gyro', beta, gamma });
  }

  sendAction(action: string): void {
    this.sendP2P(this.ctrl, { type: 'action', action });
  }

  selectGame(gameId: GameId): void {
    this.sendP2P(this.ctrl, { type: 'select-game', gameId });
  }

  // ─── 連線流程 ─────────────────────────────────────────────────────
  private start(): void {
    this.attempt += 1;
    const attempt = this.attempt;
    this.setState({ status: 'connecting' });

    const ws = new WebSocket(signalUrl(this.roomId, 'player'));
    this.ws = ws;
    ws.onmessage = event => {
      if (attempt === this.attempt) this.handleServer(parseJson(event.data, 'player-signal'));
    };
    ws.onclose = event => {
      if (attempt === this.attempt) this.handleSignalClose(event.code);
    };
    this.handshakeTimer = setTimeout(() => {
      if (attempt === this.attempt && this.state.status === 'connecting') this.fail('unreachable');
    }, LIMITS.playerHandshakeMs);
  }

  private handleSignalClose(code: number): void {
    this.ws = null;
    if (this.state.status !== 'connecting') return;
    const reason = reasonForClose(code, this.pc !== null);
    if (reason) this.fail(reason);
  }

  private handleServer(value: unknown): void {
    if (!isServerSignal(value)) {
      console.warn('[player] ignored unknown server message', value);
      return;
    }
    if (value.t !== 'signal') return;

    const data = value.data;
    if (!isSignalPayload(data)) {
      console.warn('[player] ignored unknown signal payload', data);
      return;
    }
    switch (data.kind) {
      case 'reject':
        this.fail('room-full');
        break;
      case 'offer':
        this.acceptOffer(data.sdp);
        break;
      case 'candidate':
        if (this.pc && this.remoteSet) {
          this.addCandidate(data.candidate);
        } else {
          this.pendingCandidates.push(data.candidate);
        }
        break;
      case 'answer':
        console.warn('[player] unexpected answer from host');
        break;
    }
  }

  private acceptOffer(sdp: string): void {
    if (this.pc) {
      console.warn('[player] ignored duplicate offer');
      return;
    }
    const attempt = this.attempt;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;

    pc.onicecandidate = event => {
      if (event.candidate) this.sendSignal({ kind: 'candidate', candidate: event.candidate.toJSON() });
    };
    pc.ondatachannel = event => {
      if (attempt === this.attempt) this.attachChannel(event.channel, attempt);
    };
    pc.onconnectionstatechange = () => {
      if (attempt !== this.attempt || pc.connectionState !== 'failed') return;
      this.fail(this.state.status === 'connected' ? 'lost' : 'unreachable');
    };

    pc.setRemoteDescription({ type: 'offer', sdp })
      .then(() => {
        this.remoteSet = true;
        for (const candidate of this.pendingCandidates) this.addCandidate(candidate);
        this.pendingCandidates = [];
        return pc.createAnswer();
      })
      .then(answer => pc.setLocalDescription(answer))
      .then(() => {
        const local = pc.localDescription?.sdp;
        if (!local) throw new Error('local description missing after setLocalDescription');
        this.sendSignal({ kind: 'answer', sdp: local });
      })
      .catch(error => {
        console.error('[player] failed to answer offer', error);
        if (attempt === this.attempt) this.fail('error');
      });
  }

  private addCandidate(candidate: RTCIceCandidateInit): void {
    this.pc?.addIceCandidate(candidate).catch(error => {
      console.warn('[player] rejected ICE candidate', error);
    });
  }

  private attachChannel(channel: RTCDataChannel, attempt: number): void {
    if (channel.label === CHANNEL_CTRL) {
      this.ctrl = channel;
    } else if (channel.label === CHANNEL_INPUT) {
      this.input = channel;
    } else {
      console.warn('[player] ignored unknown data channel', channel.label);
      return;
    }
    channel.onmessage = event => {
      if (attempt === this.attempt) this.handleHostData(event.data);
    };
    channel.onclose = () => {
      if (attempt === this.attempt && this.state.status === 'connected') this.fail('lost');
    };
  }

  private handleHostData(raw: unknown): void {
    const message = parseJson(raw, 'player-p2p');
    if (message === null) return;
    if (!isHostMessage(message)) {
      console.warn('[player] ignored unknown host message', message);
      return;
    }
    // 電腦在兩條 channel 都開好之後才送 assigned，收到就代表 P2P 通了
    if (message.type === 'assigned') this.markConnected(message.playerNumber, message.mode);
    for (const listener of this.messageListeners) listener(message);
  }

  private markConnected(playerNumber: PlayerNumber, mode: GameMode): void {
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
    this.setState({ status: 'connected', playerNumber, mode });
    // P2P 通了，牽線連線用不到了，關掉省伺服器額度
    this.ws?.close(1000, 'p2p connected');
    this.ws = null;
  }

  private sendSignal(data: SignalPayload): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      // P2P 連上後才冒出來的 ICE 候選，丟掉是正常的
      if (this.state.status !== 'connected') console.warn('[player] signal channel not open, dropped', data.kind);
      return;
    }
    this.ws.send(JSON.stringify({ t: 'signal', data }));
  }

  private sendP2P(channel: RTCDataChannel | null, message: PlayerMessage): void {
    if (channel?.readyState !== 'open') return;
    channel.send(JSON.stringify(message));
  }

  private fail(reason: PlayerFailReason): void {
    if (this.state.status === 'failed') return;
    // 先改狀態，cleanup 觸發的 onclose 看到已失敗就不會再處理
    this.setState({ status: 'failed', reason });
    this.cleanup();
  }

  private cleanup(): void {
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
    this.ctrl = null;
    this.input = null;
    this.pc?.close();
    this.pc = null;
    this.remoteSet = false;
    this.pendingCandidates = [];
    this.ws?.close(1000, 'cleanup');
    this.ws = null;
  }

  private setState(state: PlayerLinkState): void {
    this.state = state;
    for (const listener of this.stateListeners) listener();
  }
}
