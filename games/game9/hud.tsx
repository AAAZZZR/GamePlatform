// games/game9/hud.tsx — Sky Fighter 的 HUD
// DOM 結構由 React 畫一次；之後每幀由 HudController 直接改 style / 文字，不觸發 React 重繪。
'use client';

import React from 'react';
import * as THREE from 'three';
import { COLORS, ENEMY, FLIGHT, GUN, PLAYER, SCORING, VIEW, WORLD } from './config';
import { GameEvent, GameState, clamp } from './sim';

const SLOT_COUNT = ENEMY.MAX_SLOTS;
const POPUP_COUNT = 3;
const RADAR_RADIUS = 70;
const EDGE_MARGIN = 48;

const TEXT_SHADOW = '0 1px 3px rgba(0,20,40,0.75), 0 0 10px rgba(0,30,60,0.35)';

// ==========================================
// 靜態結構
// ==========================================
function Bracket() {
  const corner = (style: React.CSSProperties) => (
    <div style={{ position: 'absolute', width: '30%', height: '30%', borderColor: 'currentColor', ...style }} />
  );
  return (
    <div data-hud="bracket" style={{ position: 'absolute', left: 0, top: 0, display: 'none', color: COLORS.enemyHud }}>
      <div data-part="box" style={{ position: 'absolute', inset: 0 }}>
        {corner({ left: 0, top: 0, borderLeft: '2px solid', borderTop: '2px solid' })}
        {corner({ right: 0, top: 0, borderRight: '2px solid', borderTop: '2px solid' })}
        {corner({ left: 0, bottom: 0, borderLeft: '2px solid', borderBottom: '2px solid' })}
        {corner({ right: 0, bottom: 0, borderRight: '2px solid', borderBottom: '2px solid' })}
      </div>
      {/* 鎖定中：外圈往內收 */}
      <div
        data-part="ring"
        style={{
          position: 'absolute', inset: -6, border: '2px solid currentColor', transform: 'rotate(45deg)',
          opacity: 0,
        }}
      />
      <div
        data-part="label"
        style={{
          position: 'absolute', top: '100%', left: '50%', transform: 'translate(-50%, 6px)',
          fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', textShadow: TEXT_SHADOW, letterSpacing: 1,
        }}
      />
      <div
        style={{
          position: 'absolute', bottom: '100%', left: '10%', width: '80%', height: 4, marginBottom: 5,
          background: 'rgba(0,0,0,0.45)', borderRadius: 2, overflow: 'hidden',
        }}
      >
        <div data-part="hp" style={{ height: '100%', width: '100%', background: 'currentColor' }} />
      </div>
    </div>
  );
}

function EdgeArrow() {
  return (
    <div
      data-hud="arrow"
      style={{
        position: 'absolute', left: 0, top: 0, display: 'none', color: COLORS.enemyHud,
        width: 0, height: 0,
      }}
    >
      <svg data-part="icon" width="34" height="34" viewBox="0 0 34 34" style={{ position: 'absolute', left: -17, top: -17 }}>
        <path d="M30 17 L8 5 L13 17 L8 29 Z" fill="currentColor" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" />
      </svg>
      <div
        data-part="label"
        style={{
          position: 'absolute', left: 0, top: 20, transform: 'translateX(-50%)',
          fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', textShadow: TEXT_SHADOW,
        }}
      />
    </div>
  );
}

function RadarBlip() {
  return (
    <div
      data-hud="blip"
      style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, display: 'none' }}
    >
      <div
        data-part="dot"
        style={{
          position: 'absolute', left: -4, top: -4, width: 8, height: 8, borderRadius: '50%',
          background: COLORS.enemyHud, boxShadow: `0 0 6px ${COLORS.enemyHud}`,
        }}
      />
      <div
        data-part="alt"
        style={{
          position: 'absolute', left: 6, top: -8, fontSize: 9, color: '#ffd2c8', lineHeight: 1,
        }}
      />
    </div>
  );
}

export function Hud({ rootRef, visible }: { rootRef: React.RefObject<HTMLDivElement | null>; visible: boolean }) {
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => i);
  const popups = Array.from({ length: POPUP_COUNT }, (_, i) => i);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-10 pointer-events-none select-none font-mono overflow-hidden"
      style={{ display: visible ? 'block' : 'none', color: COLORS.hud }}
    >
      <style>{`
        @keyframes skyLowHull { 0% { opacity: 0.25; } 100% { opacity: 0.75; } }
        @keyframes skyBlink { 0% { opacity: 1; } 100% { opacity: 0.25; } }
      `}</style>

      {/* 受傷紅框 / 低血量脈動 */}
      <div
        data-hud="damage"
        style={{ position: 'absolute', inset: 0, opacity: 0, boxShadow: 'inset 0 0 120px 30px rgba(255,30,10,0.85)' }}
      />
      <div
        data-hud="lowhp"
        style={{
          position: 'absolute', inset: 0, display: 'none',
          boxShadow: 'inset 0 0 90px 10px rgba(255,20,0,0.6)',
          animation: 'skyLowHull 0.7s ease-in-out infinite alternate',
        }}
      />

      {/* 敵機框與畫面外箭頭 */}
      {slots.map(i => <Bracket key={`b${i}`} />)}
      {slots.map(i => <EdgeArrow key={`a${i}`} />)}

      {/* 準星：投影在彈道交會點，不是畫面正中央 */}
      <div data-hud="crosshair" style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }}>
        <svg width="64" height="64" viewBox="0 0 64 64" style={{ position: 'absolute', left: -32, top: -32 }}>
          <circle cx="32" cy="32" r="14" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.9" />
          <circle cx="32" cy="32" r="2.2" fill="currentColor" />
          <line x1="32" y1="6" x2="32" y2="14" stroke="currentColor" strokeWidth="2" />
          <line x1="32" y1="50" x2="32" y2="58" stroke="currentColor" strokeWidth="2" />
          <line x1="6" y1="32" x2="14" y2="32" stroke="currentColor" strokeWidth="2" />
          <line x1="50" y1="32" x2="58" y2="32" stroke="currentColor" strokeWidth="2" />
        </svg>
        <svg
          data-hud="hitmarker"
          width="64" height="64" viewBox="0 0 64 64"
          style={{ position: 'absolute', left: -32, top: -32, opacity: 0, color: '#ffffff' }}
        >
          <path d="M18 18 L25 25 M46 18 L39 25 M18 46 L25 39 M46 46 L39 39" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>

      {/* 提前量圈：鎖定後往這裡瞄 */}
      <div
        data-hud="lead"
        style={{
          position: 'absolute', left: 0, top: 0, width: 18, height: 18, marginLeft: -9, marginTop: -9,
          borderRadius: '50%', border: `2px solid ${COLORS.enemyHud}`, display: 'none',
          boxShadow: '0 0 6px rgba(255,60,30,0.8)',
        }}
      />

      {/* 受擊方向 */}
      <div
        data-hud="dmgdir"
        style={{
          position: 'absolute', left: '50%', top: '50%', width: 280, height: 280, marginLeft: -140, marginTop: -140,
          borderRadius: '50%', borderTop: '6px solid rgba(255,40,20,0.9)', opacity: 0,
          filter: 'drop-shadow(0 0 6px rgba(255,40,20,0.8))',
        }}
      />

      {/* 左上：機體耐久 */}
      <div style={{ position: 'absolute', left: 20, top: 18, width: 230, textShadow: TEXT_SHADOW }}>
        <div className="flex items-baseline justify-between" style={{ fontSize: 13, letterSpacing: 2 }}>
          <span>HULL</span>
          <span data-hud="hulltext" style={{ fontSize: 18, fontWeight: 800 }} />
        </div>
        <div style={{ height: 12, marginTop: 4, background: 'rgba(0,20,40,0.45)', border: '1px solid rgba(127,243,255,0.35)', borderRadius: 3, overflow: 'hidden' }}>
          <div data-hud="hullfill" style={{ height: '100%', width: '100%', background: '#3dff9a', transition: 'width 0.15s' }} />
        </div>
        <div data-hud="warnhull" style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: '#ff4a2a', letterSpacing: 2, display: 'none', animation: 'skyBlink 0.5s steps(2) infinite' }}>
          HULL CRITICAL
        </div>
      </div>

      {/* 上方中央：分數、波次、連殺 */}
      <div style={{ position: 'absolute', left: '50%', top: 14, transform: 'translateX(-50%)', textAlign: 'center', textShadow: TEXT_SHADOW }}>
        <div data-hud="score" style={{ fontSize: 32, fontWeight: 900, letterSpacing: 6, color: '#ffffff' }} />
        <div data-hud="wave" style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, marginTop: 2 }} />
        <div data-hud="streak" style={{ fontSize: 15, fontWeight: 900, letterSpacing: 2, marginTop: 4, color: COLORS.warn, display: 'none' }} />
      </div>

      {/* 左下：速度、高度、彈藥 */}
      <div style={{ position: 'absolute', left: 20, bottom: 18, width: 230, textShadow: TEXT_SHADOW }}>
        <div data-hud="speedstate" style={{ fontSize: 12, fontWeight: 900, letterSpacing: 2, height: 16 }} />
        <div className="flex items-baseline gap-2">
          <span data-hud="speed" style={{ fontSize: 34, fontWeight: 900, color: '#ffffff' }} />
          <span style={{ fontSize: 12, opacity: 0.8 }}>KM/H</span>
          <span data-hud="alt" style={{ fontSize: 14, fontWeight: 700, marginLeft: 'auto' }} />
        </div>
        <div className="flex items-baseline justify-between" style={{ fontSize: 12, letterSpacing: 2, marginTop: 6 }}>
          <span>GUN</span>
          <span data-hud="ammotext" style={{ fontWeight: 800 }} />
        </div>
        <div style={{ height: 8, marginTop: 3, background: 'rgba(0,20,40,0.45)', border: '1px solid rgba(127,243,255,0.35)', borderRadius: 3, overflow: 'hidden' }}>
          <div data-hud="ammofill" style={{ height: '100%', width: '100%', background: COLORS.hud }} />
        </div>
      </div>

      {/* 右下：雷達（右上被平台的設定按鈕佔用） */}
      <div
        style={{
          position: 'absolute', right: 20, bottom: 18, width: RADAR_RADIUS * 2 + 16, height: RADAR_RADIUS * 2 + 16,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,30,50,0.55) 0%, rgba(0,20,40,0.7) 100%)',
          border: '2px solid rgba(127,243,255,0.45)', boxShadow: '0 0 12px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ position: 'absolute', inset: '25%', borderRadius: '50%', border: '1px solid rgba(127,243,255,0.2)' }} />
        <div style={{ position: 'absolute', left: '50%', top: 8, bottom: 8, width: 1, background: 'rgba(127,243,255,0.15)' }} />
        <div style={{ position: 'absolute', top: '50%', left: 8, right: 8, height: 1, background: 'rgba(127,243,255,0.15)' }} />
        {/* 玩家（朝上） */}
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -7, marginTop: -7 }}>
          <path d="M7 1 L12 12 L7 9 L2 12 Z" fill={COLORS.hud} />
        </svg>
        <div
          data-hud="radarhome"
          style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, display: 'none' }}
        >
          <div style={{ position: 'absolute', left: -6, top: -6, width: 12, height: 12, border: `2px solid ${COLORS.warn}`, transform: 'rotate(45deg)' }} />
        </div>
        {slots.map(i => <RadarBlip key={`r${i}`} />)}
      </div>

      {/* 警告：畫面下方中央（避開邊緣的敵機箭頭） */}
      <div style={{ position: 'absolute', left: '50%', bottom: 96, transform: 'translateX(-50%)', textAlign: 'center', textShadow: TEXT_SHADOW, whiteSpace: 'nowrap' }}>
        <div data-hud="warnaim" style={{ display: 'none', fontSize: 18, fontWeight: 900, letterSpacing: 3, color: COLORS.warn, animation: 'skyBlink 0.35s steps(2) infinite' }}>
          ⚠ ENEMY LOCK — BREAK!
        </div>
        <div data-hud="warnarea" style={{ display: 'none', fontSize: 16, fontWeight: 900, letterSpacing: 3, color: COLORS.warn, marginTop: 4 }}>
          RETURN TO COMBAT AREA
        </div>
      </div>

      {/* 波次橫幅 */}
      <div
        data-hud="banner"
        style={{
          position: 'absolute', left: 0, right: 0, top: '19%', textAlign: 'center', opacity: 0, textShadow: TEXT_SHADOW,
        }}
      >
        <div data-hud="bannertitle" style={{ fontSize: 38, fontWeight: 900, letterSpacing: 9, color: '#ffffff' }} />
        <div data-hud="bannersub" style={{ fontSize: 15, fontWeight: 700, letterSpacing: 4, marginTop: 2 }} />
      </div>

      {/* 擊落得分飄字 */}
      {popups.map(i => (
        <div
          key={`p${i}`}
          data-hud="popup"
          style={{ position: 'absolute', left: 0, top: 0, opacity: 0, textAlign: 'center', textShadow: TEXT_SHADOW, whiteSpace: 'nowrap' }}
        >
          <div data-part="text" style={{ fontSize: 24, fontWeight: 900, color: '#ffffff' }} />
          <div data-part="sub" style={{ fontSize: 13, fontWeight: 900, color: COLORS.warn, letterSpacing: 2 }} />
        </div>
      ))}
    </div>
  );
}

// ==========================================
// 每幀更新
// ==========================================
interface BracketEls {
  root: HTMLElement;
  box: HTMLElement;
  ring: HTMLElement;
  label: HTMLElement;
  hp: HTMLElement;
}

interface ArrowEls {
  root: HTMLElement;
  icon: HTMLElement;
  label: HTMLElement;
}

interface BlipEls {
  root: HTMLElement;
  dot: HTMLElement;
  alt: HTMLElement;
}

interface PopupEls {
  root: HTMLElement;
  text: HTMLElement;
  sub: HTMLElement;
}

interface HudEls {
  root: HTMLElement;
  damage: HTMLElement;
  lowHp: HTMLElement;
  crosshair: HTMLElement;
  hitMarker: HTMLElement;
  lead: HTMLElement;
  dmgDir: HTMLElement;
  hullText: HTMLElement;
  hullFill: HTMLElement;
  warnHull: HTMLElement;
  score: HTMLElement;
  wave: HTMLElement;
  streak: HTMLElement;
  speed: HTMLElement;
  speedState: HTMLElement;
  alt: HTMLElement;
  ammoText: HTMLElement;
  ammoFill: HTMLElement;
  radarHome: HTMLElement;
  warnAim: HTMLElement;
  warnArea: HTMLElement;
  banner: HTMLElement;
  bannerTitle: HTMLElement;
  bannerSub: HTMLElement;
  brackets: BracketEls[];
  arrows: ArrowEls[];
  blips: BlipEls[];
  popups: PopupEls[];
}

function one(root: ParentNode, selector: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`[SkyFighter] HUD 找不到元素 ${selector}`);
  return el;
}

function all(root: ParentNode, name: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`[data-hud="${name}"]`));
}

function collectHud(root: HTMLElement): HudEls {
  const hud = (name: string) => one(root, `[data-hud="${name}"]`);
  const part = (el: HTMLElement, name: string) => one(el, `[data-part="${name}"]`);
  return {
    root,
    damage: hud('damage'),
    lowHp: hud('lowhp'),
    crosshair: hud('crosshair'),
    hitMarker: hud('hitmarker'),
    lead: hud('lead'),
    dmgDir: hud('dmgdir'),
    hullText: hud('hulltext'),
    hullFill: hud('hullfill'),
    warnHull: hud('warnhull'),
    score: hud('score'),
    wave: hud('wave'),
    streak: hud('streak'),
    speed: hud('speed'),
    speedState: hud('speedstate'),
    alt: hud('alt'),
    ammoText: hud('ammotext'),
    ammoFill: hud('ammofill'),
    radarHome: hud('radarhome'),
    warnAim: hud('warnaim'),
    warnArea: hud('warnarea'),
    banner: hud('banner'),
    bannerTitle: hud('bannertitle'),
    bannerSub: hud('bannersub'),
    brackets: all(root, 'bracket').map(el => ({
      root: el, box: part(el, 'box'), ring: part(el, 'ring'), label: part(el, 'label'), hp: part(el, 'hp'),
    })),
    arrows: all(root, 'arrow').map(el => ({ root: el, icon: part(el, 'icon'), label: part(el, 'label') })),
    blips: all(root, 'blip').map(el => ({ root: el, dot: part(el, 'dot'), alt: part(el, 'alt') })),
    popups: all(root, 'popup').map(el => ({ root: el, text: part(el, 'text'), sub: part(el, 'sub') })),
  };
}

export interface ViewSize {
  width: number;
  height: number;
}

const _proj = new THREE.Vector3();
const _camSpace = new THREE.Vector3();
const _aim = new THREE.Vector3();

interface ScreenPoint {
  x: number;
  y: number;
  behind: boolean;
}

function project(pos: THREE.Vector3, camera: THREE.Camera, size: ViewSize, out: ScreenPoint): ScreenPoint {
  _proj.copy(pos).project(camera);
  out.behind = _proj.z > 1;
  out.x = (_proj.x * 0.5 + 0.5) * size.width;
  out.y = (-_proj.y * 0.5 + 0.5) * size.height;
  return out;
}

export class HudController {
  private els: HudEls | null = null;
  private texts = new Map<HTMLElement, string>();
  private displays = new Map<HTMLElement, string>();
  private popupCursor = 0;
  private point: ScreenPoint = { x: 0, y: 0, behind: false };

  attach(root: HTMLElement | null): boolean {
    if (this.els && this.els.root === root) return true;
    if (!root) return false;
    this.els = collectHud(root);
    this.texts.clear();
    this.displays.clear();
    return true;
  }

  /** 只在值變了才寫 DOM */
  private setText(el: HTMLElement, value: string): void {
    if (this.texts.get(el) === value) return;
    this.texts.set(el, value);
    el.textContent = value;
  }

  private show(el: HTMLElement, visible: boolean, display = 'block'): void {
    const value = visible ? display : 'none';
    if (this.displays.get(el) === value) return;
    this.displays.set(el, value);
    el.style.display = value;
  }

  update(game: GameState, camera: THREE.Camera, size: ViewSize): void {
    const els = this.els;
    if (!els) return;
    const p = game.player;
    const alive = game.phase === 'PLAYING';
    const blink = Math.floor(game.time * 6) % 2 === 0;

    // ─── 準星 ───
    _aim.copy(p.pos).addScaledVector(p.forward, GUN.CONVERGE_DIST);
    const aim = project(_aim, camera, size, this.point);
    this.show(els.crosshair, alive && !aim.behind);
    els.crosshair.style.transform = `translate(${aim.x}px, ${aim.y}px)`;
    els.crosshair.style.color = game.lock.locked ? COLORS.enemyHud : COLORS.hud;

    // ─── 提前量圈 ───
    const showLead = alive && game.lock.locked;
    if (showLead) {
      const lead = project(game.lock.lead, camera, size, this.point);
      this.show(els.lead, !lead.behind);
      els.lead.style.transform = `translate(${lead.x}px, ${lead.y}px)`;
    } else {
      this.show(els.lead, false);
    }

    this.updateTargets(game, camera, size, blink);
    this.updateRadar(game);

    // ─── 耐久 ───
    const hpRatio = p.hp / PLAYER.MAX_HP;
    this.setText(els.hullText, `${Math.ceil(p.hp)}`);
    els.hullFill.style.width = `${hpRatio * 100}%`;
    els.hullFill.style.background = hpRatio > 0.6 ? '#3dff9a' : hpRatio > PLAYER.LOW_HP_RATIO ? '#ffcc33' : '#ff3a1a';
    const critical = alive && hpRatio < PLAYER.LOW_HP_RATIO;
    this.show(els.warnHull, critical);
    this.show(els.lowHp, critical);

    // ─── 分數 / 波次 / 連殺 ───
    this.setText(els.score, game.score.toString().padStart(7, '0'));
    const left = game.enemies.length + game.waveQueue.length;
    let waveText = 'GET READY';
    if (game.wave > 0) {
      waveText = game.waveActive ? `WAVE ${game.wave} · ${left} LEFT` : `WAVE ${game.wave} CLEAR`;
    }
    this.setText(els.wave, waveText);
    const multiplier = Math.min(game.streak, SCORING.MAX_MULTIPLIER);
    this.show(els.streak, game.streak >= 2);
    this.setText(els.streak, `${game.streak} KILL STREAK  ×${multiplier}`);
    els.streak.style.opacity = `${0.4 + 0.6 * clamp(game.streakTimer / SCORING.STREAK_WINDOW, 0, 1)}`;

    // ─── 速度 / 高度 / 彈藥 ───
    this.setText(els.speed, `${Math.round(p.speed * 8.3)}`);
    if (p.throttle) {
      this.setText(els.speedState, '▲ AFTERBURNER');
      els.speedState.style.color = '#ff9a3c';
    } else if (p.brake) {
      this.setText(els.speedState, '▼ AIRBRAKE');
      els.speedState.style.color = '#7ff3ff';
    } else {
      this.setText(els.speedState, '');
    }
    this.setText(els.alt, `ALT ${Math.round(p.pos.y)}`);
    const ammoRatio = p.ammo / GUN.MAX_AMMO;
    this.setText(els.ammoText, p.ammo < 1 ? 'RELOADING' : `${Math.floor(p.ammo)}`);
    els.ammoText.style.color = p.ammo < 1 ? '#ff3a1a' : COLORS.hud;
    els.ammoFill.style.width = `${ammoRatio * 100}%`;
    els.ammoFill.style.background = ammoRatio > 0.25 ? COLORS.hud : '#ff7a2a';

    // ─── 警告 ───
    this.show(els.warnArea, alive && Math.hypot(p.pos.x, p.pos.z) > WORLD.ARENA_RADIUS);
    this.show(els.warnAim, alive && game.aimWarning);
  }

  private updateTargets(game: GameState, camera: THREE.Camera, size: ViewSize, blink: boolean): void {
    const els = this.els;
    if (!els) return;
    const p = game.player;
    const alive = game.phase === 'PLAYING';
    let bi = 0;
    let ai = 0;

    if (alive) {
      for (const e of game.enemies) {
        const dist = e.pos.distanceTo(p.pos);
        const pt = project(e.pos, camera, size, this.point);
        const onScreen = !pt.behind
          && pt.x > EDGE_MARGIN && pt.x < size.width - EDGE_MARGIN
          && pt.y > EDGE_MARGIN && pt.y < size.height - EDGE_MARGIN;
        const isTarget = game.lock.targetId === e.id;
        const locked = isTarget && game.lock.locked;
        let color = COLORS.enemyHud;
        if (locked) color = '#ff1f1f';
        else if (e.aiming && blink) color = COLORS.warn;

        if (onScreen && bi < els.brackets.length) {
          const b = els.brackets[bi++];
          const boxSize = clamp((2400 / Math.max(dist, 1)) * (size.height / 900), 26, 96) * (locked ? 1.15 : 1);
          this.show(b.root, true);
          b.root.style.transform = `translate(${pt.x - boxSize / 2}px, ${pt.y - boxSize / 2}px)`;
          b.root.style.width = `${boxSize}px`;
          b.root.style.height = `${boxSize}px`;
          b.root.style.color = color;
          b.box.style.opacity = isTarget ? '1' : '0.75';
          // 鎖定進度：菱形外框從大縮到貼合
          const progress = isTarget ? game.lock.progress : 0;
          b.ring.style.opacity = isTarget ? `${0.35 + progress * 0.65}` : '0';
          b.ring.style.transform = `rotate(45deg) scale(${locked ? 0.9 : 1.9 - progress})`;
          this.setText(b.label, locked ? `LOCK ${Math.round(dist)}` : `${Math.round(dist)}`);
          b.hp.style.width = `${clamp(e.hp / e.maxHp, 0, 1) * 100}%`;
        } else if (!onScreen && ai < els.arrows.length) {
          const a = els.arrows[ai++];
          _camSpace.copy(e.pos).applyMatrix4(camera.matrixWorldInverse);
          let angle = Math.atan2(_camSpace.y, _camSpace.x);
          if (Math.abs(_camSpace.x) < 1e-3 && Math.abs(_camSpace.y) < 1e-3) angle = -Math.PI / 2;
          const dx = Math.cos(angle);
          const dy = -Math.sin(angle);
          const halfW = size.width / 2 - EDGE_MARGIN;
          const halfH = size.height / 2 - EDGE_MARGIN;
          const t = Math.min(halfW / Math.max(Math.abs(dx), 1e-3), halfH / Math.max(Math.abs(dy), 1e-3));
          const x = size.width / 2 + dx * t;
          const y = size.height / 2 + dy * t;
          this.show(a.root, true);
          a.root.style.transform = `translate(${x}px, ${y}px)`;
          a.root.style.color = color;
          a.icon.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
          this.setText(a.label, `${Math.round(dist)}`);
        }
      }
    }
    for (let i = bi; i < els.brackets.length; i++) this.show(els.brackets[i].root, false);
    for (let i = ai; i < els.arrows.length; i++) this.show(els.arrows[i].root, false);
  }

  private updateRadar(game: GameState): void {
    const els = this.els;
    if (!els) return;
    const p = game.player;
    const cos = Math.cos(p.yaw);
    const sin = Math.sin(p.yaw);
    const scale = RADAR_RADIUS / VIEW.RADAR_RANGE;

    // 世界座標 → 機頭朝上的雷達座標
    const toRadar = (dx: number, dz: number) => {
      const right = dx * cos - dz * sin;
      const ahead = -dx * sin - dz * cos;
      let x = right * scale;
      let y = -ahead * scale;
      const r = Math.hypot(x, y);
      const max = RADAR_RADIUS - 4;
      const inRange = r <= max;
      if (!inRange) {
        x *= max / r;
        y *= max / r;
      }
      return { x, y, inRange };
    };

    let i = 0;
    for (const e of game.enemies) {
      if (i >= els.blips.length) break;
      const blip = els.blips[i++];
      const r = toRadar(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      this.show(blip.root, true);
      blip.root.style.transform = `translate(${r.x}px, ${r.y}px)`;
      const isTarget = game.lock.targetId === e.id;
      blip.dot.style.opacity = r.inRange ? '1' : '0.55';
      blip.dot.style.transform = isTarget ? 'scale(1.5)' : 'scale(1)';
      blip.dot.style.background = isTarget ? '#ffffff' : COLORS.enemyHud;
      const dy = e.pos.y - p.pos.y;
      this.setText(blip.alt, dy > 40 ? '▲' : dy < -40 ? '▼' : '');
    }
    for (let j = i; j < els.blips.length; j++) this.show(els.blips[j].root, false);

    // 出界時標出場地中心方向
    const away = Math.hypot(p.pos.x, p.pos.z) > WORLD.ARENA_RADIUS * 0.85;
    this.show(els.radarHome, away);
    if (away) {
      const r = toRadar(-p.pos.x, -p.pos.z);
      els.radarHome.style.transform = `translate(${r.x}px, ${r.y}px)`;
    }
  }

  // ─── 事件特效（WAAPI，一次性動畫） ───
  handleEvent(event: GameEvent, camera: THREE.Camera, size: ViewSize): void {
    const els = this.els;
    if (!els) return;
    switch (event.type) {
      case 'enemyHit':
        els.hitMarker.animate(
          [{ opacity: 1, transform: 'scale(1.25)' }, { opacity: 0, transform: 'scale(1)' }],
          { duration: 180, easing: 'ease-out' },
        );
        break;
      case 'enemyKilled': {
        els.hitMarker.animate(
          [{ opacity: 1, transform: 'scale(1.6)', color: '#ff3a1a' }, { opacity: 0, transform: 'scale(1)', color: '#ff3a1a' }],
          { duration: 420, easing: 'ease-out' },
        );
        this.showPopup(event.pos, `+${event.points}`, event.multiplier > 1 ? `×${event.multiplier} STREAK BONUS` : 'SPLASH ONE', camera, size);
        break;
      }
      case 'playerHit': {
        els.damage.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
        _camSpace.copy(event.from).applyMatrix4(camera.matrixWorldInverse);
        const angle = Math.atan2(_camSpace.y, _camSpace.x);
        const rotation = Math.PI / 2 - angle;
        els.dmgDir.style.transform = `rotate(${rotation}rad)`;
        els.dmgDir.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, easing: 'ease-in' });
        break;
      }
      case 'waveStart':
        this.showBanner(`WAVE ${event.wave}`, `${event.count} BANDIT${event.count > 1 ? 'S' : ''} INBOUND`, 0);
        break;
      case 'waveClear':
        // 晚一點出現，先讓最後一架的擊落飄字跑完
        this.showBanner(
          `WAVE ${event.wave} CLEAR`,
          event.repaired > 0 ? `BONUS +${event.bonus}  ·  HULL +${event.repaired}` : `BONUS +${event.bonus}`,
          700,
        );
        break;
      default:
        break;
    }
  }

  private showBanner(title: string, sub: string, delay: number): void {
    const els = this.els;
    if (!els) return;
    els.bannerTitle.textContent = title;
    els.bannerSub.textContent = sub;
    els.banner.getAnimations().forEach(a => a.cancel());
    els.banner.animate(
      [
        { opacity: 0, transform: 'scale(1.15)' },
        { opacity: 1, transform: 'scale(1)', offset: 0.1 },
        { opacity: 1, transform: 'scale(1)', offset: 0.8 },
        { opacity: 0, transform: 'scale(0.98)' },
      ],
      { duration: 2400, delay, easing: 'ease-out' },
    );
  }

  private showPopup(pos: THREE.Vector3, text: string, sub: string, camera: THREE.Camera, size: ViewSize): void {
    const els = this.els;
    if (!els || els.popups.length === 0) return;
    const popup = els.popups[this.popupCursor];
    this.popupCursor = (this.popupCursor + 1) % els.popups.length;
    const pt = project(pos, camera, size, this.point);
    const x = pt.behind ? size.width / 2 : clamp(pt.x, 80, size.width - 80);
    const y = pt.behind ? size.height * 0.4 : clamp(pt.y, 80, size.height - 120);
    popup.text.textContent = text;
    popup.sub.textContent = sub;
    popup.root.style.left = `${x}px`;
    popup.root.style.top = `${y}px`;
    popup.root.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -50%) scale(0.6)' },
        { opacity: 1, transform: 'translate(-50%, -80%) scale(1.1)', offset: 0.15 },
        { opacity: 1, transform: 'translate(-50%, -120%) scale(1)', offset: 0.7 },
        { opacity: 0, transform: 'translate(-50%, -160%) scale(1)' },
      ],
      { duration: 1300, easing: 'ease-out' },
    );
  }
}

/** 速度比例：0 = 煞車速度，1 = 後燃器速度（風聲、FOV 共用） */
export function speedRatio(speed: number): number {
  return (speed - FLIGHT.BRAKE_SPEED) / (FLIGHT.BOOST_SPEED - FLIGHT.BRAKE_SPEED);
}
