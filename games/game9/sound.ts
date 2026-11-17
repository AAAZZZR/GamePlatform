// games/game9/sound.ts — Sky Fighter 專用音效
// 能用平台現成的 sfx 就用；缺的（命中、鎖定、風聲）用 platform/audio/engine 的合成基元在這裡做。
import { sfx } from '@/platform/audio';
import { debounce, getCtx, getSfxOut, sweep, tone } from '@/platform/audio/engine';

export const skySfx = {
  gun() {
    sfx.gunBurst();
  },

  /** 子彈打中敵機：短促的「咔」，讓玩家知道有打到 */
  hitTick() {
    debounce('sky-hit', 45, () => {
      tone(2300, 0.03, 'square', 0.05);
      tone(1500, 0.035, 'square', 0.04, 0.02);
    });
  },

  enemyDown() {
    sfx.enemyDestroyed();
  },

  /** 連殺：倍率越高音越高 */
  streak(multiplier: number) {
    const base = 660 + multiplier * 110;
    tone(base, 0.07, 'square', 0.08, 0.28);
    tone(base * 1.5, 0.1, 'square', 0.08, 0.34);
  },

  playerHit() {
    sfx.playerHit();
  },

  playerExplode() {
    sfx.crash();
  },

  /** 鎖定完成：兩聲上升提示音 */
  lockOn() {
    tone(880, 0.05, 'sine', 0.12);
    tone(1320, 0.08, 'sine', 0.12, 0.06);
  },

  /** 敵機正在瞄準你（平台的接近警報，本身有 800ms 節流） */
  aimWarning() {
    sfx.proximityWarn(0.9);
  },

  /** 新一波：語音 "Enemy spotted" + 雷達聲 */
  waveStart() {
    sfx.enemySpotted();
  },

  waveClear() {
    sfx.levelUp();
  },

  gunEmpty() {
    debounce('sky-empty', 350, () => {
      tone(190, 0.05, 'square', 0.06);
    });
  },

  afterburner() {
    debounce('sky-ab', 400, () => {
      sweep(120, 420, 0.35, 'sawtooth', 0.05);
    });
  },
};

/**
 * 持續的風聲：循環噪音 → 帶通濾波 → 音量。
 * 速度越快，濾波頻率越高、音量越大；開後燃器時再加一點低頻轟鳴。
 */
export class WindLoop {
  private source: AudioBufferSourceNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;

  start(): void {
    if (this.source || typeof window === 'undefined') return;
    try {
      const ac = getCtx();
      const length = Math.floor(ac.sampleRate * 2);
      const buffer = ac.createBuffer(1, length, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

      const source = ac.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 400;
      filter.Q.value = 0.7;
      const gain = ac.createGain();
      gain.gain.value = 0;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(getSfxOut());
      source.start();

      this.source = source;
      this.filter = filter;
      this.gain = gain;
    } catch (err) {
      console.warn('[SkyFighter] 風聲音效無法啟動，遊戲照常進行', err);
      this.stop();
    }
  }

  /** speedRatio: 0 = 煞車速度，1 = 後燃器速度 */
  update(speedRatio: number, boosting: boolean): void {
    if (!this.gain || !this.filter) return;
    const t = this.gain.context.currentTime;
    const ratio = Math.max(0, Math.min(1.3, speedRatio));
    const volume = 0.015 + ratio * 0.05 + (boosting ? 0.02 : 0);
    this.gain.gain.setTargetAtTime(volume, t, 0.15);
    this.filter.frequency.setTargetAtTime(280 + ratio * 1100, t, 0.2);
  }

  stop(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch (err) {
        console.warn('[SkyFighter] 停止風聲時出錯', err);
      }
      this.source.disconnect();
    }
    this.filter?.disconnect();
    this.gain?.disconnect();
    this.source = null;
    this.filter = null;
    this.gain = null;
  }
}
