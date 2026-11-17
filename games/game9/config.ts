// games/game9/config.ts — Sky Fighter 調校參數（所有數值的單一來源）
// 單位：距離 = 世界單位（機身約 4.5），時間 = 秒，角度 = 弧度

// ─── 飛行手感 ─────────────────────────────────────────────
export const FLIGHT = {
  /** 平台 move.x/y 滿傾斜的值（platform/input.ts 的預設 speed） */
  INPUT_FULL_SCALE: 15,
  /** 傾斜輸入平滑的時間常數：手機 20Hz 一階一階送，用這個抹平 */
  INPUT_SMOOTH_TAU: 0.09,
  /** 反應曲線：0 = 線性，越大中心越細膩、邊緣越快 */
  INPUT_EXPO: 0.45,
  /** 滿傾斜時每秒轉向角 */
  YAW_RATE: 1.9,
  /** 滿傾斜時每秒俯仰角 */
  PITCH_RATE: 1.3,
  /** 最大俯仰角（約 66°），不讓飛機翻圈，鏡頭不會倒過來 */
  PITCH_LIMIT: 1.15,
  /** 沒有俯仰輸入時，機頭慢慢回到水平的速度（1/秒） */
  AUTO_LEVEL_RATE: 0.55,
  /** 視覺傾斜（bank）= 轉向速率 × 這個值 */
  BANK_PER_YAW: 0.5,
  BANK_LIMIT: 0.95,
  BANK_SMOOTH: 6,
  /** 煞車時轉更急、加速時轉比較鈍 */
  BRAKE_TURN_MULT: 1.3,
  BOOST_TURN_MULT: 0.85,
  // 速度（單位/秒）
  CRUISE_SPEED: 95,
  BOOST_SPEED: 155,
  BRAKE_SPEED: 55,
  MAX_SPEED: 185,
  /** 往目標速度靠近的速率（1/秒） */
  BOOST_ACCEL: 1.8,
  BRAKE_ACCEL: 2.6,
  RELAX_ACCEL: 0.9,
  /** 俯衝加速、爬升減速（單位/秒²，垂直時的最大值） */
  DIVE_GAIN: 28,
  CLIMB_LOSS: 18,
};

// ─── 場地 ─────────────────────────────────────────────────
export const WORLD = {
  START_ALTITUDE: 90,
  /** 低於這個高度，能俯衝的角度開始變小，到 DIVE_FLOOR_END 剛好拉平 */
  DIVE_FLOOR_START: 55,
  DIVE_FLOOR_END: 4,
  /** 海面高度：飛機不會撞海，最低貼著海面飛 */
  WATER_ALTITUDE: 2.5,
  /** 低於這個高度高速飛行時，機尾拖出水花 */
  WAKE_ALTITUDE: 9,
  CEILING: 420,
  /** 超過這個半徑 → 警告並自動把機頭轉回中央 */
  ARENA_RADIUS: 1300,
  ARENA_HARD_RADIUS: 1600,
};

// ─── 玩家 ─────────────────────────────────────────────────
export const PLAYER = {
  MAX_HP: 100,
  HITBOX: 2.4,
  /** 血量低於這個比例開始冒煙、HUD 警告 */
  LOW_HP_RATIO: 0.3,
};

// ─── 機砲與瞄準輔助 ───────────────────────────────────────
export const GUN = {
  FIRE_INTERVAL: 0.08,
  BULLET_SPEED: 700,
  BULLET_LIFE: 1.3,
  DAMAGE: 8,
  MAX_AMMO: 60,
  /** 邊射邊回充（每秒） */
  REGEN_FIRING: 4,
  /** 停火一小段時間後快速回充（每秒） */
  REGEN_IDLE: 18,
  REGEN_IDLE_DELAY: 0.6,
  /** 左右翼砲口離機身中線的距離 */
  MUZZLE_OFFSET: 1.4,
  /** 兩側彈道交會的距離 = 準星位置 */
  CONVERGE_DIST: 220,
  /** 鎖定：距離、圓錐半角、需要對準多久 */
  LOCK_RANGE: 520,
  LOCK_CONE: 0.24,
  /** 已鎖定的目標，圓錐放寬到這個倍數才會丟失（避免 20Hz 抖動一直斷鎖） */
  LOCK_KEEP_MULT: 1.7,
  LOCK_TIME: 0.35,
  /** 鎖定後彈道最多自動修正的角度（約 8°） */
  ASSIST_MAX_ANGLE: 0.14,
};

// ─── 敵機種類 ─────────────────────────────────────────────
export type EnemyKind = 'scout' | 'fighter' | 'ace';

export interface EnemySpec {
  hp: number;
  speed: number;
  turnRate: number;
  fireRange: number;
  /** 機頭對準玩家的圓錐半角，進入後才開始「預備射擊」 */
  fireCone: number;
  /** 預備射擊時間：玩家看得到警告、有時間閃 */
  windup: number;
  burstMin: number;
  burstMax: number;
  burstGap: number;
  cooldownMin: number;
  cooldownMax: number;
  spread: number;
  damage: number;
  /** 0 = 瞄玩家現在的位置，1 = 完整計算提前量 */
  leadSkill: number;
  /** 被玩家咬尾時每秒閃避的機率 */
  breakChance: number;
  score: number;
  hitbox: number;
  /** 模型縮放 */
  scale: number;
}

export const ENEMY_SPECS: Record<EnemyKind, EnemySpec> = {
  scout: {
    hp: 8, speed: 75, turnRate: 0.6,
    fireRange: 240, fireCone: 0.17, windup: 0.9,
    burstMin: 3, burstMax: 4, burstGap: 0.11,
    cooldownMin: 2.6, cooldownMax: 3.6,
    spread: 0.06, damage: 4, leadSkill: 0.2, breakChance: 0.2,
    score: 300, hitbox: 3.4, scale: 1.2,
  },
  fighter: {
    hp: 24, speed: 92, turnRate: 0.85,
    fireRange: 280, fireCone: 0.15, windup: 0.7,
    burstMin: 4, burstMax: 5, burstGap: 0.1,
    cooldownMin: 2.0, cooldownMax: 2.8,
    spread: 0.045, damage: 5, leadSkill: 0.5, breakChance: 0.45,
    score: 500, hitbox: 3.4, scale: 1.25,
  },
  ace: {
    hp: 56, speed: 112, turnRate: 1.15,
    fireRange: 320, fireCone: 0.14, windup: 0.55,
    burstMin: 5, burstMax: 6, burstGap: 0.09,
    cooldownMin: 1.6, cooldownMax: 2.2,
    spread: 0.035, damage: 6, leadSkill: 0.85, breakChance: 0.9,
    score: 1000, hitbox: 3.7, scale: 1.35,
  },
};

export const ENEMY = {
  BULLET_SPEED: 430,
  BULLET_LIFE: 1.0,
  /** 同時存在的敵機上限（也是 3D 模型的格數） */
  MAX_SLOTS: 6,
  SPAWN_DIST_MIN: 480,
  SPAWN_DIST_MAX: 580,
  MIN_ALTITUDE: 45,
  MAX_ALTITUDE: 300,
  /** 迎頭交錯距離小於這個 → 先拉開再回頭，不會一直對撞 */
  EXTEND_DIST: 70,
  /**
   * 追擊加速：追擊中離玩家越遠飛越快（最多 +70%），慢速敵機才追得上直線逃跑的玩家。
   * 偵察機追不上開後燃器的玩家、王牌追得上，煞車會讓追兵衝過頭。
   */
  CHASE_BOOST_START: 120,
  CHASE_BOOST_RANGE: 250,
  CHASE_BOOST_MAX: 0.7,
  /** 相撞距離 */
  RAM_DIST: 4,
  RAM_DAMAGE: 30,
};

// ─── 波次與計分 ───────────────────────────────────────────
export interface WaveSpec {
  kinds: EnemyKind[];
  /** 同時在場上的敵機數 */
  concurrent: number;
  /** 第 6 波以後的血量／轉向加成 */
  hpMult: number;
  turnMult: number;
}

const OPENING_WAVES: Omit<WaveSpec, 'hpMult' | 'turnMult'>[] = [
  { kinds: ['scout', 'scout'], concurrent: 1 },
  { kinds: ['scout', 'scout', 'scout'], concurrent: 2 },
  { kinds: ['scout', 'fighter', 'scout'], concurrent: 2 },
  { kinds: ['fighter', 'scout', 'fighter', 'scout'], concurrent: 2 },
  { kinds: ['fighter', 'fighter', 'ace'], concurrent: 3 },
];

export function getWaveSpec(wave: number): WaveSpec {
  if (wave <= OPENING_WAVES.length) {
    return { ...OPENING_WAVES[wave - 1], hpMult: 1, turnMult: 1 };
  }
  // 第 6 波起：數量、王牌比例、能力慢慢往上加，有上限
  const extra = wave - OPENING_WAVES.length;
  const count = Math.min(3 + Math.floor((extra + 1) / 2), 8);
  const aces = Math.min(Math.floor((extra + 2) / 3), Math.floor(count / 3));
  const fighters = Math.ceil((count - aces) * 0.6);
  const scouts = count - aces - fighters;
  const kinds: EnemyKind[] = [];
  for (let i = 0; i < scouts; i++) kinds.push('scout');
  for (let i = 0; i < fighters; i++) kinds.push('fighter');
  for (let i = 0; i < aces; i++) kinds.push('ace');
  return {
    kinds,
    concurrent: Math.min(4, 3 + Math.floor(extra / 4)),
    hpMult: Math.min(1 + extra * 0.06, 1.6),
    turnMult: Math.min(1 + extra * 0.03, 1.3),
  };
}

export const WAVES = {
  /** 開局後第一波來之前的準備時間 */
  FIRST_DELAY: 1.5,
  /** 清完一波後的休息時間 */
  BREAK_TIME: 3.5,
  /** 清完一波修復的血量 */
  REPAIR_HP: 20,
  /** 清完一波的獎勵分 = 這個 × 波數 */
  CLEAR_BONUS_PER_WAVE: 250,
  SPAWN_GAP_MIN: 1.2,
  SPAWN_GAP_MAX: 2.5,
};

export const SCORING = {
  /** 擊落後這段時間內再擊落 → 連殺 */
  STREAK_WINDOW: 8,
  MAX_MULTIPLIER: 4,
};

// ─── 畫面 ─────────────────────────────────────────────────
export const VIEW = {
  /** 玩家死後到 GAME_OVER 的「墜落鏡頭」時間 */
  DEATH_CAM_TIME: 1.6,
  CAMERA_DIST: 11,
  CAMERA_HEIGHT: 3.2,
  CAMERA_LOOK_AHEAD: 40,
  FOV_BASE: 68,
  FOV_BOOST: 14,
  FOV_BRAKE: 5,
  RADAR_RANGE: 700,
};

export const COLORS = {
  skyZenith: '#4fa6dc',
  skyHorizon: '#bfe6f3',
  ocean: '#1a8caa',
  oceanGrid: '#3ab8d4',
  sun: '#fff6dc',
  playerBody: '#00ccff',
  playerWing: '#4fdcff',
  playerAccent: '#0a6f99',
  playerTracer: '#fff27a',
  enemyTracer: '#ff5a1f',
  hud: '#7ff3ff',
  enemyHud: '#ff4a2a',
  warn: '#ffb020',
};

export interface Palette {
  body: string;
  wing: string;
  accent: string;
  glow: string;
}

export const PLAYER_PALETTE: Palette = {
  body: COLORS.playerBody,
  wing: COLORS.playerWing,
  accent: COLORS.playerAccent,
  glow: '#00ffff',
};

export const ENEMY_PALETTES: Record<EnemyKind, Palette> = {
  scout: { body: '#ff3300', wing: '#cc2200', accent: '#991a00', glow: '#ff4400' },
  fighter: { body: '#b8331c', wing: '#4a1a14', accent: '#2a0f0c', glow: '#ff6a00' },
  ace: { body: '#2a2a33', wing: '#1c1c22', accent: '#ffb020', glow: '#ffcc33' },
};
