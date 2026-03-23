// platform/audio/sfx.ts — 所有遊戲音效
// 全部用 Web Audio API 即時合成，零音檔

import { tone, noise, sweep, debounce } from './engine';

export const sfx = {
  // ━━━ 通用 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 遊戲開始短旋律 */
  start() {
    tone(523, 0.1, 'square', 0.2);
    tone(659, 0.1, 'square', 0.2, 0.1);
    tone(784, 0.15, 'square', 0.25, 0.2);
  },

  /** Game Over 下降旋律 */
  gameOver() {
    tone(392, 0.25, 'square', 0.2);
    tone(330, 0.25, 'square', 0.2, 0.2);
    tone(277, 0.25, 'square', 0.2, 0.4);
    tone(220, 0.6, 'sawtooth', 0.15, 0.6);
  },

  // ━━━ Game 1: Rocket Shooter ━━━━━━━━━━━━━━━━━━━

  /** 發射子彈 — 高頻下掃 */
  shoot() {
    sweep(1200, 300, 0.08, 'square', 0.1);
  },

  /** 隕石爆炸 — 噪音 + 低頻衝擊 */
  explosion() {
    debounce('explosion', 50, () => {
      noise(0.25, 1500, 0.2);
      tone(100, 0.2, 'sine', 0.25);
    });
  },

  /** 撿到強化道具 — 上升琶音 */
  powerup() {
    tone(523, 0.07, 'square', 0.15);
    tone(659, 0.07, 'square', 0.15, 0.06);
    tone(784, 0.07, 'square', 0.15, 0.12);
    tone(1047, 0.12, 'square', 0.2, 0.18);
  },

  // ━━━ Game 2: Space Brick ━━━━━━━━━━━━━━━━━━━━━

  /** 球碰擋板 */
  paddleHit() {
    tone(440, 0.06, 'square', 0.12);
  },

  /** 磚塊破壞 — 音高隨列數變化 */
  brickBreak(row = 0) {
    debounce('brick', 30, () => {
      const f = 350 + row * 80;
      tone(f, 0.08, 'square', 0.15);
      tone(f * 1.5, 0.05, 'square', 0.08, 0.02);
    });
  },

  /** 過關 — 上升琶音 */
  levelUp() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      tone(f, 0.12, 'square', 0.18, i * 0.08),
    );
  },

  /** 球掉落 — 下降音 */
  ballLost() {
    tone(300, 0.15, 'triangle', 0.1);
    tone(200, 0.2, 'triangle', 0.08, 0.1);
  },

  // ━━━ Game 3: Neon Racing ━━━━━━━━━━━━━━━━━━━━━

  /** 撿金幣 — 經典叮咚 */
  coin() {
    tone(988, 0.06, 'square', 0.12);
    tone(1319, 0.1, 'square', 0.18, 0.06);
  },

  /** 撞車 — 噪音 + 衝擊 */
  crash() {
    noise(0.5, 2000, 0.3);
    sweep(300, 40, 0.4, 'sawtooth', 0.2);
  },

  /** 氮氣啟動 — 上升嘯音 */
  nitroOn() {
    sweep(200, 800, 0.2, 'sawtooth', 0.12);
    noise(0.25, 4000, 0.08, 'highpass');
  },

  /** 氮氣結束 — 下降嘯音 */
  nitroOff() {
    sweep(600, 200, 0.15, 'sawtooth', 0.08);
  },

  // ━━━ Game 4: Snake ━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 吃食物 */
  eat() {
    tone(500, 0.06, 'square', 0.15);
    tone(700, 0.08, 'square', 0.12, 0.04);
  },

  /** 吃特殊食物 — 閃亮上升 */
  eatSpecial() {
    tone(600, 0.06, 'square', 0.15);
    tone(800, 0.06, 'square', 0.15, 0.05);
    tone(1000, 0.06, 'square', 0.15, 0.1);
    tone(1200, 0.1, 'square', 0.2, 0.15);
  },

  /** 加速衝刺 */
  snakeBoost() {
    sweep(300, 700, 0.15, 'square', 0.1);
  },

  /** 轉向 — 細微咔嗒 */
  turn() {
    tone(660, 0.025, 'square', 0.04);
  },

  // ━━━ Game 9: Sky Fighter ━━━━━━━━━━━━━━━━━━━━━━

  /** 機砲連射 — 快速高頻噠噠 */
  gunBurst() {
    debounce('gun', 60, () => {
      sweep(2000, 600, 0.04, 'square', 0.07);
    });
  },

  /** 玩家被擊中 — 低頻衝擊 */
  playerHit() {
    noise(0.12, 800, 0.18);
    tone(120, 0.12, 'sine', 0.2);
  },

  /** 彈藥補給 — 上升琶音 */
  ammoPickup() {
    tone(523, 0.06, 'square', 0.12);
    tone(659, 0.06, 'square', 0.12, 0.06);
    tone(784, 0.08, 'square', 0.15, 0.12);
  },

  /** 敵機擊毀 — 爆炸 + 短旋律 */
  enemyDestroyed() {
    noise(0.35, 1200, 0.22);
    tone(80, 0.25, 'sine', 0.2);
    tone(523, 0.06, 'square', 0.08, 0.15);
    tone(784, 0.06, 'square', 0.08, 0.2);
  },

  // ━━━ Game 10: Skeet Shooter ━━━━━━━━━━━━━━━━━━━━━

  /** Shotgun blast */
  shotgunBlast() {
    noise(0.15, 3000, 0.25);
    tone(80, 0.2, 'sine', 0.3);
    sweep(800, 100, 0.1, 'sawtooth', 0.08);
  },

  /** Disc shatter */
  discShatter() {
    debounce('shatter', 40, () => {
      noise(0.1, 6000, 0.15, 'highpass');
      tone(1800, 0.05, 'square', 0.1);
      tone(2400, 0.04, 'square', 0.08, 0.03);
    });
  },

  /** Disc launch whoosh */
  discLaunch() {
    sweep(200, 600, 0.25, 'sawtooth', 0.08);
    noise(0.2, 2000, 0.06, 'highpass');
  },

  /** Shot miss */
  shotMiss() {
    tone(150, 0.15, 'triangle', 0.06);
  },

  /** Pull acknowledgement */
  pullAck() {
    tone(400, 0.03, 'square', 0.1);
    tone(300, 0.04, 'square', 0.08, 0.03);
  },
};
