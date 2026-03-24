// games/game7/index.tsx — Doodle Jump
'use client';

import React, { useEffect, useState, useRef, useCallback, MutableRefObject } from 'react';
import { NormalizedInput, GameCallbacks, GameStatus } from '@/platform/types';
import { sfx } from '@/platform/audio';

// ==========================================
// 1. Configuration
// ==========================================
// World coordinate system: Y increases UPWARD (higher = bigger Y).
// vy > 0 = moving up, vy < 0 = moving down.
const CFG = {
  CHAR_W: 30,
  CHAR_H: 30,
  PLAT_W: 65,
  PLAT_H: 12,
  GRAVITY: 0.25,       // subtracted from vy each frame (lower = floatier)
  JUMP_VY: 9,          // upward velocity on normal bounce
  SPRING_VY: 15,       // upward velocity on spring bounce
  MOVE_SPEED: 0.5,
  BULLET_SIZE: 5,
  BULLET_SPEED: 10,
  MONSTER_W: 28,
  MONSTER_H: 28,
  // Platform generation
  INITIAL_GAP_MIN: 50,
  INITIAL_GAP_MAX: 80,
  MAX_GAP_MIN: 120,
  MAX_GAP_MAX: 160,
  GAP_RAMP_HEIGHT: 30000,
  // Spawn chances (base)
  MOVING_CHANCE: 0.15,
  BREAKABLE_CHANCE: 0.10,
  SPRING_CHANCE: 0.05,
  // Heights where advanced features kick in
  VANISH_START_HEIGHT: 3000,
  MONSTER_START_HEIGHT: 2000,
  // Difficulty scaling
  MAX_VANISHING_CHANCE: 0.08,
  MAX_MONSTER_CHANCE: 0.08,
  DIFFICULTY_RAMP_HEIGHT: 25000,
};

// ==========================================
// 2. Types
// ==========================================
type PlatformType = 'normal' | 'moving' | 'breakable' | 'vanishing';

interface Platform {
  id: number;
  x: number;          // left edge, screen-space horizontal
  y: number;          // bottom edge in world coords (Y up)
  w: number;
  type: PlatformType;
  hasSpring: boolean;
  hasMonster: boolean;
  broken: boolean;
  breakTimer: number;
  vanishTimer: number; // -1 = not triggered, counts down to 0
  visible: boolean;
  moveDir: number;
  moveSpeed: number;
  monsterAlive: boolean;
}

interface Bullet {
  id: number;
  x: number;
  y: number;   // world Y
  active: boolean;
}

interface GameState {
  cx: number;         // character center X (screen-space horizontal)
  cy: number;         // character BOTTOM Y in world coords (Y up)
  vy: number;         // positive = up, negative = down
  cameraY: number;    // world Y of camera bottom edge
  platforms: Platform[];
  highestPlatY: number;
  bullets: Bullet[];
  status: GameStatus;
  score: number;
  maxHeight: number;
  screenW: number;
  screenH: number;
}

// ==========================================
// 3. Helpers
// ==========================================
let _nextId = 0;
function nextId() { return ++_nextId; }

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function getDifficultyT(height: number) {
  return Math.min(1, height / CFG.DIFFICULTY_RAMP_HEIGHT);
}

function getGapRange(height: number): [number, number] {
  const t = Math.min(1, height / CFG.GAP_RAMP_HEIGHT);
  return [
    lerp(CFG.INITIAL_GAP_MIN, CFG.MAX_GAP_MIN, t),
    lerp(CFG.INITIAL_GAP_MAX, CFG.MAX_GAP_MAX, t),
  ];
}

function randomInRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function generatePlatform(y: number, screenW: number, height: number): Platform {
  const dt = getDifficultyT(height);

  let type: PlatformType = 'normal';
  const roll = Math.random();
  const vanishChance = height > CFG.VANISH_START_HEIGHT
    ? lerp(0, CFG.MAX_VANISHING_CHANCE, (height - CFG.VANISH_START_HEIGHT) / (CFG.DIFFICULTY_RAMP_HEIGHT - CFG.VANISH_START_HEIGHT))
    : 0;
  const breakChance = CFG.BREAKABLE_CHANCE + dt * 0.05;
  const moveChance = CFG.MOVING_CHANCE + dt * 0.05;

  if (roll < vanishChance) type = 'vanishing';
  else if (roll < vanishChance + breakChance) type = 'breakable';
  else if (roll < vanishChance + breakChance + moveChance) type = 'moving';

  const hasSpring = type === 'normal' && Math.random() < CFG.SPRING_CHANCE;

  const monsterChance = height > CFG.MONSTER_START_HEIGHT
    ? lerp(0, CFG.MAX_MONSTER_CHANCE, (height - CFG.MONSTER_START_HEIGHT) / (CFG.DIFFICULTY_RAMP_HEIGHT - CFG.MONSTER_START_HEIGHT))
    : 0;
  const hasMonster = type === 'normal' && !hasSpring && Math.random() < monsterChance;

  const w = CFG.PLAT_W + (type === 'moving' ? -10 : 0);
  const margin = 10;
  const x = margin + Math.random() * (screenW - w - margin * 2);

  return {
    id: nextId(),
    x, y, w, type,
    hasSpring, hasMonster,
    broken: false, breakTimer: 0, vanishTimer: -1, visible: true,
    moveDir: Math.random() < 0.5 ? -1 : 1,
    moveSpeed: 1 + Math.random() * 1.5,
    monsterAlive: hasMonster,
  };
}

function generateInitialPlatforms(screenW: number, screenH: number): { platforms: Platform[]; highestY: number } {
  const platforms: Platform[] = [];
  // Starting platform right at the bottom
  platforms.push({
    id: nextId(),
    x: screenW / 2 - CFG.PLAT_W / 2,
    y: 60,     // low in the world
    w: CFG.PLAT_W,
    type: 'normal',
    hasSpring: false, hasMonster: false,
    broken: false, breakTimer: 0, vanishTimer: -1, visible: true,
    moveDir: 1, moveSpeed: 0, monsterAlive: false,
  });

  let currentY = 60;
  while (currentY < screenH + 200) {
    const gap = randomInRange(CFG.INITIAL_GAP_MIN, CFG.INITIAL_GAP_MAX);
    currentY += gap;
    platforms.push(generatePlatform(currentY, screenW, 0));
  }

  return { platforms, highestY: currentY };
}

// ==========================================
// 4. World-to-Screen Conversion
// ==========================================
// World Y goes up, screen Y goes down.
// screenY = screenH - (worldY - cameraY)
function worldToScreenY(worldY: number, cameraY: number, screenH: number): number {
  return screenH - (worldY - cameraY);
}

// ==========================================
// 5. Game Logic Hook
// ==========================================
function useGameLogic(
  inputRef: MutableRefObject<NormalizedInput>,
  paused: boolean,
  callbacks: GameCallbacks,
) {
  const screenRef = useRef({ w: 400, h: 600 });

  useEffect(() => {
    const update = () => {
      screenRef.current = { w: window.innerWidth, h: window.innerHeight };
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const getInitialState = useCallback((): GameState => {
    const sw = screenRef.current.w;
    const sh = screenRef.current.h;
    const { platforms, highestY } = generateInitialPlatforms(sw, sh);
    return {
      cx: sw / 2,
      cy: 60 + CFG.PLAT_H,  // bottom of char sits on top of starting platform
      vy: 0,
      cameraY: 0,
      platforms,
      highestPlatY: highestY,
      bullets: [],
      status: 'READY',
      score: 0,
      maxHeight: 0,
      screenW: sw,
      screenH: sh,
    };
  }, []);

  const [gameState, setGameState] = useState<GameState>(getInitialState);
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => { callbacksRef.current.onScoreChange(gameState.score); }, [gameState.score]);
  useEffect(() => { callbacksRef.current.onStatusChange(gameState.status); }, [gameState.status]);

  // ── Game Loop ──
  useEffect(() => {
    let loopId: number;
    let lastFire = 0;

    const loop = () => {
      const input = inputRef.current;
      const s = stateRef.current;
      const sw = screenRef.current.w;
      const sh = screenRef.current.h;

      // ── Lifecycle actions (always check) ──
      if (s.status === 'READY' && input.actions['start-game']) {
        _nextId = 0;
        const fresh = getInitialState();
        fresh.status = 'PLAYING';
        fresh.vy = CFG.JUMP_VY;   // initial jump
        setGameState(fresh);
        sfx.start();
        loopId = requestAnimationFrame(loop);
        return;
      }
      if (input.actions['restart-game']) {
        _nextId = 0;
        setGameState(getInitialState());
        loopId = requestAnimationFrame(loop);
        return;
      }

      if (s.status === 'PLAYING' && !paused) {
        // ── Physics ──
        let vy = s.vy - CFG.GRAVITY;  // gravity pulls down
        let cy = s.cy + vy;
        let cx = s.cx + input.move.x * CFG.MOVE_SPEED;

        // Screen wrap (horizontal)
        if (cx < -CFG.CHAR_W) cx = sw;
        if (cx > sw + CFG.CHAR_W) cx = 0;

        // ── Camera: only moves up ──
        let cameraY = s.cameraY;
        const charRelY = cy - cameraY;  // char position relative to camera bottom
        if (charRelY > sh * 0.55) {
          cameraY = cy - sh * 0.55;
        }

        // Score = max height
        const maxHeight = Math.max(s.maxHeight, cy);
        const score = Math.floor(maxHeight);

        // ── Update platforms ──
        const platforms = [...s.platforms];
        let highestPlatY = s.highestPlatY;

        for (const plat of platforms) {
          // Moving platforms
          if (plat.type === 'moving' && !plat.broken) {
            plat.x += plat.moveDir * plat.moveSpeed;
            if (plat.x <= 0) { plat.x = 0; plat.moveDir = 1; }
            if (plat.x + plat.w >= sw) { plat.x = sw - plat.w; plat.moveDir = -1; }
          }
          // Breakable animation
          if (plat.broken && plat.type === 'breakable') {
            plat.breakTimer++;
            if (plat.breakTimer > 15) plat.visible = false;
          }
          // Vanishing: trigger when on screen
          if (plat.type === 'vanishing' && plat.visible) {
            const platWorldTop = plat.y + CFG.PLAT_H;
            if (platWorldTop > cameraY && plat.y < cameraY + sh) {
              if (plat.vanishTimer === -1) plat.vanishTimer = 60;
              if (plat.vanishTimer > 0) plat.vanishTimer--;
              if (plat.vanishTimer === 0) plat.visible = false;
            }
          }
        }

        // ── Platform collision (only when falling: vy < 0) ──
        if (vy < 0) {
          const charBottom = cy;                 // world Y of char bottom
          const prevCharBottom = s.cy;           // char bottom last frame
          const charLeft = cx - CFG.CHAR_W / 2;
          const charRight = cx + CFG.CHAR_W / 2;

          for (const plat of platforms) {
            if (!plat.visible || plat.broken) continue;

            const platTop = plat.y + CFG.PLAT_H;  // world Y of platform top surface
            const platLeft = plat.x;
            const platRight = plat.x + plat.w;

            // Horizontal overlap?
            if (charRight <= platLeft || charLeft >= platRight) continue;

            // Char bottom crossed platform top this frame?
            // Previous bottom was above (or at) platTop, current bottom is at or below platTop
            if (prevCharBottom >= platTop && charBottom <= platTop + 4) {
              // Snap char to platform top
              cy = platTop;

              // Monster on this platform?
              if (plat.monsterAlive) {
                // Stomp the monster (landed on top of it)
                plat.monsterAlive = false;
                sfx.explosion();
                vy = CFG.JUMP_VY;
                break;
              }

              // Spring bounce
              if (plat.hasSpring) {
                vy = CFG.SPRING_VY;
                sfx.powerup();
              } else {
                vy = CFG.JUMP_VY;
                sfx.paddleHit();
              }

              // Breakable
              if (plat.type === 'breakable') {
                plat.broken = true;
                plat.breakTimer = 0;
                sfx.brickBreak(0);
              }

              break;
            }
          }
        }

        // ── Monster side collision (while rising or level) ──
        {
          const charLeft = cx - CFG.CHAR_W / 2;
          const charRight = cx + CFG.CHAR_W / 2;
          const charBottom = cy;
          const charTop = cy + CFG.CHAR_H;

          for (const plat of platforms) {
            if (!plat.monsterAlive || !plat.visible) continue;
            const mCx = plat.x + plat.w / 2;
            const mBottom = plat.y + CFG.PLAT_H;
            const mTop = mBottom + CFG.MONSTER_H;
            const mLeft = mCx - CFG.MONSTER_W / 2;
            const mRight = mCx + CFG.MONSTER_W / 2;

            // AABB overlap
            if (charRight > mLeft && charLeft < mRight &&
                charTop > mBottom && charBottom < mTop) {
              // If falling onto monster from above, that's handled in platform collision.
              // Here we handle side/bottom hits while not landing on the platform.
              // Only kill if we're coming from above and landing
              if (vy < 0 && charBottom >= mTop - 5) {
                // This is a stomp, handled above. Skip.
                continue;
              }
              // Side collision -> die
              setGameState(prev => ({ ...prev, status: 'GAME_OVER', score: Math.floor(prev.maxHeight) }));
              loopId = requestAnimationFrame(loop);
              return;
            }
          }
        }

        // ── Bullets ──
        const bullets = [...s.bullets];
        const now = Date.now();
        if (input.actions.fire && now - lastFire > 300) {
          lastFire = now;
          bullets.push({
            id: nextId(),
            x: cx,
            y: cy + CFG.CHAR_H,
            active: true,
          });
          sfx.shoot();
        }

        for (const b of bullets) {
          if (!b.active) continue;
          b.y += CFG.BULLET_SPEED;
          if (b.y > cameraY + sh + 50) b.active = false;

          // Hit monsters
          for (const plat of platforms) {
            if (!plat.monsterAlive || !plat.visible) continue;
            const mCx = plat.x + plat.w / 2;
            const mCy = plat.y + CFG.PLAT_H + CFG.MONSTER_H / 2;
            if (Math.abs(b.x - mCx) < CFG.MONSTER_W / 2 + CFG.BULLET_SIZE &&
                Math.abs(b.y - mCy) < CFG.MONSTER_H / 2 + CFG.BULLET_SIZE) {
              plat.monsterAlive = false;
              b.active = false;
              sfx.explosion();
            }
          }
        }

        // ── Generate platforms above ──
        while (highestPlatY < cameraY + sh + 300) {
          const [gapMin, gapMax] = getGapRange(highestPlatY);
          highestPlatY += randomInRange(gapMin, gapMax);
          platforms.push(generatePlatform(highestPlatY, sw, highestPlatY));
        }

        // ── Cleanup off-screen platforms & bullets ──
        const cleanPlatforms = platforms.filter(p => p.y > cameraY - 200);
        const cleanBullets = bullets.filter(b => b.active);

        // ── Fall death: char below camera ──
        if (cy < cameraY - 100) {
          setGameState(prev => ({
            ...prev,
            status: 'GAME_OVER',
            score: Math.floor(prev.maxHeight),
          }));
          loopId = requestAnimationFrame(loop);
          return;
        }

        setGameState({
          cx, cy, vy, cameraY,
          platforms: cleanPlatforms,
          highestPlatY,
          bullets: cleanBullets,
          status: 'PLAYING',
          score, maxHeight,
          screenW: sw,
          screenH: sh,
        });
      }

      loopId = requestAnimationFrame(loop);
    };

    loopId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(loopId);
  }, [paused, inputRef, getInitialState]);

  return gameState;
}

// ==========================================
// 6. Platform Colors
// ==========================================
const PLATFORM_COLORS: Record<PlatformType, { bg: string; border: string }> = {
  normal:    { bg: '#5cb85c', border: '#4a9a4a' },
  moving:    { bg: '#5bc0de', border: '#46a0bd' },
  breakable: { bg: '#a0785a', border: '#8a6548' },
  vanishing: { bg: '#e0ddd5', border: '#c8c5bc' },
};

// ==========================================
// 7. Main Component
// ==========================================
interface Props {
  inputRef: MutableRefObject<NormalizedInput>;
  paused: boolean;
  callbacks: GameCallbacks;
  [key: string]: any;
}

export default function Game7({ inputRef, paused, callbacks }: Props) {
  const gs = useGameLogic(inputRef, paused, callbacks);
  const { cx, cy, vy, cameraY, platforms, bullets, status, score, screenW, screenH } = gs;

  // Convert world Y to screen Y (Y up -> Y down)
  const toScreenY = (worldY: number) => worldToScreenY(worldY, cameraY, screenH);

  const facingRight = inputRef.current.move.x >= 0;

  // Character screen position
  const charScreenX = cx - CFG.CHAR_W / 2;
  const charScreenTop = toScreenY(cy + CFG.CHAR_H);  // top of char on screen

  return (
    <div
      className="relative w-full h-screen overflow-hidden select-none"
      style={{
        background: '#faf8ef',
        fontFamily: "'Patrick Hand', 'Comic Sans MS', cursive, sans-serif",
      }}
    >
      {/* Grid pattern background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(200,195,180,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(200,195,180,0.25) 1px, transparent 1px)',
          backgroundSize: '25px 25px',
          backgroundPosition: `0 ${(cameraY * -1) % 25}px`,
        }}
      />

      {/* Height markers */}
      {Array.from({ length: 20 }, (_, i) => {
        const markHeight = Math.floor(cameraY / 200) * 200 + i * 200;
        const sy = toScreenY(markHeight);
        if (sy < -20 || sy > screenH + 20) return null;
        return (
          <div
            key={`mark-${markHeight}`}
            className="absolute left-2 pointer-events-none"
            style={{
              top: sy,
              color: 'rgba(180,175,160,0.5)',
              fontFamily: 'monospace',
              fontSize: 10,
            }}
          >
            {markHeight}
          </div>
        );
      })}

      {/* Platforms */}
      {platforms.map(plat => {
        if (!plat.visible) return null;
        // Platform screen position: top-left corner
        const pScreenX = plat.x;
        const pScreenY = toScreenY(plat.y + CFG.PLAT_H); // top of platform on screen

        if (pScreenY < -60 || pScreenY > screenH + 60) return null;

        const colors = PLATFORM_COLORS[plat.type];
        const opacity = plat.type === 'vanishing' && plat.vanishTimer >= 0
          ? plat.vanishTimer / 60
          : 1;
        const cracked = plat.type === 'breakable' && plat.broken;

        return (
          <React.Fragment key={plat.id}>
            {/* Platform body */}
            <div
              className="absolute"
              style={{
                left: pScreenX,
                top: pScreenY,
                width: plat.w,
                height: CFG.PLAT_H,
                backgroundColor: colors.bg,
                borderRadius: 4,
                border: `2px solid ${colors.border}`,
                opacity,
                transform: cracked ? 'rotate(3deg) translateY(2px)' : undefined,
                transition: cracked ? 'transform 0.1s' : undefined,
              }}
            >
              {/* Crack lines */}
              {cracked && (
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 65 12" preserveAspectRatio="none">
                  <line x1="15" y1="0" x2="30" y2="12" stroke="#5a3e28" strokeWidth="1.5" />
                  <line x1="40" y1="0" x2="35" y2="12" stroke="#5a3e28" strokeWidth="1.5" />
                  <line x1="25" y1="6" x2="45" y2="4" stroke="#5a3e28" strokeWidth="1" />
                </svg>
              )}

              {/* Surface highlight */}
              {plat.type === 'normal' && !plat.hasSpring && !plat.hasMonster && (
                <div
                  className="absolute"
                  style={{
                    top: 2, left: 4, right: 4, height: 3,
                    borderRadius: 2,
                    backgroundColor: 'rgba(255,255,255,0.25)',
                  }}
                />
              )}
            </div>

            {/* Spring */}
            {plat.hasSpring && (
              <div
                className="absolute"
                style={{
                  left: pScreenX + plat.w / 2 - 8,
                  top: pScreenY - 14,
                  width: 16,
                  height: 14,
                }}
              >
                <svg width="16" height="14" viewBox="0 0 16 14">
                  <path
                    d="M3,14 L3,11 L13,9 L3,7 L13,5 L3,3 L13,1 L8,0"
                    fill="none"
                    stroke="#888"
                    strokeWidth="2"
                  />
                  <circle cx="8" cy="0" r="3" fill="#e74c3c" />
                </svg>
              </div>
            )}

            {/* Monster */}
            {plat.monsterAlive && (
              <div
                className="absolute"
                style={{
                  left: pScreenX + plat.w / 2 - CFG.MONSTER_W / 2,
                  top: pScreenY - CFG.MONSTER_H,
                  width: CFG.MONSTER_W,
                  height: CFG.MONSTER_H,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#9b59b6',
                    borderRadius: '50% 50% 40% 40%',
                    position: 'relative',
                    border: '2px solid #7d3c98',
                  }}
                >
                  {/* Eyes */}
                  <div className="absolute" style={{ width: 8, height: 8, backgroundColor: 'white', borderRadius: '50%', top: 6, left: 4 }}>
                    <div className="absolute" style={{ width: 4, height: 4, backgroundColor: '#1a1a2e', borderRadius: '50%', top: 2, left: 2 }} />
                  </div>
                  <div className="absolute" style={{ width: 8, height: 8, backgroundColor: 'white', borderRadius: '50%', top: 6, right: 4 }}>
                    <div className="absolute" style={{ width: 4, height: 4, backgroundColor: '#1a1a2e', borderRadius: '50%', top: 2, left: 2 }} />
                  </div>
                  {/* Teeth */}
                  <div className="absolute" style={{ bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 12, height: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ width: 3, height: 4, backgroundColor: 'white', borderRadius: '0 0 2px 2px' }} />
                    <div style={{ width: 3, height: 4, backgroundColor: 'white', borderRadius: '0 0 2px 2px' }} />
                    <div style={{ width: 3, height: 4, backgroundColor: 'white', borderRadius: '0 0 2px 2px' }} />
                  </div>
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* Bullets */}
      {bullets.map(b => {
        const bScreenX = b.x - CFG.BULLET_SIZE;
        const bScreenY = toScreenY(b.y + CFG.BULLET_SIZE);
        if (bScreenY < -20 || bScreenY > screenH + 20) return null;
        return (
          <div
            key={b.id}
            className="absolute rounded-full"
            style={{
              left: bScreenX,
              top: bScreenY,
              width: CFG.BULLET_SIZE * 2,
              height: CFG.BULLET_SIZE * 2,
              backgroundColor: '#2c3e50',
              boxShadow: '0 0 4px rgba(0,0,0,0.3)',
            }}
          />
        );
      })}

      {/* Character (Doodler) — always visible so READY screen matches gameplay */}
      {status !== 'GAME_OVER' && (
        <div
          className="absolute"
          style={{
            left: charScreenX,
            top: charScreenTop,
            width: CFG.CHAR_W,
            height: CFG.CHAR_H,
            transform: facingRight ? 'scaleX(1)' : 'scaleX(-1)',
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#5cb85c',
              borderRadius: 8,
              border: '2px solid #4a9a4a',
              position: 'relative',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            }}
          >
            {/* Eyes */}
            <div className="absolute" style={{ width: 8, height: 9, backgroundColor: 'white', borderRadius: '50%', top: 5, left: 5, border: '1px solid #333' }}>
              <div className="absolute" style={{ width: 4, height: 4, backgroundColor: '#1a1a2e', borderRadius: '50%', bottom: 1, right: 0 }} />
            </div>
            <div className="absolute" style={{ width: 8, height: 9, backgroundColor: 'white', borderRadius: '50%', top: 5, right: 5, border: '1px solid #333' }}>
              <div className="absolute" style={{ width: 4, height: 4, backgroundColor: '#1a1a2e', borderRadius: '50%', bottom: 1, right: 0 }} />
            </div>
            {/* Beak */}
            <div className="absolute" style={{ width: 6, height: 4, backgroundColor: '#e8a838', borderRadius: '0 50% 50% 0', top: 12, right: -3 }} />
            {/* Feet (visible when falling) */}
            {vy < -2 && (
              <>
                <div className="absolute" style={{ width: 8, height: 4, backgroundColor: '#e8a838', borderRadius: '0 0 4px 4px', bottom: -4, left: 4 }} />
                <div className="absolute" style={{ width: 8, height: 4, backgroundColor: '#e8a838', borderRadius: '0 0 4px 4px', bottom: -4, right: 4 }} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Score */}
      {status === 'PLAYING' && (
        <div
          className="absolute z-20"
          style={{
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 22,
            fontWeight: 900,
            color: '#4a4a3a',
            letterSpacing: 2,
            textShadow: '0 1px 2px rgba(0,0,0,0.1)',
          }}
        >
          {score}
        </div>
      )}

    </div>
  );
}
