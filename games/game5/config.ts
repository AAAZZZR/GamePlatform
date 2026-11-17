// games/game5/config.ts — Tilt to Live 的數值設定與道具定義（電腦端、手機端共用的單一來源）

// ─── 數值設定 ─────────────────────────────────────────────────────────
// 長度和速度都用「u」當單位：u = 畫面短邊 / REFERENCE_SHORT_SIDE。
// 這樣筆電、電視、/dev 小視窗看到的比例和難度都一樣，不會因為螢幕大就變簡單。
export const TUNING = {
  REFERENCE_SHORT_SIDE: 700,
  UNIT_MIN: 0.55,
  UNIT_MAX: 2.4,

  // 玩家
  INPUT_FULL_TILT: 15, // 平台送來的 move 在預設設定下傾到底是 ±15
  PLAYER_SPEED: 600, // 傾到底的移動速度（u/s）
  INPUT_SMOOTHING: 0.06, // 速度平滑的時間常數（秒），把 20Hz 的階梯輸入抹平
  PLAYER_DRAW: 14, // 箭頭半長（u）
  PLAYER_HIT: 7, // 玩家判定半徑（u），比外觀小，擦邊不算死
  TRAIL_LENGTH: 14,

  // 敵人
  ENEMY_RADIUS: 7.5,
  ENEMY_HIT: 6,
  ENEMY_SPEED_START: 60,
  ENEMY_SPEED_END: 140,
  ENEMY_SPEED_MAX: 175,
  ENEMY_SEPARATION: 2.6, // 敵人彼此保持的距離（× 敵人半徑），避免疊成一顆
  MAX_ENEMIES: 220,
  SPAWN_TELEGRAPH: 1.0, // 場內出現的敵人先閃爍預告幾秒（無害）
  SWARM_WARNING: 0.9, // 成群敵人進場前，邊緣先亮紅光幾秒
  SAFE_SPAWN_DISTANCE: 0.45, // 敵人出生點離玩家至少多遠（× 畫面短邊）

  // 難度曲線
  RAMP_SECONDS: 150, // 前 150 秒從簡單爬到全強度，之後再慢慢加
  WAVE_SECONDS: 15, // 每 15 秒一個 WAVE
  SWARM_FROM: 15, // 第 15 秒開始會有成群敵人
  RING_FROM: 45, // 第 45 秒開始會有包圍圈
  RING_COOLDOWN: 10,

  // 道具
  POWERUP_RADIUS: 15,
  POWERUP_PICKUP: 24,
  POWERUP_LIFETIME: 10,
  POWERUP_BLINK: 3, // 消失前幾秒開始閃
  MAX_POWERUPS: 3,
  FIRST_POWERUP_AT: 3,
  MISSILE_COUNT: 10,
  MISSILE_SPEED: 560,
  MISSILE_TURN: 9, // 追蹤飛彈轉向速度（rad/s）
  MISSILE_LIFETIME: 2.4,
  MISSILE_RADIUS: 4,
  NUKE_FROM: 60,
  NUKE_COOLDOWN: 30,
  NUKE_SPEED: 1500, // 核彈衝擊波擴散速度（u/s）
  FREEZE_DURATION: 3.5,
  VORTEX_DURATION: 2.5,
  VORTEX_RADIUS: 190,
  VORTEX_KILL: 20,
  SPEED_DURATION: 5,
  SPEED_BOOST: 1.45,
  BUZZSAW_DURATION: 4.5,
  BUZZSAW_RADIUS: 32,
  BUZZSAW_GRACE: 0.6, // 電鋸結束後短暫無敵，避免剛結束就被身邊的敵人撞死

  // 分數
  KILL_POINTS: 10,
  SURVIVE_POINTS: 1, // 每存活 1 秒
  COMBO_WINDOW: 1.6, // 擊破間隔在這個秒數內就算連擊
  COMBO_STEP: 5, // 每 5 連擊倍率 +1
  MAX_MULTIPLIER: 5,

  // 演出
  DEATH_DURATION: 1.1, // 死亡爆炸演出多久之後才回報 GAME_OVER
  MAX_PARTICLES: 900,
  MAX_FLOATERS: 30,
} as const;

export const COLORS = {
  player: '#67e8f9',
  playerEdge: '#a5f3fc',
  enemy: '#ef4444',
  danger: '#f87171',
  hud: '#e0f2fe',
  accent: '#22d3ee',
} as const;

// ─── 道具 ─────────────────────────────────────────────────────────────
export type PowerupType = 'missile' | 'freeze' | 'vortex' | 'speed' | 'buzzsaw' | 'nuke';

/** 24×24 viewBox 的 SVG path；畫布用 Path2D、手機和 READY 畫面用 <svg>，同一份資料 */
export interface IconShape {
  d: string;
  fill: boolean; // true = 填色，false = 描邊
  rule: 'nonzero' | 'evenodd';
}

export interface PowerupInfo {
  name: string;
  hint: string;
  color: string;
  weight: number; // 隨機出現的權重
  icon: IconShape;
}

export const ICON_STROKE = 2.2;

function polar(radius: number, angleDeg: number): string {
  const rad = (angleDeg * Math.PI) / 180;
  const x = 12 + radius * Math.cos(rad);
  const y = 12 + radius * Math.sin(rad);
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
}

/** 輻射標誌：三片 60° 扇形 + 中心圓點 */
function buildTrefoilPath(): string {
  const outer = 10.5;
  const inner = 3.4;
  const parts: string[] = [];
  for (const center of [-90, 30, 150]) {
    const a0 = center - 30;
    const a1 = center + 30;
    parts.push(
      `M${polar(inner, a0)}L${polar(outer, a0)}A${outer} ${outer} 0 0 1 ${polar(outer, a1)}` +
        `L${polar(inner, a1)}A${inner} ${inner} 0 0 0 ${polar(inner, a0)}Z`,
    );
  }
  parts.push('M14.2 12A2.2 2.2 0 1 1 9.8 12A2.2 2.2 0 1 1 14.2 12Z');
  return parts.join('');
}

/** 圓鋸片：斜齒外圈 + 中間的孔（evenodd 挖空） */
function buildSawPath(): string {
  const teeth = 10;
  const step = 360 / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const base = i * step;
    d += i === 0 ? `M${polar(7.6, base)}` : `L${polar(7.6, base)}`;
    d += `L${polar(11.2, base + step * 0.28)}`;
  }
  d += 'Z';
  d += 'M15 12A3 3 0 1 1 9 12A3 3 0 1 1 15 12Z';
  return d;
}

export const POWERUPS: Record<PowerupType, PowerupInfo> = {
  missile: {
    name: 'MISSILES',
    hint: 'Homing rockets',
    color: '#3b82f6',
    weight: 22,
    icon: {
      d: 'M12 2C15 5 16.2 9 15.6 15H8.4C7.8 9 9 5 12 2Z' + 'M8.6 11L5.4 15.6V19L8.6 16.4Z' + 'M15.4 11L18.6 15.6V19L15.4 16.4Z' + 'M10 16.6H14L12 21.5Z',
      fill: true,
      rule: 'nonzero',
    },
  },
  freeze: {
    name: 'FREEZE',
    hint: 'Freeze, then smash',
    color: '#22c55e',
    weight: 18,
    icon: {
      d:
        'M12 2.5V21.5M3.8 7.25L20.2 16.75M3.8 16.75L20.2 7.25' +
        'M9.4 3.9L12 6.2L14.6 3.9M9.4 20.1L12 17.8L14.6 20.1' +
        'M3.6 10.4L6.9 9.4L6.1 6M20.4 13.6L17.1 14.6L17.9 18' +
        'M6.1 18L6.9 14.6L3.6 13.6M17.9 6L17.1 9.4L20.4 10.4',
      fill: false,
      rule: 'nonzero',
    },
  },
  vortex: {
    name: 'VORTEX',
    hint: 'Sucks dots in',
    color: '#a855f7',
    weight: 14,
    icon: {
      d: 'M10.5 12a1.5 1.5 0 0 1 3 0a3 3 0 0 1-6 0a4.5 4.5 0 0 1 9 0a6 6 0 0 1-12 0a7.5 7.5 0 0 1 15 0',
      fill: false,
      rule: 'nonzero',
    },
  },
  speed: {
    name: 'SPEED',
    hint: 'Move faster',
    color: '#f97316',
    weight: 12,
    icon: { d: 'M4.5 5.5L11 12L4.5 18.5M12.5 5.5L19 12L12.5 18.5', fill: false, rule: 'nonzero' },
  },
  buzzsaw: {
    name: 'BUZZSAW',
    hint: 'Touch to destroy',
    color: '#ec4899',
    weight: 16,
    icon: { d: buildSawPath(), fill: true, rule: 'evenodd' },
  },
  nuke: {
    name: 'NUKE',
    hint: 'Clears the screen',
    color: '#eab308',
    weight: 6,
    icon: { d: buildTrefoilPath(), fill: true, rule: 'nonzero' },
  },
};

/** 說明畫面、手機圖例的排列順序 */
export const POWERUP_ORDER: PowerupType[] = ['missile', 'freeze', 'vortex', 'speed', 'buzzsaw', 'nuke'];
