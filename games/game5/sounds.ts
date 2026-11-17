// games/game5/sounds.ts — Tilt to Live 專用音效
// 用平台 audio 引擎（platform/audio）匯出的合成基元組出來，不另外放音檔。
import { sfx } from '@/platform/audio';
import { debounce, noise, sweep, tone } from '@/platform/audio/engine';
import type { PowerupType } from './config';

// 連擊音高：五聲音階往上爬，連越多越高
const COMBO_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

// 音效失敗不該讓遊戲迴圈停掉；同一種音效只警告一次，避免每幀洗版
const reportedFailures = new Set<string>();

function play(name: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    if (!reportedFailures.has(name)) {
      reportedFailures.add(name);
      console.warn(`[TiltToLive] 音效「${name}」播放失敗`, err);
    }
  }
}

export const sounds = {
  start(): void {
    play('start', () => sfx.start());
  },

  /** 擊破一顆敵人；combo 越高音越高 */
  kill(combo: number): void {
    play('kill', () =>
      debounce('tilt-kill', 40, () => {
        const step = COMBO_STEPS[Math.min(Math.max(combo - 1, 0), COMBO_STEPS.length - 1)];
        const freq = 440 * Math.pow(2, step / 12);
        tone(freq, 0.07, 'square', 0.08);
        noise(0.05, 2500, 0.06);
      }),
    );
  },

  /** 撞碎冰凍的敵人 */
  shatter(): void {
    play('shatter', () => sfx.discShatter());
  },

  /** 冰凍結束、全部碎掉 */
  massShatter(): void {
    play('massShatter', () => {
      noise(0.45, 5000, 0.2, 'highpass');
      tone(2400, 0.08, 'square', 0.08);
      tone(1800, 0.12, 'square', 0.07, 0.05);
    });
  },

  pickup(type: PowerupType): void {
    play(`pickup-${type}`, () => {
      sfx.powerup();
      switch (type) {
        case 'missile':
          sweep(300, 1400, 0.3, 'sawtooth', 0.08);
          noise(0.3, 3000, 0.08, 'highpass');
          break;
        case 'freeze':
          tone(1568, 0.3, 'triangle', 0.12);
          tone(2093, 0.4, 'triangle', 0.1, 0.06);
          noise(0.3, 7000, 0.06, 'highpass');
          break;
        case 'vortex':
          sweep(700, 70, 0.9, 'sine', 0.22);
          sweep(350, 45, 0.9, 'triangle', 0.12, 0.05);
          break;
        case 'speed':
          sfx.nitroOn();
          break;
        case 'buzzsaw':
          sweep(180, 900, 0.35, 'sawtooth', 0.1);
          noise(0.35, 4000, 0.06, 'highpass');
          break;
        case 'nuke':
          sfx.crash();
          tone(55, 0.9, 'sine', 0.35);
          break;
      }
    });
  },

  /** 新道具出現：輕輕一聲提醒玩家看一下 */
  powerupSpawn(): void {
    play('powerupSpawn', () => {
      tone(880, 0.05, 'sine', 0.05);
      tone(1320, 0.08, 'sine', 0.05, 0.05);
    });
  },

  /** 新的 WAVE */
  wave(): void {
    play('wave', () => {
      tone(392, 0.12, 'triangle', 0.14);
      tone(587, 0.2, 'triangle', 0.14, 0.1);
    });
  },

  /** 成群敵人或包圍圈要出現了 */
  warn(): void {
    play('warn', () => {
      sweep(160, 330, 0.35, 'triangle', 0.12);
      sweep(160, 330, 0.35, 'triangle', 0.1, 0.2);
    });
  },

  /** 電鋸剩 1 秒 */
  sawEnding(): void {
    play('sawEnding', () => {
      tone(1200, 0.05, 'square', 0.07);
      tone(1200, 0.05, 'square', 0.07, 0.14);
    });
  },

  /** 漩渦收縮爆開 */
  vortexEnd(): void {
    play('vortexEnd', () => {
      sweep(260, 50, 0.4, 'sine', 0.2);
      noise(0.25, 900, 0.14);
    });
  },

  /** 玩家被撞 */
  death(): void {
    play('death', () => {
      noise(0.7, 1600, 0.32);
      sweep(420, 35, 0.8, 'sawtooth', 0.2);
      tone(70, 0.6, 'sine', 0.3);
    });
  },
};
