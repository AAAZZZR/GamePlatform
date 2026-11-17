// lib/peer/hostLink.ts — 電腦端：開房間、和每支手機建立 P2P、收手機的輸入
// 牽線 WebSocket 一直留著（沒訊息時伺服器休眠、不計費），讓新手機或斷線的手機能再連進來。
// 遊戲資料只走 P2P DataChannel，不經過伺服器。
import { CLOSE, LIMITS } from '@/lib/signal';
import type { GameMode, PlayerNumber } from '@/types/game';
import {
  CHANNEL_CTRL,
  CHANNEL_INPUT,
  ICE_SERVERS,
  createRoomId,
  isPlayerMessage,
  isServerSignal,
  isSignalPayload,
  parseJson,
  signalUrl,
  type HostMessage,
  type PlayerMessage,
  type SignalPayload,
} from './messages';

export type HostSignalState = 'connecting' | 'open' | 'reconnecting' | 'stopped';

export interface HostSnapshot {
  roomId: string;
  joinLink: string;
  /** P2P 已連上的玩家，由小到大 */
  players: PlayerNumber[];
  signal: HostSignalState;
  /** signal 是 stopped 時的原因 */
  stopReason: 'replaced' | 'daily-limit' | null;
}

type MessageListener = (message: PlayerMessage, playerNumber: PlayerNumber) => void;

interface Peer {
  id: string;
  playerNumber: PlayerNumber;
  pc: RTCPeerConnection;
  ctrl: RTCDataChannel;
  input: RTCDataChannel;
  connected: boolean;
  remoteSet: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  handshakeTimer: ReturnType<typeof setTimeout>;
}

const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 30_000;
const RATE_LIMITED_RETRY_MS = 60_000;
/** 比伺服器的牽線時限多等一下，讓伺服器先判定 */
const HANDSHAKE_GRACE_MS = 5_000;

export class HostLink {
  private readonly roomId = createRoomId();
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly peers = new Map<string, Peer>();
  private readonly messageListeners = new Set<MessageListener>();
  private readonly snapshotListeners = new Set<() => void>();
  private mode: GameMode = 'solo';
  /** 最後一次廣播的畫面和狀態；新手機連上時補送，讓它跟上 */
  private lastGame: HostMessage | null = null;
  private lastStatus: HostMessage | null = null;
  private snapshot: HostSnapshot;

  constructor() {
    this.snapshot = {
      roomId: this.roomId,
      joinLink: `${window.location.origin}/controller?room=${this.roomId}`,
      players: [],
      signal: 'connecting',
      stopReason: null,
    };
    this.connectSignal();
  }

  // ─── 給 React useSyncExternalStore 用 ─────────────────────────────
  getSnapshot = (): HostSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.snapshotListeners.add(listener);
    return () => {
      this.snapshotListeners.delete(listener);
    };
  };

  // ─── 對外 API ─────────────────────────────────────────────────────
  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  /** solo 最多 1 支手機，multi 最多 2 支；只影響之後連進來的手機 */
  setMode(mode: GameMode): void {
    this.mode = mode;
  }

  broadcast(message: HostMessage): void {
    if (message.type === 'game-changed') this.lastGame = message;
    if (message.type === 'game-status') this.lastStatus = message;
    for (const peer of this.peers.values()) {
      if (peer.connected) this.sendCtrl(peer, message);
    }
  }

  // ─── 牽線 WebSocket ───────────────────────────────────────────────
  private connectSignal(): void {
    const ws = new WebSocket(signalUrl(this.roomId, 'host'));
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.updateSnapshot({ signal: 'open' });
    };
    ws.onmessage = event => this.handleServer(parseJson(event.data, 'host-signal'));
    ws.onclose = event => this.handleSignalClose(ws, event.code);
  }

  private handleSignalClose(ws: WebSocket, code: number): void {
    if (this.ws !== ws) return;
    this.ws = null;

    if (code === CLOSE.hostReplaced) {
      this.updateSnapshot({ signal: 'stopped', stopReason: 'replaced' });
      return;
    }
    if (code === CLOSE.dailyLimit) {
      this.updateSnapshot({ signal: 'stopped', stopReason: 'daily-limit' });
      return;
    }

    // 其他情況（網路斷、訊息額度用完、被限流）稍後重連，同一個房號，QR code 不用換
    const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.reconnectAttempts);
    const delay = code === CLOSE.ipLimited ? RATE_LIMITED_RETRY_MS : backoff;
    this.reconnectAttempts += 1;
    this.updateSnapshot({ signal: 'reconnecting' });
    setTimeout(() => this.connectSignal(), delay);
  }

  private handleServer(value: unknown): void {
    if (!isServerSignal(value)) {
      console.warn('[host] ignored unknown server message', value);
      return;
    }
    switch (value.t) {
      case 'peer-joined':
        this.handlePeerJoined(value.peer);
        break;
      case 'peer-left': {
        // 手機 P2P 連上後會自己關掉牽線連線，那是正常的；只有還沒連上就離開才要清掉
        const peer = this.peers.get(value.peer);
        if (peer && !peer.connected) this.dropPeer(peer);
        break;
      }
      case 'signal':
        this.handlePeerSignal(value.from, value.data);
        break;
      case 'welcome':
        break;
    }
  }

  private sendSignal(to: string, data: SignalPayload): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('[host] signal channel not open, dropped', data.kind);
      return;
    }
    this.ws.send(JSON.stringify({ t: 'signal', to, data }));
  }

  // ─── 每支手機的 P2P ───────────────────────────────────────────────
  private handlePeerJoined(id: string): void {
    const maxPlayers = this.mode === 'multi' ? 2 : 1;
    const used = new Set([...this.peers.values()].map(peer => peer.playerNumber));
    const candidates: PlayerNumber[] = [1, 2];
    const free = candidates.find(n => n <= maxPlayers && !used.has(n));
    if (free === undefined) {
      this.sendSignal(id, { kind: 'reject', reason: 'full' });
      return;
    }
    this.startPeer(id, free);
  }

  private startPeer(id: string, playerNumber: PlayerNumber): void {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const ctrl = pc.createDataChannel(CHANNEL_CTRL);
    const input = pc.createDataChannel(CHANNEL_INPUT, { ordered: false, maxRetransmits: 0 });
    const peer: Peer = {
      id,
      playerNumber,
      pc,
      ctrl,
      input,
      connected: false,
      remoteSet: false,
      pendingCandidates: [],
      handshakeTimer: setTimeout(() => {
        if (!peer.connected) this.dropPeer(peer);
      }, LIMITS.playerHandshakeMs + HANDSHAKE_GRACE_MS),
    };
    this.peers.set(id, peer);

    pc.onicecandidate = event => {
      if (event.candidate) this.sendSignal(id, { kind: 'candidate', candidate: event.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.dropPeer(peer);
    };
    ctrl.onopen = () => this.checkConnected(peer);
    input.onopen = () => this.checkConnected(peer);
    ctrl.onclose = () => this.dropPeer(peer);
    ctrl.onmessage = event => this.handlePeerData(peer, event.data);
    input.onmessage = event => this.handlePeerData(peer, event.data);

    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        const sdp = pc.localDescription?.sdp;
        if (!sdp) throw new Error('local description missing after setLocalDescription');
        this.sendSignal(id, { kind: 'offer', sdp });
      })
      .catch(error => {
        console.error('[host] failed to create offer', error);
        this.dropPeer(peer);
      });
  }

  private handlePeerSignal(from: string, data: unknown): void {
    const peer = this.peers.get(from);
    if (!peer) return;
    if (!isSignalPayload(data)) {
      console.warn('[host] ignored unknown signal payload', data);
      return;
    }

    if (data.kind === 'answer') {
      peer.pc
        .setRemoteDescription({ type: 'answer', sdp: data.sdp })
        .then(() => {
          peer.remoteSet = true;
          for (const candidate of peer.pendingCandidates) this.addCandidate(peer, candidate);
          peer.pendingCandidates = [];
        })
        .catch(error => {
          console.error('[host] failed to apply answer', error);
          this.dropPeer(peer);
        });
      return;
    }

    if (data.kind === 'candidate') {
      if (peer.remoteSet) {
        this.addCandidate(peer, data.candidate);
      } else {
        peer.pendingCandidates.push(data.candidate);
      }
    }
  }

  private addCandidate(peer: Peer, candidate: RTCIceCandidateInit): void {
    peer.pc.addIceCandidate(candidate).catch(error => {
      console.warn('[host] rejected ICE candidate', error);
    });
  }

  private checkConnected(peer: Peer): void {
    if (peer.connected) return;
    if (peer.ctrl.readyState !== 'open' || peer.input.readyState !== 'open') return;

    peer.connected = true;
    clearTimeout(peer.handshakeTimer);
    this.sendCtrl(peer, { type: 'assigned', playerNumber: peer.playerNumber, mode: this.mode });
    if (this.lastGame) this.sendCtrl(peer, this.lastGame);
    if (this.lastStatus) this.sendCtrl(peer, this.lastStatus);
    this.refreshPlayers();
  }

  private handlePeerData(peer: Peer, raw: unknown): void {
    const message = parseJson(raw, 'host-p2p');
    if (message === null) return;
    if (!isPlayerMessage(message)) {
      console.warn('[host] ignored unknown player message', message);
      return;
    }
    for (const listener of this.messageListeners) listener(message, peer.playerNumber);
  }

  private sendCtrl(peer: Peer, message: HostMessage): void {
    if (peer.ctrl.readyState !== 'open') return;
    peer.ctrl.send(JSON.stringify(message));
  }

  private dropPeer(peer: Peer): void {
    // pc.close() 會再觸發 ctrl.onclose，用 map 檢查避免重複處理
    if (this.peers.get(peer.id) !== peer) return;
    this.peers.delete(peer.id);
    clearTimeout(peer.handshakeTimer);
    peer.pc.close();
    if (peer.connected) this.refreshPlayers();
  }

  // ─── 狀態快照 ─────────────────────────────────────────────────────
  private refreshPlayers(): void {
    const players = [...this.peers.values()]
      .filter(peer => peer.connected)
      .map(peer => peer.playerNumber)
      .sort((a, b) => a - b);
    this.updateSnapshot({ players });
  }

  private updateSnapshot(patch: Partial<HostSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.snapshotListeners) listener();
  }
}
