// games/game9/sim.ts — Sky Fighter 遊戲邏輯（純 TypeScript，不碰 React）
// 狀態是一個可變物件，每幀原地更新；畫面和 HUD 直接讀它，不經過 React state。
import * as THREE from 'three';
import {
  ENEMY,
  ENEMY_SPECS,
  EnemyKind,
  EnemySpec,
  FLIGHT,
  GUN,
  PLAYER,
  SCORING,
  VIEW,
  WAVES,
  WORLD,
  getWaveSpec,
} from './config';

// ==========================================
// 型別
// ==========================================
/** 遊戲內部階段；DYING 對平台來說仍是 PLAYING（播墜落鏡頭用） */
export type Phase = 'READY' | 'PLAYING' | 'DYING' | 'GAME_OVER';

export interface PlayerState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  quat: THREE.Quaternion;
  yaw: number;
  pitch: number;
  bank: number;
  yawRate: number;
  speed: number;
  hp: number;
  ammo: number;
  fireCooldown: number;
  gunIdleTime: number;
  gunSide: 1 | -1;
  smoothX: number;
  smoothY: number;
  throttle: boolean;
  brake: boolean;
  smokeTimer: number;
  wakeTimer: number;
}

type EnemyMode = 'ENGAGE' | 'BREAK' | 'EXTEND';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  spec: EnemySpec;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  forward: THREE.Vector3;
  quat: THREE.Quaternion;
  speed: number;
  bank: number;
  hp: number;
  maxHp: number;
  mode: EnemyMode;
  modeTimer: number;
  breakDir: THREE.Vector3;
  windup: number;
  burstLeft: number;
  burstTimer: number;
  cooldown: number;
  flash: number;
  /** 機頭正對玩家、準備開火（HUD 警告用） */
  aiming: boolean;
  smokeTimer: number;
}

export interface Bullet {
  active: boolean;
  enemy: boolean;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  damage: number;
}

export interface Particle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  startSize: number;
  endSize: number;
  drag: number;
  gravity: number;
  color: THREE.Color;
}

interface ParticlePool {
  items: Particle[];
  cursor: number;
}

export type GameEvent =
  | { type: 'shot' }
  | { type: 'gunEmpty' }
  | { type: 'enemyHit'; pos: THREE.Vector3 }
  | { type: 'enemyKilled'; pos: THREE.Vector3; points: number; multiplier: number; kind: EnemyKind }
  | { type: 'playerHit'; from: THREE.Vector3; damage: number }
  | { type: 'playerDied'; pos: THREE.Vector3 }
  | { type: 'waveStart'; wave: number; count: number }
  | { type: 'waveClear'; wave: number; bonus: number; repaired: number }
  | { type: 'lockOn' }
  | { type: 'gameOver' };

export interface LockState {
  targetId: number | null;
  progress: number;
  locked: boolean;
  /** 鎖定目標的提前量位置（瞄準輔助與 HUD 提前量圈） */
  lead: THREE.Vector3;
}

export interface GameState {
  phase: Phase;
  time: number;
  phaseTime: number;
  player: PlayerState;
  enemies: Enemy[];
  bullets: Bullet[];
  bulletCursor: number;
  fire: ParticlePool;
  smoke: ParticlePool;
  wave: number;
  waveActive: boolean;
  waveQueue: EnemyKind[];
  waveConcurrent: number;
  waveHpMult: number;
  waveTurnMult: number;
  waveBreak: number;
  spawnTimer: number;
  score: number;
  kills: number;
  shotsFired: number;
  shotsHit: number;
  streak: number;
  streakTimer: number;
  bestStreak: number;
  lock: LockState;
  aimWarning: boolean;
  deathPos: THREE.Vector3;
  deathTime: number;
  wreckSmokeTimer: number;
  nextId: number;
  events: GameEvent[];
}

export interface StepInput {
  moveX: number;
  moveY: number;
  fire: boolean;
  throttle: boolean;
  brake: boolean;
}

// ==========================================
// 小工具
// ==========================================
const UP = new THREE.Vector3(0, 1, 0);
const BULLET_POOL_SIZE = 240;
const FIRE_POOL_SIZE = 260;
const SMOKE_POOL_SIZE = 220;

// 重用的暫存物件，避免每幀配置記憶體
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _leadDir = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _origin = new THREE.Vector3();
const _color = new THREE.Color();

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

/** 把角度包到 -π..π */
function wrapAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

/** 跟幀率無關的指數平滑係數 */
function smoothFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** 中心細膩、邊緣快的反應曲線 */
function responseCurve(x: number): number {
  const a = Math.abs(x);
  return Math.sign(x) * ((1 - FLIGHT.INPUT_EXPO) * a + FLIGHT.INPUT_EXPO * a * a);
}

/** 把 dir 往 target 轉，最多轉 maxAngle（兩者都是單位向量，原地修改 dir） */
function rotateToward(dir: THREE.Vector3, target: THREE.Vector3, maxAngle: number): void {
  const angle = dir.angleTo(target);
  if (angle < 1e-5) return;
  if (angle <= maxAngle) {
    dir.copy(target);
    return;
  }
  _v4.crossVectors(dir, target);
  if (_v4.lengthSq() < 1e-10) {
    // 正好反方向：隨便找一個垂直軸
    _v4.set(0, 1, 0);
  }
  _v4.normalize();
  _q1.setFromAxisAngle(_v4, maxAngle);
  dir.applyQuaternion(_q1).normalize();
}

/** 線段 a→b 與球（中心 c、半徑 r）是否相交：快速子彈每幀走很遠，不能只檢查端點 */
function segmentHitsSphere(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, r: number): boolean {
  _v1.subVectors(b, a);
  _v2.subVectors(c, a);
  const lenSq = _v1.lengthSq();
  const t = lenSq > 0 ? clamp(_v2.dot(_v1) / lenSq, 0, 1) : 0;
  _v3.copy(a).addScaledVector(_v1, t);
  return _v3.distanceToSquared(c) <= r * r;
}

/** 計算子彈要打中移動目標的提前量位置 */
function computeLead(
  out: THREE.Vector3,
  from: THREE.Vector3,
  targetPos: THREE.Vector3,
  targetVel: THREE.Vector3,
  bulletSpeed: number,
): THREE.Vector3 {
  let t = from.distanceTo(targetPos) / bulletSpeed;
  for (let i = 0; i < 2; i++) {
    out.copy(targetPos).addScaledVector(targetVel, t);
    t = from.distanceTo(out) / bulletSpeed;
  }
  return out;
}

// ==========================================
// 建立 / 重設
// ==========================================
function createPlayer(): PlayerState {
  const p: PlayerState = {
    pos: new THREE.Vector3(0, WORLD.START_ALTITUDE, 0),
    vel: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, -1),
    right: new THREE.Vector3(1, 0, 0),
    quat: new THREE.Quaternion(),
    yaw: 0,
    pitch: 0,
    bank: 0,
    yawRate: 0,
    speed: FLIGHT.CRUISE_SPEED,
    hp: PLAYER.MAX_HP,
    ammo: GUN.MAX_AMMO,
    fireCooldown: 0,
    gunIdleTime: 0,
    gunSide: 1,
    smoothX: 0,
    smoothY: 0,
    throttle: false,
    brake: false,
    smokeTimer: 0,
    wakeTimer: 0,
  };
  syncPlayerOrientation(p);
  return p;
}

function createPool(size: number): ParticlePool {
  const items: Particle[] = [];
  for (let i = 0; i < size; i++) {
    items.push({
      active: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      life: 0,
      maxLife: 1,
      startSize: 1,
      endSize: 1,
      drag: 0,
      gravity: 0,
      color: new THREE.Color(),
    });
  }
  return { items, cursor: 0 };
}

export function createGameState(): GameState {
  const bullets: Bullet[] = [];
  for (let i = 0; i < BULLET_POOL_SIZE; i++) {
    bullets.push({
      active: false,
      enemy: false,
      pos: new THREE.Vector3(),
      prev: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      life: 0,
      damage: 0,
    });
  }
  return {
    phase: 'READY',
    time: 0,
    phaseTime: 0,
    player: createPlayer(),
    enemies: [],
    bullets,
    bulletCursor: 0,
    fire: createPool(FIRE_POOL_SIZE),
    smoke: createPool(SMOKE_POOL_SIZE),
    wave: 0,
    waveActive: false,
    waveQueue: [],
    waveConcurrent: 1,
    waveHpMult: 1,
    waveTurnMult: 1,
    waveBreak: 0,
    spawnTimer: 0,
    score: 0,
    kills: 0,
    shotsFired: 0,
    shotsHit: 0,
    streak: 0,
    streakTimer: 0,
    bestStreak: 0,
    lock: { targetId: null, progress: 0, locked: false, lead: new THREE.Vector3() },
    aimWarning: false,
    deathPos: new THREE.Vector3(),
    deathTime: 0,
    wreckSmokeTimer: 0,
    nextId: 1,
    events: [],
  };
}

/** 重來：原地把狀態換回初始值（畫面元件持有同一個物件參照） */
export function resetGame(s: GameState): void {
  Object.assign(s, createGameState());
}

/** 畫面端處理完這一幀的事件後清空 */
export function clearEvents(s: GameState): void {
  s.events.length = 0;
}

export function startGame(s: GameState): void {
  if (s.phase !== 'READY') return;
  s.phase = 'PLAYING';
  s.phaseTime = 0;
  s.waveBreak = WAVES.FIRST_DELAY;
}

// ==========================================
// 每幀更新
// ==========================================
export function stepGame(s: GameState, input: StepInput, dt: number): void {
  s.time += dt;
  s.phaseTime += dt;

  if (s.phase === 'READY') {
    stepAttract(s);
  } else if (s.phase === 'PLAYING') {
    updatePlayer(s, input, dt);
    updateGun(s, input, dt);
  }

  if (s.phase !== 'READY') {
    updateEnemies(s, dt);
    updateBullets(s, dt);
    updateLock(s, dt);
    updateWaves(s, dt);
    updateStreak(s, dt);
  }
  updateWreck(s, dt);
  updateParticles(s.fire, dt);
  updateParticles(s.smoke, dt);

  if (s.phase === 'DYING' && s.phaseTime >= VIEW.DEATH_CAM_TIME) {
    s.phase = 'GAME_OVER';
    s.phaseTime = 0;
    s.events.push({ type: 'gameOver' });
  }
}

/** 標題畫面：飛機在原地輕輕上下浮動，給環繞鏡頭看 */
function stepAttract(s: GameState): void {
  const p = s.player;
  p.pos.set(0, WORLD.START_ALTITUDE + Math.sin(s.time * 1.3) * 0.6, 0);
  p.bank = Math.sin(s.time * 0.7) * 0.12;
  syncPlayerOrientation(p);
}

function syncPlayerOrientation(p: PlayerState): void {
  _euler.set(p.pitch, p.yaw, p.bank, 'YXZ');
  p.quat.setFromEuler(_euler);
  // forward 只看 yaw/pitch（bank 只是視覺）
  const cp = Math.cos(p.pitch);
  p.forward.set(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
  p.right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
}

// ─── 玩家飛行 ─────────────────────────────────────────────
function updatePlayer(s: GameState, input: StepInput, dt: number): void {
  const p = s.player;

  // 1. 輸入：正規化到 ±1 → 平滑（抹平 20Hz 階梯）→ 反應曲線
  const rawX = clamp(input.moveX / FLIGHT.INPUT_FULL_SCALE, -1, 1);
  const rawY = clamp(input.moveY / FLIGHT.INPUT_FULL_SCALE, -1, 1);
  const k = 1 - Math.exp(-dt / FLIGHT.INPUT_SMOOTH_TAU);
  p.smoothX += (rawX - p.smoothX) * k;
  p.smoothY += (rawY - p.smoothY) * k;
  const steerX = responseCurve(p.smoothX);
  const steerY = responseCurve(p.smoothY);

  // 同時按住油門和煞車時以煞車為準
  p.brake = input.brake;
  p.throttle = input.throttle && !input.brake;
  const turnMult = p.brake ? FLIGHT.BRAKE_TURN_MULT : p.throttle ? FLIGHT.BOOST_TURN_MULT : 1;

  // 2. 轉向（繞世界垂直軸，所以地平線永遠是平的）
  let yawRate = -steerX * FLIGHT.YAW_RATE * turnMult;
  const distFromCenter = Math.hypot(p.pos.x, p.pos.z);
  if (distFromCenter > WORLD.ARENA_RADIUS) {
    // 出界：越遠越用力把機頭轉回中央
    const homeYaw = Math.atan2(p.pos.x, p.pos.z);
    const diff = wrapAngle(homeYaw - p.yaw);
    const strength = clamp((distFromCenter - WORLD.ARENA_RADIUS) / 150, 0, 1);
    yawRate += clamp(diff, -1, 1) * 1.4 * strength;
  }
  p.yaw = wrapAngle(p.yaw + yawRate * dt);
  p.yawRate = yawRate;

  // 3. 俯仰：跟原本一樣是速率控制；放手時慢慢回平
  p.pitch += steerY * FLIGHT.PITCH_RATE * turnMult * dt;
  if (Math.abs(steerY) < 0.06) {
    p.pitch -= p.pitch * Math.min(1, FLIGHT.AUTO_LEVEL_RATE * dt);
  }
  // 越接近海面，能俯衝的角度越小：手機一直往前傾也只會貼著海面拉平，不會一頭栽進海裡
  const floorRange = WORLD.DIVE_FLOOR_START - WORLD.DIVE_FLOOR_END;
  const diveFloor = -FLIGHT.PITCH_LIMIT * clamp((p.pos.y - WORLD.DIVE_FLOOR_END) / floorRange, 0, 1);
  p.pitch = Math.max(p.pitch, diveFloor);
  // 太高往下壓
  if (p.pos.y > WORLD.CEILING && p.pitch > -0.1) {
    p.pitch -= Math.min(1, 2 * dt) * (p.pitch + 0.1);
  }
  p.pitch = clamp(p.pitch, -FLIGHT.PITCH_LIMIT, FLIGHT.PITCH_LIMIT);

  // 4. 視覺傾斜：跟著轉向速率，左轉左傾
  const bankTarget = clamp(yawRate * FLIGHT.BANK_PER_YAW, -FLIGHT.BANK_LIMIT, FLIGHT.BANK_LIMIT);
  p.bank += (bankTarget - p.bank) * smoothFactor(FLIGHT.BANK_SMOOTH, dt);
  syncPlayerOrientation(p);

  // 5. 速度：油門 / 煞車 / 放開各有目標速度；俯衝加速、爬升減速
  let targetSpeed = FLIGHT.CRUISE_SPEED;
  let accel = FLIGHT.RELAX_ACCEL;
  if (p.brake) {
    targetSpeed = FLIGHT.BRAKE_SPEED;
    accel = FLIGHT.BRAKE_ACCEL;
  } else if (p.throttle) {
    targetSpeed = FLIGHT.BOOST_SPEED;
    accel = FLIGHT.BOOST_ACCEL;
  }
  p.speed += (targetSpeed - p.speed) * smoothFactor(accel, dt);
  const gravity = p.forward.y < 0 ? FLIGHT.DIVE_GAIN : FLIGHT.CLIMB_LOSS;
  p.speed -= p.forward.y * gravity * dt;
  p.speed = clamp(p.speed, FLIGHT.BRAKE_SPEED * 0.9, FLIGHT.MAX_SPEED);

  // 6. 移動
  p.vel.copy(p.forward).multiplyScalar(p.speed);
  p.pos.addScaledVector(p.vel, dt);

  // 7. 邊界
  const hardDist = Math.hypot(p.pos.x, p.pos.z);
  if (hardDist > WORLD.ARENA_HARD_RADIUS) {
    const f = WORLD.ARENA_HARD_RADIUS / hardDist;
    p.pos.x *= f;
    p.pos.z *= f;
  }
  if (p.pos.y > WORLD.CEILING + 40) p.pos.y = WORLD.CEILING + 40;
  if (p.pos.y < WORLD.WATER_ALTITUDE) {
    p.pos.y = WORLD.WATER_ALTITUDE;
    p.pitch = Math.max(p.pitch, 0);
  }
  // 貼海面高速飛：兩側翼尖下方拖出水花（避開正後方的鏡頭）
  if (p.pos.y < WORLD.WAKE_ALTITUDE) {
    p.wakeTimer -= dt;
    if (p.wakeTimer <= 0) {
      p.wakeTimer = 0.035;
      emitWake(s, p, 1);
      emitWake(s, p, -1);
    }
  }

  // 8. 血量低時冒煙
  if (p.hp < PLAYER.MAX_HP * PLAYER.LOW_HP_RATIO) {
    p.smokeTimer -= dt;
    if (p.smokeTimer <= 0) {
      p.smokeTimer = 0.05;
      _v1.copy(p.forward).multiplyScalar(-2.2).add(p.pos);
      emitSmoke(s, _v1, _v2.set(rand(-2, 2), rand(1, 3), rand(-2, 2)), 1.0, 0.8, 3, 0.32);
    }
  }
}

// ─── 機砲 ─────────────────────────────────────────────────
function updateGun(s: GameState, input: StepInput, dt: number): void {
  // 這一幀剛墜毀就不再開火
  if (s.phase !== 'PLAYING') return;
  const p = s.player;
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.gunIdleTime = input.fire ? 0 : p.gunIdleTime + dt;
  const regen = p.gunIdleTime > GUN.REGEN_IDLE_DELAY ? GUN.REGEN_IDLE : GUN.REGEN_FIRING;
  p.ammo = Math.min(GUN.MAX_AMMO, p.ammo + regen * dt);

  if (!input.fire || p.fireCooldown > 0) return;
  if (p.ammo < 1) {
    s.events.push({ type: 'gunEmpty' });
    p.fireCooldown = GUN.FIRE_INTERVAL;
    return;
  }

  p.ammo -= 1;
  p.fireCooldown = GUN.FIRE_INTERVAL;
  p.gunSide = p.gunSide === 1 ? -1 : 1;
  s.shotsFired++;

  // 砲口：左右翼輪流
  const muzzle = _v1.copy(p.pos)
    .addScaledVector(p.right, p.gunSide * GUN.MUZZLE_OFFSET)
    .addScaledVector(p.forward, 1.5);
  // 預設瞄準準星（兩側彈道交會點）
  const aim = _v2.copy(p.pos).addScaledVector(p.forward, GUN.CONVERGE_DIST);
  const dir = _v3.subVectors(aim, muzzle).normalize();

  // 瞄準輔助：鎖定後往提前量修正，最多修正 ASSIST_MAX_ANGLE
  const target = s.lock.locked ? findEnemy(s, s.lock.targetId) : null;
  if (target) {
    computeLead(s.lock.lead, muzzle, target.pos, target.vel, GUN.BULLET_SPEED);
    _leadDir.subVectors(s.lock.lead, muzzle).normalize();
    dir.copy(p.forward);
    rotateToward(dir, _leadDir, GUN.ASSIST_MAX_ANGLE);
  }

  spawnBullet(s, false, muzzle, dir, GUN.BULLET_SPEED, GUN.BULLET_LIFE, GUN.DAMAGE);
  s.events.push({ type: 'shot' });
}

function spawnBullet(
  s: GameState,
  enemy: boolean,
  pos: THREE.Vector3,
  dir: THREE.Vector3,
  speed: number,
  life: number,
  damage: number,
): void {
  const b = s.bullets[s.bulletCursor];
  s.bulletCursor = (s.bulletCursor + 1) % s.bullets.length;
  b.active = true;
  b.enemy = enemy;
  b.pos.copy(pos);
  b.prev.copy(pos);
  b.vel.copy(dir).multiplyScalar(speed);
  b.life = life;
  b.damage = damage;
}

function findEnemy(s: GameState, id: number | null): Enemy | null {
  if (id === null) return null;
  for (const e of s.enemies) {
    if (e.id === id) return e;
  }
  return null;
}

// ─── 子彈與碰撞 ───────────────────────────────────────────
function updateBullets(s: GameState, dt: number): void {
  const p = s.player;
  const playerAlive = s.phase === 'PLAYING';

  for (const b of s.bullets) {
    if (!b.active) continue;
    b.prev.copy(b.pos);
    b.pos.addScaledVector(b.vel, dt);
    b.life -= dt;
    if (b.life <= 0 || b.pos.y < 0) {
      b.active = false;
      continue;
    }

    if (b.enemy) {
      if (playerAlive && segmentHitsSphere(b.prev, b.pos, p.pos, PLAYER.HITBOX)) {
        b.active = false;
        damagePlayer(s, b.damage, b.prev);
      }
      continue;
    }

    for (let i = s.enemies.length - 1; i >= 0; i--) {
      const e = s.enemies[i];
      if (!segmentHitsSphere(b.prev, b.pos, e.pos, e.spec.hitbox)) continue;
      b.active = false;
      s.shotsHit++;
      e.hp -= b.damage;
      e.flash = 0.12;
      emitHitSparks(s, e.pos, b.vel);
      if (e.hp <= 0) {
        killEnemy(s, i);
      } else {
        s.events.push({ type: 'enemyHit', pos: e.pos.clone() });
        // 被打中的敵機比較會想閃
        if (e.mode === 'ENGAGE' && Math.random() < e.spec.breakChance * 0.35) startBreak(e);
      }
      break;
    }
  }
}

function damagePlayer(s: GameState, amount: number, from: THREE.Vector3): void {
  if (s.phase !== 'PLAYING') return;
  const p = s.player;
  p.hp = Math.max(0, p.hp - amount);
  s.events.push({ type: 'playerHit', from: from.clone(), damage: amount });
  emitHitSparks(s, p.pos, _v1.subVectors(p.pos, from).normalize().multiplyScalar(60));
  if (p.hp <= 0) killPlayer(s);
}

function killPlayer(s: GameState): void {
  const p = s.player;
  p.hp = 0;
  s.phase = 'DYING';
  s.phaseTime = 0;
  s.deathPos.copy(p.pos);
  s.deathTime = s.time;
  s.lock.targetId = null;
  s.lock.locked = false;
  s.lock.progress = 0;
  spawnExplosion(s, p.pos, p.vel, 1.4);
  if (p.pos.y < 15) emitSplash(s, p.pos);
  s.events.push({ type: 'playerDied', pos: p.pos.clone() });
}

function killEnemy(s: GameState, index: number): void {
  const e = s.enemies[index];
  spawnExplosion(s, e.pos, e.vel, e.kind === 'ace' ? 1.3 : 1);

  s.streak = s.streakTimer > 0 ? s.streak + 1 : 1;
  s.streakTimer = SCORING.STREAK_WINDOW;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  const multiplier = Math.min(s.streak, SCORING.MAX_MULTIPLIER);
  const points = e.spec.score * multiplier;
  s.score += points;
  s.kills++;
  s.events.push({ type: 'enemyKilled', pos: e.pos.clone(), points, multiplier, kind: e.kind });

  if (s.lock.targetId === e.id) {
    s.lock.targetId = null;
    s.lock.locked = false;
    s.lock.progress = 0;
  }
  s.enemies.splice(index, 1);
}

function updateStreak(s: GameState, dt: number): void {
  if (s.streakTimer <= 0) return;
  s.streakTimer -= dt;
  if (s.streakTimer <= 0) {
    s.streakTimer = 0;
    s.streak = 0;
  }
}

// ─── 鎖定 ─────────────────────────────────────────────────
function updateLock(s: GameState, dt: number): void {
  const lock = s.lock;
  if (s.phase !== 'PLAYING') {
    lock.targetId = null;
    lock.progress = 0;
    lock.locked = false;
    return;
  }
  const p = s.player;

  // 先看目前的目標是否還在放寬的圓錐內（有黏性，不會一抖就斷）
  let target = findEnemy(s, lock.targetId);
  if (target && !inLockCone(p, target, GUN.LOCK_CONE * GUN.LOCK_KEEP_MULT)) target = null;

  if (!target) {
    // 找新目標：角度最小的優先，距離當次要
    let best: Enemy | null = null;
    let bestScore = Infinity;
    for (const e of s.enemies) {
      _v1.subVectors(e.pos, p.pos);
      const dist = _v1.length();
      if (dist > GUN.LOCK_RANGE) continue;
      const angle = p.forward.angleTo(_v1);
      if (angle > GUN.LOCK_CONE) continue;
      const score = angle + (dist / GUN.LOCK_RANGE) * 0.1;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best && best.id !== lock.targetId) {
      lock.targetId = best.id;
      lock.progress = 0;
      lock.locked = false;
    }
    target = best;
  }

  if (target) {
    lock.progress = Math.min(1, lock.progress + dt / GUN.LOCK_TIME);
    computeLead(lock.lead, p.pos, target.pos, target.vel, GUN.BULLET_SPEED);
    if (!lock.locked && lock.progress >= 1) {
      lock.locked = true;
      s.events.push({ type: 'lockOn' });
    }
  } else {
    lock.progress = Math.max(0, lock.progress - dt * 3);
    lock.locked = false;
    if (lock.progress <= 0) lock.targetId = null;
  }
}

function inLockCone(p: PlayerState, e: Enemy, cone: number): boolean {
  _v1.subVectors(e.pos, p.pos);
  if (_v1.length() > GUN.LOCK_RANGE * 1.15) return false;
  return p.forward.angleTo(_v1) <= cone;
}

// ─── 敵機 AI ──────────────────────────────────────────────
function updateEnemies(s: GameState, dt: number): void {
  const p = s.player;
  const playerAlive = s.phase === 'PLAYING';
  let warning = false;

  for (let i = s.enemies.length - 1; i >= 0; i--) {
    const e = s.enemies[i];
    updateEnemy(s, e, dt, playerAlive);
    if (e.aiming && e.windup > 0.15) warning = true;

    // 相撞：敵機爆炸，玩家受重傷
    if (playerAlive && e.pos.distanceTo(p.pos) < ENEMY.RAM_DIST) {
      damagePlayer(s, ENEMY.RAM_DAMAGE, e.pos);
      killEnemy(s, i);
    }
  }
  s.aimWarning = warning && playerAlive;
}

function startBreak(e: Enemy): void {
  e.mode = 'BREAK';
  e.modeTimer = rand(1.3, 2.1);
  // 往左或右急轉，帶一點上下
  _v1.crossVectors(e.forward, UP);
  if (_v1.lengthSq() < 1e-6) _v1.set(1, 0, 0);
  _v1.normalize().multiplyScalar(Math.random() < 0.5 ? -1 : 1);
  e.breakDir.copy(_v1).addScaledVector(UP, rand(-0.4, 0.5)).normalize();
}

function updateEnemy(s: GameState, e: Enemy, dt: number, playerAlive: boolean): void {
  const p = s.player;
  const spec = e.spec;
  const desired = _v2;
  const toPlayer = _v3.subVectors(p.pos, e.pos);
  const dist = toPlayer.length();

  e.flash = Math.max(0, e.flash - dt);
  e.modeTimer -= dt;

  if (!playerAlive) {
    // 玩家掛了：維持航向、稍微爬升
    desired.copy(e.forward).addScaledVector(UP, 0.1).normalize();
  } else if (e.mode === 'ENGAGE') {
    // 追擊：瞄玩家的預測位置（leadSkill 越高越準）
    const leadT = Math.min(dist / ENEMY.BULLET_SPEED, 1.5) * spec.leadSkill;
    desired.copy(p.pos).addScaledVector(p.vel, leadT).sub(e.pos).normalize();

    // 迎頭交錯後太近 → 拉開，過一陣子再回頭
    if (dist < ENEMY.EXTEND_DIST && e.forward.dot(toPlayer) < 0) {
      e.mode = 'EXTEND';
      e.modeTimer = rand(2.2, 3.4);
    }
    // 被玩家咬尾（玩家機頭對著它）→ 有機率急轉閃避
    if (e.modeTimer <= 0 && dist < 280) {
      _v1.subVectors(e.pos, p.pos);
      if (p.forward.angleTo(_v1) < 0.25) {
        if (Math.random() < spec.breakChance * 0.5) startBreak(e);
        else e.modeTimer = 0.5;
      }
    }
  } else if (e.mode === 'BREAK') {
    desired.copy(e.forward).addScaledVector(e.breakDir, 1.6).normalize();
    if (e.modeTimer <= 0) {
      e.mode = 'ENGAGE';
      e.modeTimer = rand(2.0, 3.0);
    }
  } else {
    // EXTEND：直飛、稍微爬升，遠離玩家
    _v1.set(e.forward.x, 0, e.forward.z).normalize();
    desired.copy(_v1).addScaledVector(UP, 0.15).normalize();
    if (e.modeTimer <= 0) {
      e.mode = 'ENGAGE';
      e.modeTimer = rand(1.0, 2.0);
    }
  }

  // 高度與邊界限制
  if (e.pos.y < ENEMY.MIN_ALTITUDE) {
    const t = 1 - e.pos.y / ENEMY.MIN_ALTITUDE;
    desired.y = Math.max(desired.y, 0.15 + t * 0.6);
    desired.normalize();
  } else if (e.pos.y > ENEMY.MAX_ALTITUDE) {
    desired.y = Math.min(desired.y, -0.2);
    desired.normalize();
  }
  const distFromCenter = Math.hypot(e.pos.x, e.pos.z);
  if (distFromCenter > WORLD.ARENA_RADIUS * 1.1) {
    _v1.set(-e.pos.x, 0, -e.pos.z).normalize();
    desired.lerp(_v1, 0.6).normalize();
  }

  // 轉向：每秒最多轉 turnRate；傾斜跟著轉的方向
  _v1.crossVectors(e.forward, desired);
  const turnSide = _v1.dot(UP);
  rotateToward(e.forward, desired, spec.turnRate * dt);
  // 避免垂直時姿態計算退化
  if (Math.abs(e.forward.y) > 0.9) {
    e.forward.y = Math.sign(e.forward.y) * 0.9;
    e.forward.normalize();
  }
  e.bank += (clamp(turnSide * 3, -1.1, 1.1) - e.bank) * smoothFactor(4, dt);

  // 追擊加速（見 config 的 CHASE_BOOST_*）
  let targetSpeed = spec.speed;
  if (playerAlive && e.mode === 'ENGAGE') {
    const boost = clamp((dist - ENEMY.CHASE_BOOST_START) / ENEMY.CHASE_BOOST_RANGE, 0, ENEMY.CHASE_BOOST_MAX);
    targetSpeed *= 1 + boost;
  }
  e.speed += (targetSpeed - e.speed) * smoothFactor(1.5, dt);
  e.vel.copy(e.forward).multiplyScalar(e.speed);
  e.pos.addScaledVector(e.vel, dt);
  e.pos.y = Math.max(e.pos.y, 12);

  // 模型姿態：機頭朝 forward，再繞機身轉 bank
  _v1.copy(e.forward);
  _m1.lookAt(_origin, _v1, UP);
  e.quat.setFromRotationMatrix(_m1);
  _q1.setFromAxisAngle(_v4.set(0, 0, 1), e.bank);
  e.quat.multiply(_q1);

  // 受損冒煙
  if (e.hp < e.maxHp * 0.5) {
    e.smokeTimer -= dt;
    if (e.smokeTimer <= 0) {
      e.smokeTimer = 0.06;
      _v1.copy(e.forward).multiplyScalar(-2.5).add(e.pos);
      emitSmoke(s, _v1, _v4.set(rand(-1.5, 1.5), rand(0.5, 2), rand(-1.5, 1.5)), 1.2, 1, 3.5, 0.3);
    }
  }

  updateEnemyGun(s, e, dt, playerAlive, dist);
}

function updateEnemyGun(s: GameState, e: Enemy, dt: number, playerAlive: boolean, dist: number): void {
  const p = s.player;
  const spec = e.spec;
  _v1.subVectors(p.pos, e.pos);
  const angle = e.forward.angleTo(_v1);
  const canShoot = playerAlive && e.mode === 'ENGAGE' && dist < spec.fireRange && angle < spec.fireCone;

  e.aiming = canShoot;
  e.windup = canShoot ? e.windup + dt : Math.max(0, e.windup - dt * 2);
  e.cooldown -= dt;

  if (e.burstLeft > 0) {
    e.burstTimer -= dt;
    if (e.burstTimer > 0) return;
    e.burstLeft--;
    e.burstTimer = spec.burstGap;
    if (e.burstLeft === 0) {
      e.cooldown = rand(spec.cooldownMin, spec.cooldownMax);
      e.windup = 0;
    }
    if (!playerAlive) return;
    // 朝玩家（含提前量）開火，加上散佈
    const muzzle = _v3.copy(e.pos).addScaledVector(e.forward, 2.5);
    const aim = _v4.copy(p.pos).addScaledVector(p.vel, (dist / ENEMY.BULLET_SPEED) * spec.leadSkill);
    const dir = aim.sub(muzzle).normalize();
    dir.x += rand(-0.5, 0.5) * spec.spread;
    dir.y += rand(-0.5, 0.5) * spec.spread;
    dir.z += rand(-0.5, 0.5) * spec.spread;
    dir.normalize();
    spawnBullet(s, true, muzzle, dir, ENEMY.BULLET_SPEED, ENEMY.BULLET_LIFE, spec.damage);
    return;
  }

  if (canShoot && e.windup >= spec.windup && e.cooldown <= 0) {
    e.burstLeft = randInt(spec.burstMin, spec.burstMax);
    e.burstTimer = 0;
  }
}

// ─── 波次 ─────────────────────────────────────────────────
function updateWaves(s: GameState, dt: number): void {
  if (s.phase !== 'PLAYING') return;

  if (!s.waveActive) {
    s.waveBreak -= dt;
    if (s.waveBreak <= 0) startWave(s, s.wave + 1);
    return;
  }

  if (s.waveQueue.length > 0 && s.enemies.length < s.waveConcurrent) {
    s.spawnTimer -= dt;
    if (s.spawnTimer <= 0) {
      const kind = s.waveQueue.shift();
      if (kind) spawnEnemy(s, kind);
      s.spawnTimer = rand(WAVES.SPAWN_GAP_MIN, WAVES.SPAWN_GAP_MAX);
    }
  }

  if (s.waveQueue.length === 0 && s.enemies.length === 0) {
    const bonus = WAVES.CLEAR_BONUS_PER_WAVE * s.wave;
    const before = s.player.hp;
    s.player.hp = Math.min(PLAYER.MAX_HP, s.player.hp + WAVES.REPAIR_HP);
    s.score += bonus;
    s.waveActive = false;
    s.waveBreak = WAVES.BREAK_TIME;
    s.events.push({ type: 'waveClear', wave: s.wave, bonus, repaired: Math.round(s.player.hp - before) });
  }
}

function startWave(s: GameState, wave: number): void {
  const spec = getWaveSpec(wave);
  s.wave = wave;
  s.waveActive = true;
  s.waveQueue = [...spec.kinds];
  s.waveConcurrent = spec.concurrent;
  s.waveHpMult = spec.hpMult;
  s.waveTurnMult = spec.turnMult;
  s.spawnTimer = 0.3;
  s.events.push({ type: 'waveStart', wave, count: spec.kinds.length });
}

function spawnEnemy(s: GameState, kind: EnemyKind): void {
  const p = s.player;
  const base = ENEMY_SPECS[kind];
  const spec: EnemySpec = {
    ...base,
    hp: Math.round(base.hp * s.waveHpMult),
    turnRate: base.turnRate * s.waveTurnMult,
  };

  // 前兩波從前方出現，之後任何方向，但不會從正後方偷襲
  const spreadAngle = s.wave <= 2 ? 0.6 : 2.4;
  const yaw = p.yaw + rand(-spreadAngle, spreadAngle);
  const dist = rand(ENEMY.SPAWN_DIST_MIN, ENEMY.SPAWN_DIST_MAX);
  const pos = new THREE.Vector3(
    p.pos.x - Math.sin(yaw) * dist,
    clamp(p.pos.y + rand(-40, 40), 60, 260),
    p.pos.z - Math.cos(yaw) * dist,
  );
  const fromCenter = Math.hypot(pos.x, pos.z);
  if (fromCenter > WORLD.ARENA_RADIUS) {
    const f = (WORLD.ARENA_RADIUS * 0.9) / fromCenter;
    pos.x *= f;
    pos.z *= f;
  }

  // 大致朝玩家飛來，但偏一點角度，不會直接正面對撞
  const forward = new THREE.Vector3().subVectors(p.pos, pos);
  forward.y *= 0.3;
  forward.normalize();
  forward.applyAxisAngle(UP, rand(-0.5, 0.5));

  const enemy: Enemy = {
    id: s.nextId++,
    kind,
    spec,
    pos,
    vel: forward.clone().multiplyScalar(spec.speed),
    forward,
    quat: new THREE.Quaternion(),
    speed: spec.speed,
    bank: 0,
    hp: spec.hp,
    maxHp: spec.hp,
    mode: 'ENGAGE',
    modeTimer: rand(1, 2),
    breakDir: new THREE.Vector3(1, 0, 0),
    windup: 0,
    burstLeft: 0,
    burstTimer: 0,
    cooldown: rand(1, 2),
    flash: 0,
    aiming: false,
    smokeTimer: 0,
  };
  s.enemies.push(enemy);
}

// ─── 粒子特效 ─────────────────────────────────────────────
function emit(
  pool: ParticlePool,
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  life: number,
  startSize: number,
  endSize: number,
  drag: number,
  gravity: number,
  color: THREE.Color,
): void {
  const pt = pool.items[pool.cursor];
  pool.cursor = (pool.cursor + 1) % pool.items.length;
  pt.active = true;
  pt.pos.copy(pos);
  pt.vel.copy(vel);
  pt.life = life;
  pt.maxLife = life;
  pt.startSize = startSize;
  pt.endSize = endSize;
  pt.drag = drag;
  pt.gravity = gravity;
  pt.color.copy(color);
}

function emitSmoke(
  s: GameState,
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  life: number,
  startSize: number,
  endSize: number,
  gray: number,
): void {
  emit(s.smoke, pos, vel, life, startSize, endSize, 1.5, -2, _color.setRGB(gray, gray, gray));
}

/** 隨機單位向量 × 速度 */
function randomVelocity(out: THREE.Vector3, min: number, max: number): THREE.Vector3 {
  out.set(rand(-1, 1), rand(-1, 1), rand(-1, 1));
  if (out.lengthSq() < 1e-4) out.set(0, 1, 0);
  return out.normalize().multiplyScalar(rand(min, max));
}

function spawnExplosion(s: GameState, pos: THREE.Vector3, inheritVel: THREE.Vector3, scale: number): void {
  const vel = _v4;
  // 白熱閃光核心
  emit(s.fire, pos, vel.set(0, 0, 0), 0.22, 3 * scale, 16 * scale, 0, 0, _color.setRGB(1, 0.95, 0.8));
  // 火球
  for (let i = 0; i < 10; i++) {
    randomVelocity(vel, 4, 22).addScaledVector(inheritVel, 0.35);
    emit(s.fire, pos, vel, rand(0.45, 0.9), rand(2.5, 4) * scale, rand(5, 8) * scale, 2.5, 0,
      _color.setRGB(1, rand(0.35, 0.6), 0.08));
  }
  // 火花
  for (let i = 0; i < 16; i++) {
    randomVelocity(vel, 40, 95).addScaledVector(inheritVel, 0.3);
    emit(s.fire, pos, vel, rand(0.35, 0.7), 0.9 * scale, 0.2, 1.2, 20, _color.setRGB(1, 0.8, 0.4));
  }
  // 黑煙
  for (let i = 0; i < 10; i++) {
    randomVelocity(vel, 3, 10).addScaledVector(inheritVel, 0.2);
    const gray = rand(0.28, 0.4);
    emit(s.smoke, pos, vel, rand(1.4, 2.2), rand(2, 3) * scale, rand(5, 8) * scale, 1.2, -3,
      _color.setRGB(gray, gray, gray * 1.05));
  }
  // 碎片（受重力往下掉）
  for (let i = 0; i < 7; i++) {
    randomVelocity(vel, 18, 45).addScaledVector(inheritVel, 0.5);
    vel.y += 12;
    emit(s.smoke, pos, vel, rand(1.2, 1.8), 0.9 * scale, 0.6 * scale, 0.4, 45, _color.setRGB(0.08, 0.08, 0.1));
  }
}

/** 撞到海面：白色水花往上噴 */
function emitSplash(s: GameState, pos: THREE.Vector3): void {
  const vel = _v4;
  _v3.set(pos.x, WORLD.WATER_ALTITUDE, pos.z);
  for (let i = 0; i < 14; i++) {
    vel.set(rand(-18, 18), rand(25, 55), rand(-18, 18));
    emit(s.fire, _v3, vel, rand(0.5, 0.9), rand(0.8, 1.4), 0.3, 0.5, 60, _color.setRGB(0.75, 0.85, 0.95));
  }
  for (let i = 0; i < 8; i++) {
    vel.set(rand(-8, 8), rand(4, 12), rand(-8, 8));
    emit(s.smoke, _v3, vel, rand(1, 1.6), 2, rand(5, 8), 1.5, -1, _color.setRGB(0.9, 0.95, 1));
  }
}

/** 貼海面飛行的水花：從翼尖下方往外、往上噴，越快噴越高 */
function emitWake(s: GameState, p: PlayerState, side: 1 | -1): void {
  _v3.copy(p.pos).addScaledVector(p.right, side * 2.8);
  _v3.y = WORLD.WATER_ALTITUDE - 1;
  const lift = clamp(p.speed / 100, 0.6, 1.6);
  _v4.copy(p.right).multiplyScalar(side * rand(6, 14));
  _v4.y = rand(8, 16) * lift;
  _v4.addScaledVector(p.forward, p.speed * 0.5);
  emit(s.fire, _v3, _v4, rand(0.15, 0.25), rand(0.25, 0.4), 0.1, 1, 40, _color.setRGB(0.4, 0.48, 0.55));
}

/** 墜毀後在墜落點冒一陣子黑煙，結算畫面才有東西看 */
function updateWreck(s: GameState, dt: number): void {
  if (s.phase !== 'DYING' && s.phase !== 'GAME_OVER') return;
  if (s.time - s.deathTime > 4) return;
  s.wreckSmokeTimer -= dt;
  if (s.wreckSmokeTimer > 0) return;
  s.wreckSmokeTimer = 0.07;
  _v3.copy(s.deathPos);
  _v3.y = Math.max(_v3.y, WORLD.WATER_ALTITUDE);
  emitSmoke(s, _v3, _v4.set(rand(-2, 2), rand(6, 12), rand(-2, 2)), rand(2, 3), 2, 7, rand(0.22, 0.32));
}

function emitHitSparks(s: GameState, pos: THREE.Vector3, incoming: THREE.Vector3): void {
  _v1.copy(incoming).normalize().multiplyScalar(-25);
  for (let i = 0; i < 6; i++) {
    randomVelocity(_v4, 15, 40).add(_v1);
    emit(s.fire, pos, _v4, rand(0.15, 0.3), 0.7, 0.1, 2, 0, _color.setRGB(1, 0.85, 0.5));
  }
}

function updateParticles(pool: ParticlePool, dt: number): void {
  for (const pt of pool.items) {
    if (!pt.active) continue;
    pt.life -= dt;
    if (pt.life <= 0) {
      pt.active = false;
      continue;
    }
    pt.vel.multiplyScalar(Math.max(0, 1 - pt.drag * dt));
    pt.vel.y -= pt.gravity * dt;
    pt.pos.addScaledVector(pt.vel, dt);
  }
}
