// games/game5/engine.ts — Tilt to Live 的遊戲世界：狀態、移動、生怪、道具、碰撞、計分
// 純邏輯，不碰 React 和 DOM。畫面在 render.ts，元件接線在 index.tsx。
// 所有計時都用「遊戲時鐘」（每幀加 dt），暫停時不走，恢復後不會一口氣補一大波怪。

import { COLORS, POWERUPS, POWERUP_ORDER, TUNING as T, type PowerupType } from './config';
import { sounds } from './sounds';

export interface Vec2 {
  x: number;
  y: number;
}

/** ready：開始前可以先試著傾斜；dying：死亡爆炸演出中；over：結束畫面 */
export type Phase = 'ready' | 'playing' | 'dying' | 'over';

type KillCause = 'missile' | 'nuke' | 'shatter' | 'vortex' | 'buzzsaw';

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // 箭頭朝向（弧度）
  trail: Vec2[];
}

export interface Enemy {
  x: number;
  y: number;
  heading: number;
  speedMul: number; // 每顆速度略有差異，群體才不會整齊劃一
  spawnLeft: number; // > 0：還在出現預告中（無害、不動）
  frozen: boolean;
  alive: boolean;
}

export interface Powerup {
  x: number;
  y: number;
  type: PowerupType;
  age: number;
  alive: boolean;
}

export interface Missile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  target: Enemy | null;
  alive: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  drag: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number; // u
  life: number;
  maxLife: number;
}

export interface Ring {
  x: number;
  y: number;
  color: string;
  radius: number; // 最終半徑
  width: number;
  life: number;
  maxLife: number;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
}

export interface Vortex {
  x: number;
  y: number;
  left: number;
}

/** 已預告、還沒進場的一群敵人 */
export interface PendingSwarm {
  at: number;
  side: Side;
  along: number; // 0..1，沿著那條邊的位置
  count: number;
}

export interface World {
  w: number;
  h: number;
  unit: number;
  phase: Phase;
  clock: number; // 本局經過秒數（只在 playing 時走）
  time: number; // 動畫用的秒數（暫停以外都會走）
  player: Player;
  enemies: Enemy[];
  powerups: Powerup[];
  missiles: Missile[];
  particles: Particle[];
  floaters: Floater[];
  rings: Ring[];
  shockwaves: Shockwave[];
  pending: PendingSwarm[];
  vortex: Vortex | null;
  freezeLeft: number;
  speedLeft: number;
  buzzsawLeft: number;
  graceLeft: number;
  sawWarned: boolean;
  nextSpawnAt: number;
  nextPowerupAt: number;
  nextScoreAt: number;
  lastRingAt: number;
  lastNukeAt: number;
  wave: number;
  bannerText: string;
  bannerSub: string;
  bannerLeft: number;
  bannerMax: number;
  score: number;
  kills: number;
  combo: number;
  comboLeft: number;
  maxCombo: number;
  best: number; // 開局前的最佳紀錄
  shake: number;
  flashColor: string;
  flashLeft: number;
  flashMax: number;
  deathLeft: number;
  killer: Vec2 | null;
}

const CAUSE_COLORS: Record<KillCause, string> = {
  missile: '#60a5fa',
  nuke: '#facc15',
  shatter: '#86efac',
  vortex: '#c084fc',
  buzzsaw: '#f472b6',
};

const MULTIPLIER_COLORS = ['#ffffff', '#ffffff', '#67e8f9', '#86efac', '#fde047', '#fb923c'];

const PICKUP_LABEL_SIZE = 20; // 撿到道具時飄出的名稱字級（u）

// ─── 小工具 ───────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** 角度差收斂到 -π..π */
function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** 原地移除不要的元素（不配置新陣列） */
function compact<Item>(list: Item[], keep: (item: Item) => boolean): void {
  let write = 0;
  for (let read = 0; read < list.length; read++) {
    const item = list[read];
    if (keep(item)) {
      list[write] = item;
      write++;
    }
  }
  list.length = write;
}

function computeUnit(w: number, h: number): number {
  return clamp(Math.min(w, h) / T.REFERENCE_SHORT_SIDE, T.UNIT_MIN, T.UNIT_MAX);
}

export function multiplierFor(combo: number): number {
  if (combo <= 0) return 1;
  return 1 + Math.min(T.MAX_MULTIPLIER - 1, Math.floor((combo - 1) / T.COMBO_STEP));
}

export function multiplierColor(multiplier: number): string {
  return MULTIPLIER_COLORS[Math.min(multiplier, MULTIPLIER_COLORS.length - 1)];
}

// ─── 難度曲線 ─────────────────────────────────────────────────────────

export interface Difficulty {
  spawnGap: number;
  scatterCount: number;
  swarmCount: number;
  ringCount: number;
  enemySpeed: number; // u/s
  turnRate: number; // rad/s
  maxEnemies: number;
  powerupGap: number;
}

/** 前 RAMP_SECONDS 秒線性變難，之後用 overtime 繼續慢慢加，不會停在某個平台 */
export function difficulty(t: number): Difficulty {
  const ramp = clamp01(t / T.RAMP_SECONDS);
  const overtime = Math.max(0, t - T.RAMP_SECONDS) / 120;
  return {
    spawnGap: Math.max(0.5, lerp(2.2, 0.9, ramp) - overtime * 0.1),
    scatterCount: Math.round(lerp(2, 5, ramp) + overtime),
    swarmCount: Math.round(lerp(7, 15, ramp) + overtime * 2),
    ringCount: Math.round(lerp(12, 20, ramp) + overtime * 2),
    enemySpeed: Math.min(T.ENEMY_SPEED_MAX, lerp(T.ENEMY_SPEED_START, T.ENEMY_SPEED_END, ramp) + overtime * 8),
    turnRate: lerp(1.9, 3.0, ramp),
    maxEnemies: Math.min(T.MAX_ENEMIES, Math.round(lerp(30, 140, ramp) + overtime * 25)),
    powerupGap: lerp(5.0, 4.0, ramp),
  };
}

// ─── 建立 / 重設 ──────────────────────────────────────────────────────

export function createWorld(w: number, h: number, best: number): World {
  return {
    w,
    h,
    unit: computeUnit(w, h),
    phase: 'ready',
    clock: 0,
    time: 0,
    // READY 時箭頭放在中間偏下，不要壓在平台正中央的提示字上
    player: { x: w / 2, y: h * 0.62, vx: 0, vy: 0, angle: -Math.PI / 2, trail: [] },
    enemies: [],
    powerups: [],
    missiles: [],
    particles: [],
    floaters: [],
    rings: [],
    shockwaves: [],
    pending: [],
    vortex: null,
    freezeLeft: 0,
    speedLeft: 0,
    buzzsawLeft: 0,
    graceLeft: 0,
    sawWarned: false,
    nextSpawnAt: 0,
    nextPowerupAt: 0,
    nextScoreAt: 1,
    lastRingAt: -Infinity,
    lastNukeAt: -Infinity,
    wave: 1,
    bannerText: '',
    bannerSub: '',
    bannerLeft: 0,
    bannerMax: 1,
    score: 0,
    kills: 0,
    combo: 0,
    comboLeft: 0,
    maxCombo: 0,
    best,
    shake: 0,
    flashColor: '#ffffff',
    flashLeft: 0,
    flashMax: 1,
    deathLeft: 0,
    killer: null,
  };
}

/** 開新的一局。recenter = true 時玩家回到中央（重來）；false 時保留 READY 時試移動的位置 */
export function startRun(world: World, recenter: boolean): void {
  const fresh = createWorld(world.w, world.h, world.best);
  if (recenter) {
    fresh.player.x = world.w / 2;
    fresh.player.y = world.h / 2;
  } else {
    fresh.player = world.player;
  }
  Object.assign(world, fresh);
  world.phase = 'playing';
  world.nextSpawnAt = 1.2;
  world.nextPowerupAt = T.FIRST_POWERUP_AT;
  showBanner(world, 'SURVIVE', 'TOUCH ORBS TO FIGHT BACK', 1.8);
}

export function resizeWorld(world: World, w: number, h: number): void {
  world.w = w;
  world.h = h;
  world.unit = computeUnit(w, h);
  const margin = T.PLAYER_DRAW * world.unit;
  world.player.x = clamp(world.player.x, margin, Math.max(margin, w - margin));
  world.player.y = clamp(world.player.y, margin, Math.max(margin, h - margin));
}

// ─── 每幀更新 ─────────────────────────────────────────────────────────

/** move：平台傳來的傾斜量（約 ±15）；dt：秒 */
export function updateWorld(world: World, dt: number, move: Vec2): void {
  world.time += dt;
  updateEffectsFx(world, dt);

  if (world.phase === 'ready') {
    updatePlayer(world, dt, move);
    return;
  }
  if (world.phase === 'dying') {
    world.deathLeft -= dt;
    if (world.deathLeft <= 0) world.phase = 'over';
    return;
  }
  if (world.phase === 'over') return;

  world.clock += dt;
  const diff = difficulty(world.clock);
  updateTimers(world, dt);
  updatePlayer(world, dt, move);
  updateDirector(world, diff);
  updateEnemies(world, dt, diff);
  updateMissiles(world, dt);
  updatePowerups(world, dt);
  updateShockwaves(world, dt);
  checkPlayerCollisions(world);

  compact(world.enemies, e => e.alive);
  compact(world.missiles, m => m.alive);
  compact(world.powerups, p => p.alive);
}

// ─── 玩家 ─────────────────────────────────────────────────────────────

/** 小傾角時更細緻、傾到底時和原本一樣快 */
function responseCurve(magnitude: number): number {
  if (magnitude >= 1) return magnitude;
  return 0.55 * magnitude + 0.45 * magnitude * magnitude;
}

function updatePlayer(world: World, dt: number, move: Vec2): void {
  const p = world.player;
  const unit = world.unit;

  // 1) 傾斜 → 目標速度。長度套反應曲線、方向不變；斜向不會比單軸快
  const nx = move.x / T.INPUT_FULL_TILT;
  const ny = move.y / T.INPUT_FULL_TILT;
  const axisMax = Math.max(Math.abs(nx), Math.abs(ny));
  const length = Math.hypot(nx, ny);
  let targetVx = 0;
  let targetVy = 0;
  if (length > 0.0001) {
    const magnitude = Math.min(length, Math.max(1, axisMax));
    const boost = world.speedLeft > 0 ? T.SPEED_BOOST : 1;
    const speed = responseCurve(magnitude) * T.PLAYER_SPEED * unit * boost;
    targetVx = (nx / length) * speed;
    targetVy = (ny / length) * speed;
  }

  // 2) 指數平滑，把每 50ms 跳一次的輸入變成連續的速度
  const k = 1 - Math.exp(-dt / T.INPUT_SMOOTHING);
  p.vx += (targetVx - p.vx) * k;
  p.vy += (targetVy - p.vy) * k;

  // 3) 移動 + 撞牆（撞到的那個方向速度歸零，才不會黏在牆上）
  const margin = T.PLAYER_DRAW * unit;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.x < margin) {
    p.x = margin;
    p.vx = Math.max(0, p.vx);
  } else if (p.x > world.w - margin) {
    p.x = world.w - margin;
    p.vx = Math.min(0, p.vx);
  }
  if (p.y < margin) {
    p.y = margin;
    p.vy = Math.max(0, p.vy);
  } else if (p.y > world.h - margin) {
    p.y = world.h - margin;
    p.vy = Math.min(0, p.vy);
  }

  // 4) 箭頭朝向：有在動才轉，停下來保持最後的方向
  const speedNow = Math.hypot(p.vx, p.vy);
  if (speedNow > 25 * unit) {
    const target = Math.atan2(p.vy, p.vx);
    p.angle += wrapAngle(target - p.angle) * (1 - Math.exp(-dt * 16));
  }

  // 5) 尾跡
  p.trail.push({ x: p.x, y: p.y });
  if (p.trail.length > T.TRAIL_LENGTH) p.trail.shift();
}

// ─── 計時器、效果結束 ─────────────────────────────────────────────────

function updateTimers(world: World, dt: number): void {
  if (world.freezeLeft > 0) {
    world.freezeLeft -= dt;
    if (world.freezeLeft <= 0) {
      world.freezeLeft = 0;
      shatterAllFrozen(world);
    }
  }
  if (world.speedLeft > 0) {
    world.speedLeft = Math.max(0, world.speedLeft - dt);
  }
  if (world.buzzsawLeft > 0) {
    world.buzzsawLeft -= dt;
    if (!world.sawWarned && world.buzzsawLeft <= 1) {
      world.sawWarned = true;
      sounds.sawEnding();
    }
    if (world.buzzsawLeft <= 0) {
      world.buzzsawLeft = 0;
      world.graceLeft = T.BUZZSAW_GRACE;
    }
  }
  if (world.graceLeft > 0) {
    world.graceLeft = Math.max(0, world.graceLeft - dt);
  }
  if (world.vortex) {
    world.vortex.left -= dt;
    if (world.vortex.left <= 0) {
      collapseVortex(world, world.vortex);
      world.vortex = null;
    }
  }
  if (world.comboLeft > 0) {
    world.comboLeft -= dt;
    if (world.comboLeft <= 0) {
      world.comboLeft = 0;
      world.combo = 0;
    }
  }
  while (world.clock >= world.nextScoreAt) {
    world.score += T.SURVIVE_POINTS;
    world.nextScoreAt += 1;
  }
}

/** 粒子、飄字、光環、畫面震動、閃光、橫幅：任何階段都會繼續播完 */
function updateEffectsFx(world: World, dt: number): void {
  for (const p of world.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const drag = Math.exp(-p.drag * dt);
    p.vx *= drag;
    p.vy *= drag;
    p.life -= dt;
  }
  compact(world.particles, p => p.life > 0);

  for (const f of world.floaters) {
    f.y -= 38 * world.unit * dt;
    f.life -= dt;
  }
  compact(world.floaters, f => f.life > 0);

  for (const r of world.rings) r.life -= dt;
  compact(world.rings, r => r.life > 0);

  world.shake = Math.max(0, world.shake - dt * 28);
  world.flashLeft = Math.max(0, world.flashLeft - dt);
  world.bannerLeft = Math.max(0, world.bannerLeft - dt);
}

// ─── 生怪（導演） ─────────────────────────────────────────────────────

function waveSubtitle(wave: number): string {
  const waveStart = (wave - 1) * T.WAVE_SECONDS;
  if (waveStart === T.SWARM_FROM) return 'SWARMS INCOMING';
  if (waveStart === T.RING_FROM) return 'WATCH FOR RINGS';
  if (waveStart === T.NUKE_FROM) return 'NUKES UNLOCKED';
  return '';
}

function updateDirector(world: World, diff: Difficulty): void {
  const t = world.clock;

  const wave = 1 + Math.floor(t / T.WAVE_SECONDS);
  if (wave > world.wave) {
    world.wave = wave;
    showBanner(world, `WAVE ${wave}`, waveSubtitle(wave), 1.8);
    sounds.wave();
  }

  // 預告時間到的成群敵人進場
  for (const swarm of world.pending) {
    if (t >= swarm.at) spawnSwarm(world, swarm);
  }
  compact(world.pending, swarm => t < swarm.at);

  if (t >= world.nextSpawnAt) {
    world.nextSpawnAt = t + diff.spawnGap * rand(0.85, 1.15);
    let incoming = world.enemies.length;
    for (const swarm of world.pending) incoming += swarm.count;
    const room = diff.maxEnemies - incoming;
    if (room > 0) {
      const pattern = choosePattern(world, t);
      if (pattern === 'ring') {
        spawnRing(world, Math.min(room, diff.ringCount));
      } else if (pattern === 'swarm') {
        queueSwarm(world, Math.min(room, diff.swarmCount));
      } else {
        spawnScatter(world, Math.min(room, diff.scatterCount));
      }
    }
  }

  if (t >= world.nextPowerupAt) {
    world.nextPowerupAt = t + diff.powerupGap * rand(0.85, 1.15);
    if (world.powerups.length < T.MAX_POWERUPS) spawnPowerup(world);
  }
}

function choosePattern(world: World, t: number): 'scatter' | 'swarm' | 'ring' {
  if (t < T.SWARM_FROM) return 'scatter';
  const ringReady = t >= T.RING_FROM && t - world.lastRingAt >= T.RING_COOLDOWN;
  const roll = Math.random();
  if (ringReady && roll < 0.25) return 'ring';
  if (roll > 0.62) return 'swarm';
  return 'scatter';
}

function newEnemy(world: World, x: number, y: number, spawnLeft: number): Enemy {
  return {
    x,
    y,
    heading: Math.atan2(world.player.y - y, world.player.x - x),
    speedMul: rand(0.88, 1.12),
    spawnLeft,
    frozen: world.freezeLeft > 0,
    alive: true,
  };
}

/** 畫面外、某條邊上的一點；along 0..1，outset 是往外推多少 */
function pointOnSide(world: World, side: Side, along: number, outset: number): Vec2 {
  switch (side) {
    case 'left':
      return { x: -outset, y: along * world.h };
    case 'right':
      return { x: world.w + outset, y: along * world.h };
    case 'top':
      return { x: along * world.w, y: -outset };
    case 'bottom':
      return { x: along * world.w, y: world.h + outset };
  }
}

const SIDES: Side[] = ['left', 'right', 'top', 'bottom'];

/** 隨機邊緣點，盡量離玩家夠遠（玩家貼邊時不會在臉上生怪） */
function pickEdgePoint(world: World): Vec2 {
  const outset = T.ENEMY_RADIUS * world.unit * 3;
  const minDist = T.SAFE_SPAWN_DISTANCE * Math.min(world.w, world.h);
  const p = world.player;
  let best = pointOnSide(world, SIDES[Math.floor(Math.random() * 4)], Math.random(), outset);
  let bestDist = Math.sqrt(dist2(best.x, best.y, p.x, p.y));
  for (let i = 0; i < 10 && bestDist < minDist; i++) {
    const candidate = pointOnSide(world, SIDES[Math.floor(Math.random() * 4)], Math.random(), outset);
    const d = Math.sqrt(dist2(candidate.x, candidate.y, p.x, p.y));
    if (d > bestDist) {
      best = candidate;
      bestDist = d;
    }
  }
  return best;
}

function spawnScatter(world: World, count: number): void {
  for (let i = 0; i < count; i++) {
    const pos = pickEdgePoint(world);
    world.enemies.push(newEnemy(world, pos.x, pos.y, 0));
  }
}

/** 成群敵人：從離玩家遠的那一邊來，先在邊緣亮紅光預告 */
function queueSwarm(world: World, count: number): void {
  const p = world.player;
  const sides: [Side, number][] = [
    ['left', p.x],
    ['right', world.w - p.x],
    ['top', p.y],
    ['bottom', world.h - p.y],
  ];
  sides.sort((a, b) => b[1] - a[1]);
  const side = sides[Math.random() < 0.7 ? 0 : 1][0];
  world.pending.push({ at: world.clock + T.SWARM_WARNING, side, along: rand(0.15, 0.85), count });
  sounds.warn();
}

function spawnSwarm(world: World, swarm: PendingSwarm): void {
  const unit = world.unit;
  const sideLength = swarm.side === 'left' || swarm.side === 'right' ? world.h : world.w;
  const outset = T.ENEMY_RADIUS * unit * 3;
  for (let i = 0; i < swarm.count; i++) {
    const along = clamp(swarm.along + (rand(-1, 1) * 70 * unit) / sideLength, 0.02, 0.98);
    const pos = pointOnSide(world, swarm.side, along, outset + rand(0, 90) * unit);
    world.enemies.push(newEnemy(world, pos.x, pos.y, 0));
  }
}

/** 包圍圈：在玩家四周閃爍出現，留一個缺口讓人鑽 */
function spawnRing(world: World, count: number): void {
  const p = world.player;
  const shortSide = Math.min(world.w, world.h);
  const radius = 0.38 * shortSide;
  const edge = T.ENEMY_RADIUS * world.unit * 2;
  const gapStart = Math.floor(Math.random() * count);
  const phase = rand(0, Math.PI * 2);
  for (let i = 0; i < count; i++) {
    if (i === gapStart || i === (gapStart + 1) % count) continue;
    const angle = phase + (i / count) * Math.PI * 2;
    const x = p.x + Math.cos(angle) * radius;
    const y = p.y + Math.sin(angle) * radius;
    // 玩家貼邊時圈會超出場地：超出的那幾顆不生（牆本身就是那一側的包圍），不要擠成一排貼在牆上
    if (x < edge || x > world.w - edge || y < edge || y > world.h - edge) continue;
    world.enemies.push(newEnemy(world, x, y, T.SPAWN_TELEGRAPH));
  }
  world.lastRingAt = world.clock;
  sounds.warn();
}

// ─── 敵人移動 ─────────────────────────────────────────────────────────

function updateEnemies(world: World, dt: number, diff: Difficulty): void {
  const unit = world.unit;
  const p = world.player;
  const vortex = world.vortex;
  const vortexRadius = T.VORTEX_RADIUS * unit;
  const vortexKill = T.VORTEX_KILL * unit;

  for (const e of world.enemies) {
    if (!e.alive || e.frozen) continue;
    if (e.spawnLeft > 0) {
      e.spawnLeft = Math.max(0, e.spawnLeft - dt);
      continue;
    }

    // 漩渦：往中心螺旋吸入，到中心就消滅
    if (vortex) {
      const dx = vortex.x - e.x;
      const dy = vortex.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d < vortexRadius) {
        if (d < vortexKill) {
          killEnemy(world, e, 'vortex', false);
          continue;
        }
        const pull = 1 - d / vortexRadius;
        const speed = (140 + 420 * pull) * unit;
        const nx = dx / d;
        const ny = dy / d;
        const swirl = 0.7 * pull;
        e.x += (nx - ny * swirl) * speed * dt;
        e.y += (ny + nx * swirl) * speed * dt;
        continue;
      }
    }

    // 追玩家：轉向速度有上限，玩家閃開時敵人會畫弧線衝過頭。
    // 靠近玩家時轉得更快、背對時放慢，避免在玩家身邊一直繞圈。
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const angleDiff = wrapAngle(Math.atan2(dy, dx) - e.heading);
    const closeBoost = 1 + 2 * clamp01(1 - d / (150 * unit));
    const maxTurn = diff.turnRate * closeBoost * dt;
    e.heading += clamp(angleDiff, -maxTurn, maxTurn);
    const facing = Math.max(0, Math.cos(angleDiff));
    const speed = diff.enemySpeed * unit * e.speedMul * (0.55 + 0.45 * facing);
    e.x += Math.cos(e.heading) * speed * dt;
    e.y += Math.sin(e.heading) * speed * dt;
  }

  separateEnemies(world, dt);
}

/** 敵人彼此推開，群體會散成一片，而不是疊成一顆點 */
function separateEnemies(world: World, dt: number): void {
  const list = world.enemies;
  const minD = T.ENEMY_RADIUS * T.ENEMY_SEPARATION * world.unit;
  const minD2 = minD * minD;
  const strength = Math.min(1, 10 * dt);

  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive || a.spawnLeft > 0) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.alive || b.spawnLeft > 0) continue;
      if (a.frozen && b.frozen) continue;
      const dx = b.x - a.x;
      if (dx > minD || dx < -minD) continue;
      const dy = b.y - a.y;
      if (dy > minD || dy < -minD) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD2) continue;
      const d = Math.sqrt(d2) || 0.01;
      const nx = d2 > 0 ? dx / d : 1;
      const ny = d2 > 0 ? dy / d : 0;
      const push = (minD - d) * 0.5 * strength;
      if (!a.frozen && !b.frozen) {
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      } else if (!a.frozen) {
        a.x -= nx * push * 2;
        a.y -= ny * push * 2;
      } else {
        b.x += nx * push * 2;
        b.y += ny * push * 2;
      }
    }
  }
}

// ─── 擊破與死亡 ───────────────────────────────────────────────────────

function burst(world: World, x: number, y: number, color: string, count: number, speed: number, size: number, life: number): void {
  const unit = world.unit;
  for (let i = 0; i < count; i++) {
    if (world.particles.length >= T.MAX_PARTICLES) return;
    const angle = Math.random() * Math.PI * 2;
    const sp = speed * unit * rand(0.35, 1);
    const particleLife = life * rand(0.6, 1);
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * sp,
      vy: Math.sin(angle) * sp,
      life: particleLife,
      maxLife: particleLife,
      size: size * unit * rand(0.6, 1.3),
      color,
      drag: 3.5,
    });
  }
}

function addFloater(world: World, x: number, y: number, text: string, color: string, size: number, life: number): void {
  if (world.floaters.length >= T.MAX_FLOATERS) world.floaters.shift();
  world.floaters.push({ x, y, text, color, size, life, maxLife: life });
}

function addRing(world: World, x: number, y: number, color: string, radius: number, width: number, life: number): void {
  world.rings.push({ x, y, color, radius, width, life, maxLife: life });
}

function showBanner(world: World, text: string, sub: string, duration: number): void {
  world.bannerText = text;
  world.bannerSub = sub;
  world.bannerLeft = duration;
  world.bannerMax = duration;
}

function flash(world: World, color: string, duration: number): void {
  world.flashColor = color;
  world.flashLeft = duration;
  world.flashMax = duration;
}

function killEnemy(world: World, e: Enemy, cause: KillCause, quiet: boolean): void {
  e.alive = false;
  world.kills++;
  world.combo++;
  world.comboLeft = T.COMBO_WINDOW;
  world.maxCombo = Math.max(world.maxCombo, world.combo);

  const multiplier = multiplierFor(world.combo);
  const points = T.KILL_POINTS * multiplier;
  world.score += points;

  burst(world, e.x, e.y, CAUSE_COLORS[cause], 7, 150, 3, 0.55);
  burst(world, e.x, e.y, COLORS.enemy, 4, 90, 2.5, 0.45);
  addFloater(world, e.x, e.y - 10 * world.unit, `+${points}`, multiplierColor(multiplier), 13, 0.7);

  if (quiet) return;
  if (cause === 'shatter') {
    sounds.shatter();
  } else {
    sounds.kill(world.combo);
  }
}

function shatterAllFrozen(world: World): void {
  let shattered = 0;
  for (const e of world.enemies) {
    if (e.alive && e.frozen) {
      killEnemy(world, e, 'shatter', true);
      shattered++;
    }
  }
  if (shattered > 0) {
    sounds.massShatter();
    world.shake = Math.max(world.shake, 5);
  }
}

function collapseVortex(world: World, vortex: Vortex): void {
  const radius = T.VORTEX_RADIUS * world.unit * 0.5;
  for (const e of world.enemies) {
    if (e.alive && dist2(e.x, e.y, vortex.x, vortex.y) < radius * radius) {
      killEnemy(world, e, 'vortex', true);
    }
  }
  addRing(world, vortex.x, vortex.y, POWERUPS.vortex.color, radius * 1.6, 5 * world.unit, 0.45);
  burst(world, vortex.x, vortex.y, POWERUPS.vortex.color, 24, 320, 3, 0.6);
  world.shake = Math.max(world.shake, 4);
  sounds.vortexEnd();
}

function killPlayer(world: World, killer: Enemy): void {
  const p = world.player;
  world.phase = 'dying';
  world.deathLeft = T.DEATH_DURATION;
  world.killer = { x: killer.x, y: killer.y };
  world.combo = 0;
  world.comboLeft = 0;
  burst(world, p.x, p.y, COLORS.player, 36, 420, 4, 1.1);
  burst(world, p.x, p.y, '#ffffff', 16, 260, 3, 0.8);
  burst(world, killer.x, killer.y, COLORS.enemy, 12, 200, 3, 0.8);
  addRing(world, p.x, p.y, COLORS.enemy, 150 * world.unit, 6 * world.unit, 0.7);
  flash(world, COLORS.enemy, 0.45);
  world.shake = 12;
  sounds.death();
}

// ─── 飛彈 ─────────────────────────────────────────────────────────────

function nearestEnemy(world: World, x: number, y: number, maxDist: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD2 = maxDist * maxDist;
  for (const e of world.enemies) {
    if (!e.alive || e.spawnLeft > 0) continue;
    const d2 = dist2(e.x, e.y, x, y);
    if (d2 < bestD2) {
      best = e;
      bestD2 = d2;
    }
  }
  return best;
}

/** 放射狀射出，每發挑「大致在它前方、又近」而且還沒被別發鎖定的敵人 */
function launchMissiles(world: World): void {
  const p = world.player;
  const unit = world.unit;
  const candidates = world.enemies
    .filter(e => e.alive && e.spawnLeft <= 0)
    .sort((a, b) => dist2(a.x, a.y, p.x, p.y) - dist2(b.x, b.y, p.x, p.y))
    .slice(0, 16);
  const taken = new Set<Enemy>();
  const speed = T.MISSILE_SPEED * unit;

  for (let i = 0; i < T.MISSILE_COUNT; i++) {
    const angle = (Math.PI * 2 * i) / T.MISSILE_COUNT + p.angle;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    let target: Enemy | null = null;
    let bestScore = -Infinity;
    for (const e of candidates) {
      if (taken.has(e)) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const score = (dx * dirX + dy * dirY) / d - d / (600 * unit);
      if (score > bestScore) {
        bestScore = score;
        target = e;
      }
    }
    if (target) {
      taken.add(target);
    } else if (candidates.length > 0) {
      target = candidates[i % candidates.length];
    }
    world.missiles.push({ x: p.x, y: p.y, vx: dirX * speed, vy: dirY * speed, age: 0, target, alive: true });
  }
}

function updateMissiles(world: World, dt: number): void {
  const unit = world.unit;
  const speed = T.MISSILE_SPEED * unit;
  const hitR = (T.MISSILE_RADIUS + T.ENEMY_RADIUS) * unit;
  const outside = 60 * unit;

  for (const m of world.missiles) {
    if (!m.alive) continue;
    m.age += dt;
    if (m.age > T.MISSILE_LIFETIME) {
      m.alive = false;
      burst(world, m.x, m.y, '#93c5fd', 5, 80, 2, 0.3);
      continue;
    }

    if (!m.target || !m.target.alive) {
      m.target = nearestEnemy(world, m.x, m.y, 900 * unit);
    }
    // 剛射出的一瞬間先直飛，放射狀散開才看得出來
    if (m.target && m.age > 0.12) {
      const current = Math.atan2(m.vy, m.vx);
      const desired = Math.atan2(m.target.y - m.y, m.target.x - m.x);
      const maxTurn = T.MISSILE_TURN * dt;
      const angle = current + clamp(wrapAngle(desired - current), -maxTurn, maxTurn);
      m.vx = Math.cos(angle) * speed;
      m.vy = Math.sin(angle) * speed;
    }
    m.x += m.vx * dt;
    m.y += m.vy * dt;

    if (world.particles.length < T.MAX_PARTICLES) {
      world.particles.push({
        x: m.x,
        y: m.y,
        vx: -m.vx * 0.05 + rand(-20, 20) * unit,
        vy: -m.vy * 0.05 + rand(-20, 20) * unit,
        life: 0.25,
        maxLife: 0.25,
        size: 2.2 * unit,
        color: '#93c5fd',
        drag: 4,
      });
    }

    if (m.x < -outside || m.x > world.w + outside || m.y < -outside || m.y > world.h + outside) {
      m.alive = false;
      continue;
    }

    for (const e of world.enemies) {
      if (!e.alive || e.spawnLeft > 0) continue;
      if (dist2(e.x, e.y, m.x, m.y) < hitR * hitR) {
        killEnemy(world, e, 'missile', false);
        m.alive = false;
        break;
      }
    }
  }
}

// ─── 道具 ─────────────────────────────────────────────────────────────

function pickPowerupType(world: World): PowerupType {
  const nukeReady = world.clock >= T.NUKE_FROM && world.clock - world.lastNukeAt >= T.NUKE_COOLDOWN;
  const pool = POWERUP_ORDER.filter(type => type !== 'nuke' || nukeReady);
  let total = 0;
  for (const type of pool) total += POWERUPS[type].weight;
  let roll = Math.random() * total;
  for (const type of pool) {
    roll -= POWERUPS[type].weight;
    if (roll <= 0) return type;
  }
  return pool[0];
}

/** 道具放在「不太近也不太遠、附近沒什麼敵人、不和其他道具擠在一起」的位置 */
function spawnPowerup(world: World): void {
  const unit = world.unit;
  const p = world.player;
  const shortSide = Math.min(world.w, world.h);
  const margin = Math.min(60 * unit, shortSide / 4);
  const crowdRadius2 = (90 * unit) ** 2;
  const otherRadius2 = (120 * unit) ** 2;

  let bestX = world.w / 2;
  let bestY = world.h / 2;
  let bestScore = -Infinity;
  for (let i = 0; i < 12; i++) {
    const x = rand(margin, world.w - margin);
    const y = rand(margin, world.h - margin);
    let score = -Math.abs(Math.sqrt(dist2(x, y, p.x, p.y)) - 0.35 * shortSide);
    for (const e of world.enemies) {
      if (e.alive && dist2(x, y, e.x, e.y) < crowdRadius2) score -= 60 * unit;
    }
    for (const other of world.powerups) {
      if (dist2(x, y, other.x, other.y) < otherRadius2) score -= 200 * unit;
    }
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
      bestY = y;
    }
  }

  const type = pickPowerupType(world);
  if (type === 'nuke') world.lastNukeAt = world.clock;
  world.powerups.push({ x: bestX, y: bestY, type, age: 0, alive: true });
  sounds.powerupSpawn();
}

function updatePowerups(world: World, dt: number): void {
  const p = world.player;
  const pickR = (T.POWERUP_PICKUP + T.PLAYER_HIT) * world.unit;
  for (const pu of world.powerups) {
    if (!pu.alive) continue;
    pu.age += dt;
    if (pu.age >= T.POWERUP_LIFETIME) {
      pu.alive = false;
      burst(world, pu.x, pu.y, POWERUPS[pu.type].color, 8, 90, 2.5, 0.4);
      continue;
    }
    if (dist2(pu.x, pu.y, p.x, p.y) < pickR * pickR) {
      collectPowerup(world, pu);
    }
  }
}

function collectPowerup(world: World, pu: Powerup): void {
  pu.alive = false;
  const info = POWERUPS[pu.type];
  const p = world.player;
  const unit = world.unit;

  addRing(world, p.x, p.y, info.color, 90 * unit, 4 * unit, 0.5);
  burst(world, pu.x, pu.y, info.color, 14, 220, 3, 0.5);
  // 連續撿到兩個道具時，名稱往上疊，不要壓在一起
  let recentNames = 0;
  for (const f of world.floaters) {
    if (f.size >= PICKUP_LABEL_SIZE && f.life > f.maxLife * 0.4) recentNames++;
  }
  addFloater(world, p.x, p.y - (34 + recentNames * 22) * unit, info.name, info.color, PICKUP_LABEL_SIZE, 1.0);
  sounds.pickup(pu.type);

  switch (pu.type) {
    case 'missile':
      launchMissiles(world);
      break;
    case 'nuke':
      world.shockwaves.push({ x: p.x, y: p.y, radius: 0, maxRadius: Math.hypot(world.w, world.h) });
      flash(world, '#fef9c3', 0.45);
      world.shake = Math.max(world.shake, 9);
      break;
    case 'freeze':
      world.freezeLeft = T.FREEZE_DURATION;
      for (const e of world.enemies) {
        if (e.alive) e.frozen = true;
      }
      addRing(world, p.x, p.y, info.color, Math.min(world.w, world.h) * 0.8, 3 * unit, 0.6);
      flash(world, '#bbf7d0', 0.2);
      break;
    case 'vortex':
      world.vortex = { x: p.x, y: p.y, left: T.VORTEX_DURATION };
      break;
    case 'speed':
      world.speedLeft = T.SPEED_DURATION;
      break;
    case 'buzzsaw':
      world.buzzsawLeft = T.BUZZSAW_DURATION;
      world.sawWarned = false;
      break;
  }
}

function updateShockwaves(world: World, dt: number): void {
  for (const s of world.shockwaves) {
    s.radius += T.NUKE_SPEED * world.unit * dt;
    const r2 = s.radius * s.radius;
    for (const e of world.enemies) {
      if (e.alive && dist2(e.x, e.y, s.x, s.y) < r2) {
        killEnemy(world, e, 'nuke', false);
      }
    }
  }
  compact(world.shockwaves, s => s.radius < s.maxRadius);
}

// ─── 玩家碰撞 ─────────────────────────────────────────────────────────

function checkPlayerCollisions(world: World): void {
  const p = world.player;
  const unit = world.unit;
  const hitR = (T.PLAYER_HIT + T.ENEMY_HIT) * unit;
  const smashR = (T.PLAYER_DRAW * 0.8 + T.ENEMY_RADIUS) * unit; // 撞碎冰凍敵人的距離放寬一點，手感比較爽
  const sawR = (T.BUZZSAW_RADIUS + T.ENEMY_HIT) * unit;
  const sawOn = world.buzzsawLeft > 0;

  for (const e of world.enemies) {
    if (!e.alive || e.spawnLeft > 0) continue;
    const d2 = dist2(e.x, e.y, p.x, p.y);
    if (sawOn) {
      if (d2 < sawR * sawR) killEnemy(world, e, 'buzzsaw', false);
      continue;
    }
    if (e.frozen) {
      if (d2 < smashR * smashR) killEnemy(world, e, 'shatter', false);
      continue;
    }
    if (d2 < hitR * hitR && world.graceLeft <= 0) {
      killPlayer(world, e);
      return;
    }
  }
}
