// games/game5/render.ts — 把 World 畫到 <canvas>（2D）。只讀 World，不改遊戲狀態。
// 發光的圓點都預先畫成小圖（sprite）再貼上去，避免每顆敵人每幀都做 shadowBlur。

import { COLORS, ICON_STROKE, POWERUPS, TUNING as T, type PowerupType } from './config';
import { multiplierColor, multiplierFor, type PendingSwarm, type World } from './engine';

const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const BG_PAD = 16; // 背景比畫面大一圈，畫面震動時邊緣不會露黑

export interface RenderCache {
  key: string;
  background: HTMLCanvasElement | null;
  sprites: Map<string, HTMLCanvasElement>;
  icons: Map<PowerupType, Path2D>;
}

export function createRenderCache(): RenderCache {
  return { key: '', background: null, sprites: new Map(), icons: new Map() };
}

// ─── 共用小工具 ───────────────────────────────────────────────────────

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function padScore(score: number): string {
  return Math.max(0, Math.floor(score)).toString().padStart(6, '0');
}

export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[TiltToLive] 無法建立離屏 canvas');
  return { canvas, ctx };
}

function circlePath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
}

/** 不依賴 ctx.roundRect（舊電視瀏覽器沒有） */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
  }
}

// ─── 預先畫好的 sprite ────────────────────────────────────────────────

/** 取得（或建立）一張以中心為原點、半徑 cssRadius 的 sprite */
function getSprite(
  cache: RenderCache,
  key: string,
  cssRadius: number,
  dpr: number,
  paint: (ctx: CanvasRenderingContext2D, r: number) => void,
): HTMLCanvasElement {
  const existing = cache.sprites.get(key);
  if (existing) return existing;
  const r = Math.max(2, cssRadius * dpr);
  const { canvas, ctx } = makeCanvas(r * 2, r * 2);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  paint(ctx, r);
  cache.sprites.set(key, canvas);
  return canvas;
}

function paintEnemy(ctx: CanvasRenderingContext2D, r: number, frozen: boolean): void {
  const core = r / 2.6;
  const glowRgb = frozen ? '34,197,94' : '239,68,68';
  const glow = ctx.createRadialGradient(0, 0, core * 0.6, 0, 0, r);
  glow.addColorStop(0, `rgba(${glowRgb},0.55)`);
  glow.addColorStop(0.45, `rgba(${glowRgb},0.18)`);
  glow.addColorStop(1, `rgba(${glowRgb},0)`);
  ctx.fillStyle = glow;
  circlePath(ctx, 0, 0, r);
  ctx.fill();

  const body = ctx.createRadialGradient(-core * 0.3, -core * 0.3, core * 0.1, 0, 0, core);
  if (frozen) {
    body.addColorStop(0, '#f0fdf4');
    body.addColorStop(0.4, '#86efac');
    body.addColorStop(1, '#16a34a');
  } else {
    body.addColorStop(0, '#fee2e2');
    body.addColorStop(0.35, '#fca5a5');
    body.addColorStop(1, '#ef4444');
  }
  ctx.fillStyle = body;
  circlePath(ctx, 0, 0, core);
  ctx.fill();

  if (frozen) {
    // 冰殼：白色外框 + 一道反光，一眼看出「可以撞碎」
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = core * 0.22;
    circlePath(ctx, 0, 0, core * 1.08);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = core * 0.16;
    ctx.beginPath();
    ctx.moveTo(-core * 0.45, -core * 0.05);
    ctx.lineTo(-core * 0.05, -core * 0.45);
    ctx.stroke();
  }
}

function paintGlow(ctx: CanvasRenderingContext2D, r: number, color: string, strength: number): void {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `rgba(255,255,255,${strength})`);
  g.addColorStop(0.18, color);
  g.addColorStop(0.45, `${color}55`);
  g.addColorStop(1, `${color}00`);
  ctx.fillStyle = g;
  circlePath(ctx, 0, 0, r);
  ctx.fill();
}

function paintOrbGlow(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
  g.addColorStop(0, `${color}88`);
  g.addColorStop(0.5, `${color}2a`);
  g.addColorStop(1, `${color}00`);
  ctx.fillStyle = g;
  circlePath(ctx, 0, 0, r);
  ctx.fill();
}

function getIconPath(cache: RenderCache, type: PowerupType): Path2D {
  const existing = cache.icons.get(type);
  if (existing) return existing;
  const path = new Path2D(POWERUPS[type].icon.d);
  cache.icons.set(type, path);
  return path;
}

function drawIcon(ctx: CanvasRenderingContext2D, cache: RenderCache, type: PowerupType, x: number, y: number, size: number, color: string): void {
  const icon = POWERUPS[type].icon;
  const path = getIconPath(cache, type);
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  if (icon.fill) {
    ctx.fillStyle = color;
    ctx.fill(path, icon.rule);
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = ICON_STROKE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(path);
  }
  ctx.restore();
}

// ─── 背景（尺寸變了才重畫） ───────────────────────────────────────────

function buildBackground(world: World, dpr: number): HTMLCanvasElement {
  const width = world.w + BG_PAD * 2;
  const height = world.h + BG_PAD * 2;
  const { canvas, ctx } = makeCanvas(width * dpr, height * dpr);
  ctx.scale(dpr, dpr);

  const cx = width / 2;
  const cy = height / 2;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(width, height) / 2);
  gradient.addColorStop(0, '#0b1224');
  gradient.addColorStop(0.7, '#050510');
  gradient.addColorStop(1, '#020208');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 格線（和原版一樣淡），以場地左上角對齊
  const grid = 48 * world.unit;
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = BG_PAD % grid; x < width; x += grid) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
  }
  for (let y = BG_PAD % grid; y < height; y += grid) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
  }
  ctx.stroke();

  // 場地邊框：讓人知道牆在哪
  ctx.strokeStyle = 'rgba(103,232,249,0.25)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(103,232,249,0.6)';
  ctx.shadowBlur = 10 * dpr;
  ctx.strokeRect(BG_PAD + 1, BG_PAD + 1, world.w - 2, world.h - 2);
  return canvas;
}

function ensureCache(cache: RenderCache, world: World, dpr: number): void {
  const key = `${Math.round(world.w)}x${Math.round(world.h)}@${dpr.toFixed(3)}`;
  if (cache.key === key && cache.background) return;
  cache.key = key;
  cache.sprites.clear();
  cache.background = buildBackground(world, dpr);
}

// ─── 主畫面 ───────────────────────────────────────────────────────────

export function renderWorld(ctx: CanvasRenderingContext2D, world: World, cache: RenderCache, dpr: number): void {
  ensureCache(cache, world, dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, world.w, world.h);

  const shakeX = world.shake > 0 ? (Math.random() * 2 - 1) * world.shake : 0;
  const shakeY = world.shake > 0 ? (Math.random() * 2 - 1) * world.shake : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);
  if (cache.background) {
    ctx.drawImage(cache.background, -BG_PAD, -BG_PAD, world.w + BG_PAD * 2, world.h + BG_PAD * 2);
  }
  if (world.freezeLeft > 0) drawFreezeTint(ctx, world);
  for (const swarm of world.pending) drawSwarmWarning(ctx, world, swarm);
  drawVortex(ctx, world);
  drawPowerups(ctx, world, cache, dpr);
  drawEnemies(ctx, world, cache, dpr);

  ctx.globalCompositeOperation = 'lighter';
  drawParticles(ctx, world, cache, dpr);
  drawMissiles(ctx, world, cache, dpr);
  ctx.globalCompositeOperation = 'source-over';

  drawShockwaves(ctx, world);
  drawRings(ctx, world);
  if (world.phase === 'ready' || world.phase === 'playing') drawPlayer(ctx, world, cache, dpr);
  if (world.phase === 'dying' && world.killer) drawKillerMark(ctx, world);
  drawFloaters(ctx, world);
  ctx.restore();

  drawFlash(ctx, world);
  if (world.phase === 'playing' || world.phase === 'dying') drawHud(ctx, world, cache, dpr);
  drawBanner(ctx, world, dpr);
}

function drawFreezeTint(ctx: CanvasRenderingContext2D, world: World): void {
  const alpha = clamp01(world.freezeLeft / 0.3);
  ctx.fillStyle = `rgba(34,197,94,${0.07 * alpha})`;
  ctx.fillRect(0, 0, world.w, world.h);
  ctx.strokeStyle = `rgba(134,239,172,${0.4 * alpha})`;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, world.w - 6, world.h - 6);
}

/** 成群敵人進場前：那一段邊緣亮紅光、箭頭往內指 */
function drawSwarmWarning(ctx: CanvasRenderingContext2D, world: World, swarm: PendingSwarm): void {
  const unit = world.unit;
  const progress = clamp01(1 - (swarm.at - world.clock) / T.SWARM_WARNING);
  const pulse = 0.55 + 0.45 * Math.sin(world.time * 18);
  const alpha = (0.3 + 0.55 * progress) * pulse;
  const depth = 50 * unit;
  const half = 110 * unit;

  let x = 0;
  let y = 0;
  let angle = 0;
  if (swarm.side === 'left') {
    y = swarm.along * world.h;
  } else if (swarm.side === 'right') {
    x = world.w;
    y = swarm.along * world.h;
    angle = Math.PI;
  } else if (swarm.side === 'top') {
    x = swarm.along * world.w;
    angle = Math.PI / 2;
  } else {
    x = swarm.along * world.w;
    y = world.h;
    angle = -Math.PI / 2;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const band = ctx.createLinearGradient(0, 0, depth, 0);
  band.addColorStop(0, `rgba(239,68,68,${alpha})`);
  band.addColorStop(1, 'rgba(239,68,68,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, -half, depth, half * 2);

  ctx.fillStyle = `rgba(254,202,202,${0.5 + 0.5 * progress})`;
  for (const offset of [-half * 0.55, 0, half * 0.55]) {
    ctx.beginPath();
    ctx.moveTo(10 * unit, offset - 8 * unit);
    ctx.lineTo(22 * unit, offset);
    ctx.lineTo(10 * unit, offset + 8 * unit);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawVortex(ctx: CanvasRenderingContext2D, world: World): void {
  const v = world.vortex;
  if (!v) return;
  const unit = world.unit;
  const appear = easeOutCubic(clamp01((T.VORTEX_DURATION - v.left) / 0.25));
  const ending = v.left < 0.5 ? 1 + 0.08 * Math.sin(world.time * 40) : 1;
  const radius = T.VORTEX_RADIUS * unit * appear * ending;

  const g = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, radius);
  g.addColorStop(0, 'rgba(10,0,20,0.95)');
  g.addColorStop(0.2, 'rgba(168,85,247,0.38)');
  g.addColorStop(0.7, 'rgba(168,85,247,0.12)');
  g.addColorStop(1, 'rgba(168,85,247,0)');
  ctx.fillStyle = g;
  circlePath(ctx, v.x, v.y, radius);
  ctx.fill();

  // 旋臂
  ctx.strokeStyle = 'rgba(192,132,252,0.6)';
  ctx.lineWidth = 2.5 * unit;
  ctx.lineCap = 'round';
  for (let arm = 0; arm < 4; arm++) {
    const base = (arm / 4) * Math.PI * 2 + world.time * 5;
    ctx.beginPath();
    for (let s = 0; s <= 1.0001; s += 0.08) {
      const r = radius * (1 - s) * 0.95;
      const a = base + s * 3.2;
      const px = v.x + Math.cos(a) * r;
      const py = v.y + Math.sin(a) * r;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(168,85,247,0.35)';
  ctx.lineWidth = 1.5 * unit;
  circlePath(ctx, v.x, v.y, radius);
  ctx.stroke();

  ctx.fillStyle = '#0b0014';
  ctx.strokeStyle = '#c084fc';
  ctx.lineWidth = 2 * unit;
  circlePath(ctx, v.x, v.y, 10 * unit * appear);
  ctx.fill();
  ctx.stroke();
}

function drawPowerups(ctx: CanvasRenderingContext2D, world: World, cache: RenderCache, dpr: number): void {
  const unit = world.unit;
  const baseR = T.POWERUP_RADIUS * unit;
  for (const pu of world.powerups) {
    const info = POWERUPS[pu.type];
    const remaining = T.POWERUP_LIFETIME - pu.age;
    const pop = pu.age < 0.35 ? Math.max(0, easeOutBack(pu.age / 0.35)) : 1;
    const bob = 1 + Math.sin(world.time * 5 + pu.x) * 0.06;
    const r = baseR * pop * bob;

    // 快消失時閃爍，越接近越快
    let alpha = 1;
    if (remaining < T.POWERUP_BLINK) {
      const rate = remaining < 1 ? 22 : 11;
      alpha = 0.35 + 0.65 * Math.abs(Math.cos(world.time * rate));
    }
    ctx.globalAlpha = alpha;

    const glowR = baseR * 2.6;
    const glow = getSprite(cache, `orb:${info.color}`, glowR, dpr, (c, gr) => paintOrbGlow(c, gr, info.color));
    ctx.drawImage(glow, pu.x - glowR * pop, pu.y - glowR * pop, glowR * 2 * pop, glowR * 2 * pop);

    // 實心底色 + 邊緣壓暗，白色圖示才有足夠對比
    circlePath(ctx, pu.x, pu.y, r);
    ctx.fillStyle = info.color;
    ctx.fill();
    const shade = ctx.createRadialGradient(pu.x, pu.y - r * 0.2, r * 0.4, pu.x, pu.y, r);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5 * unit;
    ctx.stroke();

    drawIcon(ctx, cache, pu.type, pu.x, pu.y, r * 1.25, '#ffffff');

    // 剩餘時間環
    ctx.strokeStyle = info.color;
    ctx.globalAlpha = alpha * 0.75;
    ctx.lineWidth = 2 * unit;
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, baseR * 1.5 * pop, -Math.PI / 2, -Math.PI / 2 + (remaining / T.POWERUP_LIFETIME) * Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawEnemies(ctx: CanvasRenderingContext2D, world: World, cache: RenderCache, dpr: number): void {
  const unit = world.unit;
  const r = T.ENEMY_RADIUS * unit;
  const glowR = r * 2.6;
  const normal = getSprite(cache, 'enemy', glowR, dpr, (c, gr) => paintEnemy(c, gr, false));
  const frozen = getSprite(cache, 'enemy-frozen', glowR, dpr, (c, gr) => paintEnemy(c, gr, true));
  const pulse = 0.5 + 0.5 * Math.sin(world.time * 20);

  for (const e of world.enemies) {
    if (!e.alive) continue;
    if (e.spawnLeft > 0) {
      // 出現預告：縮小中的紅圈 + 半透明本體
      const t = e.spawnLeft / T.SPAWN_TELEGRAPH;
      ctx.strokeStyle = `rgba(248,113,113,${0.35 + 0.5 * pulse})`;
      ctx.lineWidth = 2 * unit;
      circlePath(ctx, e.x, e.y, r * (1.2 + 2.2 * t));
      ctx.stroke();
      ctx.globalAlpha = 0.25 + 0.35 * (1 - t);
      ctx.drawImage(e.frozen ? frozen : normal, e.x - glowR, e.y - glowR, glowR * 2, glowR * 2);
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.drawImage(e.frozen ? frozen : normal, e.x - glowR, e.y - glowR, glowR * 2, glowR * 2);
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, world: World, cache: RenderCache, dpr: number): void {
  for (const p of world.particles) {
    const sprite = getSprite(cache, `p:${p.color}`, 12, dpr, (c, gr) => paintGlow(c, gr, p.color, 0.9));
    const s = p.size * 2.2;
    ctx.globalAlpha = clamp01(p.life / p.maxLife);
    ctx.drawImage(sprite, p.x - s, p.y - s, s * 2, s * 2);
  }
  ctx.globalAlpha = 1;
}

function drawMissiles(ctx: CanvasRenderingContext2D, world: World, cache: RenderCache, dpr: number): void {
  const unit = world.unit;
  const r = T.MISSILE_RADIUS * unit * 3;
  const sprite = getSprite(cache, 'missile', r, dpr, (c, gr) => paintGlow(c, gr, '#60a5fa', 1));
  ctx.strokeStyle = 'rgba(191,219,254,0.85)';
  ctx.lineWidth = 2.5 * unit;
  ctx.lineCap = 'round';
  for (const m of world.missiles) {
    ctx.beginPath();
    ctx.moveTo(m.x - m.vx * 0.04, m.y - m.vy * 0.04);
    ctx.lineTo(m.x, m.y);
    ctx.stroke();
    ctx.drawImage(sprite, m.x - r, m.y - r, r * 2, r * 2);
  }
}

function drawShockwaves(ctx: CanvasRenderingContext2D, world: World): void {
  const unit = world.unit;
  for (const s of world.shockwaves) {
    const progress = s.radius / s.maxRadius;
    ctx.globalAlpha = 1 - progress * 0.7;
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 14 * unit;
    circlePath(ctx, s.x, s.y, s.radius);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4 * unit;
    circlePath(ctx, s.x, s.y, s.radius);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawRings(ctx: CanvasRenderingContext2D, world: World): void {
  for (const ring of world.rings) {
    const t = 1 - ring.life / ring.maxLife;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = ring.width * (1 - t * 0.5);
    circlePath(ctx, ring.x, ring.y, ring.radius * easeOutCubic(t));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function arrowPath(ctx: CanvasRenderingContext2D): void {
  // 和原版一樣的箭頭外形（原本是 36×36 SVG 的 18,4 28,30 18,24 8,30）
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(10, 12);
  ctx.lineTo(0, 6);
  ctx.lineTo(-10, 12);
  ctx.closePath();
}

function drawPlayer(ctx: CanvasRenderingContext2D, world: World, cache: RenderCache, dpr: number): void {
  const p = world.player;
  const unit = world.unit;
  const size = T.PLAYER_DRAW * unit;
  const speedOn = world.speedLeft > 0;
  const color = speedOn ? POWERUPS.speed.color : COLORS.player;
  const edge = speedOn ? '#fdba74' : COLORS.playerEdge;

  // 尾跡
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  const trail = p.trail;
  for (let i = 1; i < trail.length; i++) {
    const t = i / trail.length;
    ctx.globalAlpha = t * (speedOn ? 0.55 : 0.35);
    ctx.lineWidth = size * 0.55 * t;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }
  const glowR = size * 2.4;
  const glow = getSprite(cache, `player-glow:${color}`, glowR, dpr, (c, gr) => paintOrbGlow(c, gr, color));
  ctx.globalAlpha = 0.8;
  ctx.drawImage(glow, p.x - glowR, p.y - glowR, glowR * 2, glowR * 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // 加速中：殘影
  if (speedOn) {
    for (const [back, alpha] of [[4, 0.3], [8, 0.18], [12, 0.08]] as const) {
      const ghost = trail[trail.length - 1 - back];
      if (!ghost) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(ghost.x, ghost.y);
      ctx.rotate(p.angle + Math.PI / 2);
      ctx.scale(size / 14, size / 14);
      arrowPath(ctx);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }
  }

  // 電鋸
  if (world.buzzsawLeft > 0) {
    const blinkOff = world.buzzsawLeft < 1 && Math.sin(world.time * 30) < 0;
    const sawR = T.BUZZSAW_RADIUS * unit;
    ctx.save();
    ctx.globalAlpha = blinkOff ? 0.3 : 0.9;
    ctx.translate(p.x, p.y);
    ctx.rotate(world.time * 14);
    ctx.scale(sawR / 11.2, sawR / 11.2);
    ctx.translate(-12, -12);
    ctx.fillStyle = POWERUPS.buzzsaw.color;
    ctx.shadowColor = POWERUPS.buzzsaw.color;
    ctx.shadowBlur = 14 * unit * dpr;
    ctx.fill(getIconPath(cache, 'buzzsaw'), 'evenodd');
    ctx.restore();
  }

  // 箭頭本體（電鋸結束後的短暫無敵會閃）
  const graceBlink = world.graceLeft > 0 && Math.sin(world.time * 40) < 0;
  ctx.save();
  ctx.globalAlpha = graceBlink ? 0.35 : 1;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle + Math.PI / 2);
  ctx.scale(size / 14, size / 14);
  arrowPath(ctx);
  ctx.shadowColor = color;
  ctx.shadowBlur = 12 * unit * dpr;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

/** 死亡時圈出撞到你的那一顆，讓人知道是怎麼死的 */
function drawKillerMark(ctx: CanvasRenderingContext2D, world: World): void {
  const killer = world.killer;
  if (!killer) return;
  const unit = world.unit;
  const pulse = 1 + 0.25 * Math.sin(world.time * 14);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2 * unit;
  circlePath(ctx, killer.x, killer.y, T.ENEMY_RADIUS * unit * 2.4 * pulse);
  ctx.stroke();
}

function drawFloaters(ctx: CanvasRenderingContext2D, world: World): void {
  const unit = world.unit;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  setLetterSpacing(ctx, 0);
  for (const f of world.floaters) {
    ctx.globalAlpha = clamp01((f.life / f.maxLife) * 2);
    ctx.font = `800 ${Math.round(f.size * unit)}px ${FONT}`;
    ctx.lineWidth = 3 * unit;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawFlash(ctx: CanvasRenderingContext2D, world: World): void {
  if (world.phase === 'dying' || world.phase === 'over') {
    // 死亡後四周泛紅
    const g = ctx.createRadialGradient(world.w / 2, world.h / 2, Math.min(world.w, world.h) * 0.3, world.w / 2, world.h / 2, Math.hypot(world.w, world.h) / 2);
    g.addColorStop(0, 'rgba(239,68,68,0)');
    g.addColorStop(1, 'rgba(239,68,68,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, world.w, world.h);
  }
  if (world.flashLeft <= 0) return;
  ctx.globalAlpha = (world.flashLeft / world.flashMax) * 0.5;
  ctx.fillStyle = world.flashColor;
  ctx.fillRect(0, 0, world.w, world.h);
  ctx.globalAlpha = 1;
}

// ─── HUD ──────────────────────────────────────────────────────────────
// 右上角留給平台的設定按鈕列（GameSettings），HUD 不放那裡。

interface ActiveEffect {
  type: PowerupType;
  left: number;
  total: number;
}

function activeEffects(world: World): ActiveEffect[] {
  const list: ActiveEffect[] = [];
  if (world.freezeLeft > 0) list.push({ type: 'freeze', left: world.freezeLeft, total: T.FREEZE_DURATION });
  if (world.vortex) list.push({ type: 'vortex', left: world.vortex.left, total: T.VORTEX_DURATION });
  if (world.speedLeft > 0) list.push({ type: 'speed', left: world.speedLeft, total: T.SPEED_DURATION });
  if (world.buzzsawLeft > 0) list.push({ type: 'buzzsaw', left: world.buzzsawLeft, total: T.BUZZSAW_DURATION });
  return list;
}

function drawHud(ctx: CanvasRenderingContext2D, world: World, cache: RenderCache, dpr: number): void {
  const hs = Math.max(0.75, Math.min(1.7, Math.min(world.w, world.h) / 700));
  const cx = world.w / 2;
  ctx.textBaseline = 'top';

  // 分數（上方正中）
  ctx.textAlign = 'center';
  setLetterSpacing(ctx, 5 * hs);
  ctx.font = `900 ${Math.round(30 * hs)}px ${FONT}`;
  ctx.shadowColor = 'rgba(103,232,249,0.6)';
  ctx.shadowBlur = 16 * hs * dpr;
  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  ctx.fillText(padScore(world.score), cx, 16 * hs);
  ctx.shadowBlur = 0;

  // 最佳紀錄 / 破紀錄
  let y = 16 * hs + 36 * hs;
  setLetterSpacing(ctx, 2 * hs);
  ctx.font = `700 ${Math.round(11 * hs)}px ${FONT}`;
  if (world.best > 0 && world.score > world.best) {
    ctx.fillStyle = '#fde047';
    ctx.fillText('NEW BEST!', cx, y);
  } else if (world.best > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(`BEST ${padScore(world.best)}`, cx, y);
  }
  y += 18 * hs;

  // 連擊
  if (world.combo >= 2) {
    const multiplier = multiplierFor(world.combo);
    const color = multiplierColor(multiplier);
    const label = multiplier > 1 ? `${world.combo} COMBO  ×${multiplier}` : `${world.combo} COMBO`;
    setLetterSpacing(ctx, 2 * hs);
    ctx.font = `800 ${Math.round(16 * hs)}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.fillText(label, cx, y);
    const barW = 120 * hs;
    const barY = y + 21 * hs;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(cx - barW / 2, barY, barW, 3 * hs);
    ctx.fillStyle = color;
    ctx.fillRect(cx - barW / 2, barY, barW * clamp01(world.comboLeft / T.COMBO_WINDOW), 3 * hs);
  }

  // WAVE + 存活時間（左上）
  const left = 18 * hs;
  const top = 16 * hs;
  ctx.textAlign = 'left';
  setLetterSpacing(ctx, 2 * hs);
  ctx.font = `800 ${Math.round(12 * hs)}px ${FONT}`;
  const waveText = `WAVE ${world.wave}`;
  const pillW = ctx.measureText(waveText).width + 24 * hs;
  const pillH = 24 * hs;
  roundRectPath(ctx, left, top, pillW, pillH, pillH / 2);
  ctx.fillStyle = 'rgba(8,51,68,0.6)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(34,211,238,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#67e8f9';
  ctx.textBaseline = 'middle';
  ctx.fillText(waveText, left + 12 * hs, top + pillH / 2 + 1);
  ctx.textBaseline = 'top';
  ctx.font = `600 ${Math.round(12 * hs)}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(formatTime(world.clock), left + 4 * hs, top + pillH + 8 * hs);

  // 生效中的道具（下方正中）：圖示 + 名稱 + 倒數條
  const effects = activeEffects(world);
  if (effects.length > 0) {
    const chipW = 138 * hs;
    const chipH = 34 * hs;
    const gap = 10 * hs;
    const totalW = effects.length * chipW + (effects.length - 1) * gap;
    const chipY = world.h - chipH - 18 * hs;
    let chipX = cx - totalW / 2;
    for (const effect of effects) {
      const info = POWERUPS[effect.type];
      const blinkOff = effect.type === 'buzzsaw' && effect.left < 1 && Math.sin(world.time * 30) < 0;
      ctx.globalAlpha = blinkOff ? 0.4 : 1;
      roundRectPath(ctx, chipX, chipY, chipW, chipH, 8 * hs);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      ctx.strokeStyle = `${info.color}aa`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const iconR = 11 * hs;
      const iconX = chipX + 8 * hs + iconR;
      const iconY = chipY + chipH / 2;
      ctx.fillStyle = info.color;
      circlePath(ctx, iconX, iconY, iconR);
      ctx.fill();
      drawIcon(ctx, cache, effect.type, iconX, iconY, iconR * 1.3, '#ffffff');

      const textX = iconX + iconR + 8 * hs;
      const barW = chipX + chipW - 10 * hs - textX;
      setLetterSpacing(ctx, 1 * hs);
      ctx.font = `800 ${Math.round(11 * hs)}px ${FONT}`;
      ctx.fillStyle = info.color;
      ctx.fillText(info.name, textX, chipY + 7 * hs);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(textX, chipY + chipH - 10 * hs, barW, 3 * hs);
      ctx.fillStyle = info.color;
      ctx.fillRect(textX, chipY + chipH - 10 * hs, barW * clamp01(effect.left / effect.total), 3 * hs);
      ctx.globalAlpha = 1;
      chipX += chipW + gap;
    }
  }
  setLetterSpacing(ctx, 0);
}

/** WAVE 橫幅：畫在偏上方，不擋中央（玩家常在中央，平台的提示字也在中央） */
function drawBanner(ctx: CanvasRenderingContext2D, world: World, dpr: number): void {
  if (world.bannerLeft <= 0 || world.phase !== 'playing') return;
  const hs = Math.max(0.75, Math.min(1.7, Math.min(world.w, world.h) / 700));
  const elapsed = world.bannerMax - world.bannerLeft;
  const fadeIn = clamp01(elapsed / 0.2);
  const alpha = Math.min(fadeIn, clamp01(world.bannerLeft / 0.4));
  const scale = 0.9 + 0.1 * easeOutCubic(fadeIn);
  const y = world.h * 0.3;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(world.w / 2, y);
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  setLetterSpacing(ctx, 8 * hs);
  ctx.font = `900 ${Math.round(44 * hs)}px ${FONT}`;
  ctx.shadowColor = 'rgba(34,211,238,0.8)';
  ctx.shadowBlur = 24 * hs * dpr;
  ctx.fillStyle = '#e0f2fe';
  ctx.fillText(world.bannerText, 0, 0);
  ctx.shadowBlur = 0;
  if (world.bannerSub) {
    setLetterSpacing(ctx, 4 * hs);
    ctx.font = `700 ${Math.round(13 * hs)}px ${FONT}`;
    ctx.fillStyle = 'rgba(103,232,249,0.9)';
    ctx.fillText(world.bannerSub, 0, 38 * hs);
  }
  ctx.restore();
  setLetterSpacing(ctx, 0);
}
