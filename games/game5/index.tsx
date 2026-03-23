// games/game5/index.tsx — Tilt to Live (Arena Survival)
'use client';

import React, { useEffect, useState, useRef, useCallback, MutableRefObject } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { NormalizedInput, GameCallbacks, GameStatus } from '@/platform/types';
import { sfx } from '@/platform/audio';

// ==========================================
// 1. Configuration
// ==========================================
const CFG = {
  PLAYER_SIZE: 18,
  PLAYER_HITBOX: 10,
  ENEMY_SIZE: 14,
  ENEMY_HITBOX: 10,
  ENEMY_BASE_SPEED: 0.6,
  ENEMY_SPEED_RAMP: 0.12,
  INITIAL_SPAWN_INTERVAL: 2200,
  MIN_SPAWN_INTERVAL: 400,
  SPAWN_INTERVAL_RAMP: 180,
  INITIAL_WAVE_SIZE: 2,
  MAX_WAVE_SIZE: 12,
  POWERUP_SIZE: 20,
  POWERUP_HITBOX: 16,
  POWERUP_SPAWN_INTERVAL: 6000,
  POWERUP_MIN_INTERVAL: 3500,
  MISSILE_SPEED: 8,
  MISSILE_SIZE: 6,
  MISSILE_COUNT: 10,
  FREEZE_DURATION: 3000,
  VORTEX_DURATION: 2000,
  VORTEX_RADIUS: 160,
  SPEED_BOOST_DURATION: 4000,
  SPEED_BOOST_MULTIPLIER: 2.2,
  BUZZSAW_DURATION: 4000,
  BUZZSAW_RADIUS: 35,
  NUKE_MIN_GAME_TIME: 60,
  SCORE_PER_KILL: 10,
  SCORE_PER_SECOND: 1,
  DIFFICULTY_INTERVAL: 10,
  GRID_SIZE: 50,
  PARTICLE_COUNT: 8,
};

// ==========================================
// 2. Types
// ==========================================
type PowerupType = 'missile' | 'nuke' | 'freeze' | 'vortex' | 'speed' | 'buzzsaw';

interface Vec2 { x: number; y: number; }

interface Enemy {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  frozen: boolean;
  active: boolean;
}

interface Powerup {
  id: string;
  x: number;
  y: number;
  type: PowerupType;
  active: boolean;
  spawnTime: number;
}

interface Missile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
}

interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface VortexEffect {
  x: number;
  y: number;
  startTime: number;
  duration: number;
}

interface FlashEffect {
  x: number;
  y: number;
  startTime: number;
  color: string;
}

interface GameState {
  player: Vec2;
  enemies: Enemy[];
  powerups: Powerup[];
  missiles: Missile[];
  particles: Particle[];
  status: GameStatus;
  score: number;
  startTime: number;
  lastSpawnTime: number;
  lastPowerupTime: number;
  lastScoreTickTime: number;
  difficultyLevel: number;
  frozenUntil: number;
  vortex: VortexEffect | null;
  nukeFlash: number;
  flashes: FlashEffect[];
  speedBoostUntil: number;
  buzzsawUntil: number;
}

// ==========================================
// 3. Helpers
// ==========================================
const POWERUP_COLORS: Record<PowerupType, string> = {
  missile: '#3b82f6',
  nuke: '#eab308',
  freeze: '#22c55e',
  vortex: '#a855f7',
  speed: '#f97316',
  buzzsaw: '#ec4899',
};

const POWERUP_LABELS: Record<PowerupType, string> = {
  missile: 'M',
  nuke: 'N',
  freeze: 'F',
  vortex: 'V',
  speed: 'S',
  buzzsaw: 'G',
};

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function randomEdgePosition(w: number, h: number): Vec2 {
  const side = Math.floor(Math.random() * 4);
  const margin = 30;
  switch (side) {
    case 0: return { x: Math.random() * w, y: -margin }; // top
    case 1: return { x: Math.random() * w, y: h + margin }; // bottom
    case 2: return { x: -margin, y: Math.random() * h }; // left
    default: return { x: w + margin, y: Math.random() * h }; // right
  }
}

function randomArenaPosition(w: number, h: number, margin: number = 60): Vec2 {
  return {
    x: margin + Math.random() * (w - margin * 2),
    y: margin + Math.random() * (h - margin * 2),
  };
}

function spawnParticles(x: number, y: number, color: string, count: number = CFG.PARTICLE_COUNT): Particle[] {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3 + 1.5;
    return {
      id: uuidv4(),
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color,
      size: Math.random() * 3 + 2,
    };
  });
}

// ==========================================
// 4. Game Logic Hook
// ==========================================
function useGameLogic(
  inputRef: MutableRefObject<NormalizedInput>,
  paused: boolean,
  callbacks: GameCallbacks
) {
  const boundsRef = useRef({ w: 800, h: 600 });

  useEffect(() => {
    const update = () => {
      boundsRef.current = { w: window.innerWidth, h: window.innerHeight };
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const getInitialState = useCallback((): GameState => {
    const { w, h } = boundsRef.current;
    return {
      player: { x: w / 2, y: h / 2 },
      enemies: [],
      powerups: [],
      missiles: [],
      particles: [],
      status: 'READY',
      score: 0,
      startTime: 0,
      lastSpawnTime: 0,
      lastPowerupTime: 0,
      lastScoreTickTime: 0,
      difficultyLevel: 0,
      frozenUntil: 0,
      vortex: null,
      nukeFlash: 0,
      flashes: [],
      speedBoostUntil: 0,
      buzzsawUntil: 0,
    };
  }, []);

  const [gameState, setGameState] = useState<GameState>(getInitialState);
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Report score / status
  useEffect(() => { callbacksRef.current.onScoreChange(gameState.score); }, [gameState.score]);
  useEffect(() => { callbacksRef.current.onStatusChange(gameState.status); }, [gameState.status]);

  // Game Loop
  useEffect(() => {
    let loopId: number;
    let prevTime = performance.now();

    const loop = (currentTime: number) => {
      const dt = Math.min((currentTime - prevTime) / 16.667, 3); // normalize to ~60fps, cap at 3x
      prevTime = currentTime;

      const input = inputRef.current;
      const s = stateRef.current;
      const { w, h } = boundsRef.current;

      // ── Lifecycle actions ──
      if (s.status === 'READY' && input.actions['start-game']) {
        const now = Date.now();
        setGameState(prev => ({
          ...prev,
          status: 'PLAYING',
          startTime: now,
          lastSpawnTime: now,
          lastPowerupTime: now,
          lastScoreTickTime: now,
          player: { x: w / 2, y: h / 2 },
        }));
      }
      if (input.actions['restart-game']) {
        setGameState(getInitialState());
      }
      if (input.actions.pause && s.status === 'PLAYING') {
        callbacksRef.current.onStatusChange('PAUSED');
      }
      if (input.actions.resume) {
        callbacksRef.current.onStatusChange('PLAYING');
      }

      // ── Game update ──
      if (s.status === 'PLAYING' && !paused) {
        const now = Date.now();
        const gameTime = (now - s.startTime) / 1000;
        const diffLevel = Math.floor(gameTime / CFG.DIFFICULTY_INTERVAL);
        const enemySpeed = (CFG.ENEMY_BASE_SPEED + diffLevel * CFG.ENEMY_SPEED_RAMP) * dt;
        const spawnInterval = Math.max(
          CFG.MIN_SPAWN_INTERVAL,
          CFG.INITIAL_SPAWN_INTERVAL - diffLevel * CFG.SPAWN_INTERVAL_RAMP
        );
        const waveSize = Math.min(
          CFG.MAX_WAVE_SIZE,
          CFG.INITIAL_WAVE_SIZE + Math.floor(diffLevel * 0.6)
        );
        const isFrozen = now < s.frozenUntil;

        // Player movement
        const isSpeedBoosted = now < s.speedBoostUntil;
        const speedMult = isSpeedBoosted ? CFG.SPEED_BOOST_MULTIPLIER : 1;
        let px = s.player.x + input.move.x * dt * speedMult;
        let py = s.player.y + input.move.y * dt * speedMult;
        px = Math.max(CFG.PLAYER_SIZE, Math.min(w - CFG.PLAYER_SIZE, px));
        py = Math.max(CFG.PLAYER_SIZE, Math.min(h - CFG.PLAYER_SIZE, py));

        // Copy arrays
        let enemies = [...s.enemies];
        let powerups = [...s.powerups];
        let missiles = [...s.missiles];
        let particles = [...s.particles];
        let flashes = [...s.flashes];
        let scoreAdd = 0;
        let gameOver = false;
        let frozenUntil = s.frozenUntil;
        let vortex = s.vortex;
        let nukeFlash = s.nukeFlash;
        let speedBoostUntil = s.speedBoostUntil;
        let buzzsawUntil = s.buzzsawUntil;
        const isBuzzsaw = now < buzzsawUntil;
        let lastSpawnTime = s.lastSpawnTime;
        let lastPowerupTime = s.lastPowerupTime;
        let lastScoreTickTime = s.lastScoreTickTime;

        // Score per second
        if (now - lastScoreTickTime >= 1000) {
          scoreAdd += CFG.SCORE_PER_SECOND;
          lastScoreTickTime = now;
        }

        // Spawn enemies
        if (now - lastSpawnTime >= spawnInterval) {
          lastSpawnTime = now;
          for (let i = 0; i < waveSize; i++) {
            const pos = randomEdgePosition(w, h);
            const angle = Math.atan2(py - pos.y, px - pos.x);
            // Add some spread so they don't all converge on exact same point
            const spread = (Math.random() - 0.5) * 0.6;
            enemies.push({
              id: uuidv4(),
              x: pos.x, y: pos.y,
              vx: Math.cos(angle + spread),
              vy: Math.sin(angle + spread),
              frozen: false,
              active: true,
            });
          }
        }

        // Spawn powerups (weighted random, nuke restricted)
        const powerupInterval = Math.max(
          CFG.POWERUP_MIN_INTERVAL,
          CFG.POWERUP_SPAWN_INTERVAL - diffLevel * 200
        );
        if (now - lastPowerupTime >= powerupInterval && powerups.filter(p => p.active).length < 3) {
          lastPowerupTime = now;
          // Build weighted pool
          const pool: { type: PowerupType; weight: number }[] = [
            { type: 'missile', weight: 20 },
            { type: 'speed', weight: 28 },
            { type: 'buzzsaw', weight: 15 },
            { type: 'freeze', weight: 18 },
            { type: 'vortex', weight: 12 },
          ];
          // Nuke: only after 60 seconds, low weight
          if (gameTime >= CFG.NUKE_MIN_GAME_TIME) {
            pool.push({ type: 'nuke', weight: 7 });
          }
          const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);
          let roll = Math.random() * totalWeight;
          let type: PowerupType = 'missile';
          for (const entry of pool) {
            roll -= entry.weight;
            if (roll <= 0) { type = entry.type; break; }
          }
          const pos = randomArenaPosition(w, h);
          powerups.push({
            id: uuidv4(),
            x: pos.x, y: pos.y,
            type,
            active: true,
            spawnTime: now,
          });
        }

        // Remove old powerups (after 10 seconds)
        powerups = powerups.filter(p => p.active && now - p.spawnTime < 10000);

        // Move enemies
        for (const e of enemies) {
          if (!e.active) continue;
          if (isFrozen || e.frozen) continue;

          // Vortex pull
          if (vortex && now - vortex.startTime < vortex.duration) {
            const d = dist(e, vortex);
            if (d < CFG.VORTEX_RADIUS) {
              const pull = (1 - d / CFG.VORTEX_RADIUS) * 3 * dt;
              const angle = Math.atan2(vortex.y - e.y, vortex.x - e.x);
              e.x += Math.cos(angle) * pull;
              e.y += Math.sin(angle) * pull;
              // Destroy if very close to center
              if (d < 15) {
                e.active = false;
                scoreAdd += CFG.SCORE_PER_KILL;
                particles.push(...spawnParticles(e.x, e.y, '#a855f7', 5));
              }
              continue;
            }
          }

          // Normal tracking: re-target toward player
          const angle = Math.atan2(py - e.y, px - e.x);
          // Blend existing direction with tracking (80% track, 20% keep)
          e.vx = e.vx * 0.2 + Math.cos(angle) * 0.8;
          e.vy = e.vy * 0.2 + Math.sin(angle) * 0.8;
          // Normalize
          const len = Math.sqrt(e.vx * e.vx + e.vy * e.vy) || 1;
          e.vx /= len;
          e.vy /= len;
          e.x += e.vx * enemySpeed;
          e.y += e.vy * enemySpeed;
        }

        // Handle freeze shatter
        if (s.frozenUntil > 0 && now >= s.frozenUntil && isFrozen === false) {
          // Freeze just ended — shatter all frozen enemies
          for (const e of enemies) {
            if (e.active && e.frozen) {
              e.active = false;
              scoreAdd += CFG.SCORE_PER_KILL;
              particles.push(...spawnParticles(e.x, e.y, '#22c55e', 6));
            }
          }
          if (enemies.some(e => e.frozen)) {
            sfx.explosion();
          }
          frozenUntil = 0;
        }

        // Apply frozen state
        if (isFrozen) {
          for (const e of enemies) {
            if (e.active) e.frozen = true;
          }
        }

        // Handle vortex expiry
        if (vortex && now - vortex.startTime >= vortex.duration) {
          // Kill remaining enemies near vortex
          for (const e of enemies) {
            if (!e.active) continue;
            if (dist(e, vortex) < CFG.VORTEX_RADIUS * 0.5) {
              e.active = false;
              scoreAdd += CFG.SCORE_PER_KILL;
              particles.push(...spawnParticles(e.x, e.y, '#a855f7', 5));
            }
          }
          vortex = null;
        }

        // Move missiles
        for (const m of missiles) {
          if (!m.active) continue;
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          // Out of bounds
          if (m.x < -20 || m.x > w + 20 || m.y < -20 || m.y > h + 20) {
            m.active = false;
          }
        }

        // Missile vs enemy collision
        for (const m of missiles) {
          if (!m.active) continue;
          for (const e of enemies) {
            if (!e.active) continue;
            if (dist(m, e) < CFG.MISSILE_SIZE + CFG.ENEMY_HITBOX) {
              m.active = false;
              e.active = false;
              scoreAdd += CFG.SCORE_PER_KILL;
              sfx.explosion();
              particles.push(...spawnParticles(e.x, e.y, '#3b82f6', 6));
            }
          }
        }

        // Player vs powerup collision
        const playerPos: Vec2 = { x: px, y: py };
        for (const p of powerups) {
          if (!p.active) continue;
          if (dist(playerPos, p) < CFG.PLAYER_HITBOX + CFG.POWERUP_HITBOX) {
            p.active = false;
            sfx.powerup();
            flashes.push({ x: p.x, y: p.y, startTime: now, color: POWERUP_COLORS[p.type] });

            switch (p.type) {
              case 'missile': {
                // Fire missiles outward from player
                for (let i = 0; i < CFG.MISSILE_COUNT; i++) {
                  const angle = (Math.PI * 2 * i) / CFG.MISSILE_COUNT;
                  missiles.push({
                    id: uuidv4(),
                    x: px, y: py,
                    vx: Math.cos(angle) * CFG.MISSILE_SPEED,
                    vy: Math.sin(angle) * CFG.MISSILE_SPEED,
                    active: true,
                  });
                }
                break;
              }
              case 'nuke': {
                sfx.crash();
                nukeFlash = now;
                // Destroy ALL enemies
                for (const e of enemies) {
                  if (e.active) {
                    e.active = false;
                    scoreAdd += CFG.SCORE_PER_KILL;
                    particles.push(...spawnParticles(e.x, e.y, '#eab308', 4));
                  }
                }
                break;
              }
              case 'freeze': {
                frozenUntil = now + CFG.FREEZE_DURATION;
                for (const e of enemies) {
                  if (e.active) e.frozen = true;
                }
                break;
              }
              case 'vortex': {
                vortex = { x: px, y: py, startTime: now, duration: CFG.VORTEX_DURATION };
                break;
              }
              case 'speed': {
                speedBoostUntil = now + CFG.SPEED_BOOST_DURATION;
                break;
              }
              case 'buzzsaw': {
                buzzsawUntil = now + CFG.BUZZSAW_DURATION;
                sfx.crash();
                break;
              }
            }
          }
        }

        // Player vs enemy collision
        for (const e of enemies) {
          if (!e.active) continue;
          const hitDist = isBuzzsaw ? CFG.BUZZSAW_RADIUS : CFG.PLAYER_HITBOX + CFG.ENEMY_HITBOX;
          if (dist(playerPos, e) < hitDist) {
            if (isBuzzsaw) {
              // Buzzsaw mode: kill enemy on contact
              e.active = false;
              scoreAdd += CFG.SCORE_PER_KILL;
              particles.push(...spawnParticles(e.x, e.y, '#ec4899', 6));
            } else {
              gameOver = true;
              break;
            }
          }
        }

        // Update particles
        for (const p of particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.96;
          p.vy *= 0.96;
          p.life -= 0.03 * dt;
        }

        // Remove stale flashes
        flashes = flashes.filter(f => now - f.startTime < 400);

        // Nuke flash fade
        if (nukeFlash > 0 && now - nukeFlash > 500) {
          nukeFlash = 0;
        }

        setGameState({
          ...s,
          status: gameOver ? 'GAME_OVER' : 'PLAYING',
          player: { x: px, y: py },
          enemies: enemies.filter(e => e.active),
          powerups: powerups.filter(p => p.active),
          missiles: missiles.filter(m => m.active),
          particles: particles.filter(p => p.life > 0),
          score: s.score + scoreAdd,
          difficultyLevel: diffLevel,
          frozenUntil,
          vortex,
          nukeFlash,
          flashes,
          speedBoostUntil,
          buzzsawUntil,
          lastSpawnTime,
          lastPowerupTime,
          lastScoreTickTime,
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
// 5. Grid Background Component
// ==========================================
function GridBackground({ w, h }: { w: number; h: number }) {
  const lines: React.ReactNode[] = [];
  // Vertical lines
  for (let x = 0; x < w; x += CFG.GRID_SIZE) {
    lines.push(
      <div key={`v${x}`} className="absolute top-0 bottom-0"
        style={{ left: x, width: 1, background: 'rgba(255,255,255,0.04)' }} />
    );
  }
  // Horizontal lines
  for (let y = 0; y < h; y += CFG.GRID_SIZE) {
    lines.push(
      <div key={`h${y}`} className="absolute left-0 right-0"
        style={{ top: y, height: 1, background: 'rgba(255,255,255,0.04)' }} />
    );
  }
  return <>{lines}</>;
}

// ==========================================
// 6. Main Component
// ==========================================
interface Props {
  inputRef: MutableRefObject<NormalizedInput>;
  paused: boolean;
  callbacks: GameCallbacks;
  [key: string]: any;
}

export default function Game5({ inputRef, paused, callbacks }: Props) {
  const gameState = useGameLogic(inputRef, paused, callbacks);
  const {
    player, enemies, powerups, missiles, particles,
    status, score, startTime, difficultyLevel,
    frozenUntil, vortex, nukeFlash, flashes,
    speedBoostUntil, buzzsawUntil,
  } = gameState;

  const [dims, setDims] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const update = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const now = Date.now();
  const isFrozen = now < frozenUntil;
  const vortexActive = vortex && now - vortex.startTime < vortex.duration;
  const isSpeedBoosted = now < speedBoostUntil;
  const isBuzzsawActive = now < buzzsawUntil;
  const nukeFlashActive = nukeFlash > 0 && now - nukeFlash < 500;
  const nukeFlashOpacity = nukeFlashActive ? Math.max(0, 1 - (now - nukeFlash) / 500) : 0;

  // Player rotation based on movement direction
  const input = inputRef.current;
  const moveAngle = Math.atan2(input.move.y, input.move.x) * (180 / Math.PI) + 90;
  const isMoving = Math.abs(input.move.x) > 0.1 || Math.abs(input.move.y) > 0.1;

  return (
    <div
      className="relative w-full h-screen overflow-hidden font-mono select-none"
      style={{ background: 'radial-gradient(ellipse at center, #0a0e1a 0%, #050510 70%, #020208 100%)' }}
    >
      {/* Grid */}
      <GridBackground w={dims.w} h={dims.h} />

      {/* Nuke flash overlay */}
      {nukeFlashActive && (
        <div className="absolute inset-0 z-30 pointer-events-none"
          style={{ background: `rgba(255, 255, 200, ${nukeFlashOpacity * 0.6})` }} />
      )}

      {/* Freeze overlay */}
      {isFrozen && (
        <div className="absolute inset-0 z-10 pointer-events-none"
          style={{ background: 'rgba(34, 197, 94, 0.05)', border: '2px solid rgba(34, 197, 94, 0.3)' }} />
      )}

      {/* Vortex effect */}
      {vortexActive && vortex && (
        <div className="absolute z-10 pointer-events-none rounded-full"
          style={{
            left: vortex.x - CFG.VORTEX_RADIUS,
            top: vortex.y - CFG.VORTEX_RADIUS,
            width: CFG.VORTEX_RADIUS * 2,
            height: CFG.VORTEX_RADIUS * 2,
            background: 'radial-gradient(circle, rgba(168,85,247,0.3) 0%, rgba(168,85,247,0.1) 40%, transparent 70%)',
            animation: 'spin 1s linear infinite',
            border: '1px solid rgba(168,85,247,0.3)',
          }}
        />
      )}

      {/* Powerup collection flashes */}
      {flashes.map((f, i) => {
        const age = now - f.startTime;
        const opacity = Math.max(0, 1 - age / 400);
        const size = 40 + age * 0.3;
        return (
          <div key={i} className="absolute z-20 pointer-events-none rounded-full"
            style={{
              left: f.x - size / 2,
              top: f.y - size / 2,
              width: size, height: size,
              background: `radial-gradient(circle, ${f.color}80, transparent)`,
              opacity,
            }} />
        );
      })}

      {/* Enemies */}
      {enemies.map(e => (
        <div key={e.id} className="absolute pointer-events-none"
          style={{
            left: e.x - CFG.ENEMY_SIZE / 2,
            top: e.y - CFG.ENEMY_SIZE / 2,
            width: CFG.ENEMY_SIZE,
            height: CFG.ENEMY_SIZE,
            borderRadius: '50%',
            background: e.frozen
              ? 'radial-gradient(circle, #86efac, #22c55e)'
              : 'radial-gradient(circle, #fca5a5, #ef4444)',
            boxShadow: e.frozen
              ? '0 0 10px rgba(34,197,94,0.6)'
              : '0 0 10px rgba(239,68,68,0.6), 0 0 20px rgba(239,68,68,0.3)',
            transition: e.frozen ? 'background 0.3s' : 'none',
          }}
        />
      ))}

      {/* Powerups */}
      {powerups.map(p => {
        const age = now - p.spawnTime;
        const pulse = 1 + Math.sin(age * 0.005) * 0.15;
        const color = POWERUP_COLORS[p.type];
        return (
          <div key={p.id} className="absolute pointer-events-none flex items-center justify-center"
            style={{
              left: p.x - (CFG.POWERUP_SIZE * pulse) / 2,
              top: p.y - (CFG.POWERUP_SIZE * pulse) / 2,
              width: CFG.POWERUP_SIZE * pulse,
              height: CFG.POWERUP_SIZE * pulse,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${color}cc, ${color}66)`,
              boxShadow: `0 0 14px ${color}88, 0 0 28px ${color}44`,
              border: `2px solid ${color}aa`,
            }}
          >
            <span className="text-white text-xs font-black" style={{ textShadow: `0 0 6px ${color}` }}>
              {POWERUP_LABELS[p.type]}
            </span>
          </div>
        );
      })}

      {/* Missiles */}
      {missiles.map(m => (
        <div key={m.id} className="absolute pointer-events-none"
          style={{
            left: m.x - CFG.MISSILE_SIZE / 2,
            top: m.y - CFG.MISSILE_SIZE / 2,
            width: CFG.MISSILE_SIZE,
            height: CFG.MISSILE_SIZE,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #fff, #60a5fa)',
            boxShadow: '0 0 8px rgba(96,165,250,0.8)',
          }}
        />
      ))}

      {/* Particles */}
      {particles.map(p => (
        <div key={p.id} className="absolute pointer-events-none rounded-full"
          style={{
            left: p.x - p.size / 2,
            top: p.y - p.size / 2,
            width: p.size,
            height: p.size,
            background: p.color,
            opacity: Math.max(0, p.life),
            boxShadow: `0 0 4px ${p.color}`,
          }}
        />
      ))}

      {/* Player */}
      {status !== 'READY' && (
        <div className="absolute z-20 pointer-events-none"
          style={{
            left: player.x - (isBuzzsawActive ? CFG.BUZZSAW_RADIUS : CFG.PLAYER_SIZE),
            top: player.y - (isBuzzsawActive ? CFG.BUZZSAW_RADIUS : CFG.PLAYER_SIZE),
            width: (isBuzzsawActive ? CFG.BUZZSAW_RADIUS : CFG.PLAYER_SIZE) * 2,
            height: (isBuzzsawActive ? CFG.BUZZSAW_RADIUS : CFG.PLAYER_SIZE) * 2,
          }}
        >
          {isBuzzsawActive ? (
            <>
              {/* Buzzsaw gear */}
              <svg viewBox="0 0 70 70" className="w-full h-full"
                style={{
                  animation: 'spin 0.4s linear infinite',
                  filter: 'drop-shadow(0 0 10px rgba(236,72,153,0.8)) drop-shadow(0 0 20px rgba(236,72,153,0.4))',
                }}
              >
                {/* Gear teeth */}
                {Array.from({ length: 10 }).map((_, i) => {
                  const angle = (i * 36) * Math.PI / 180;
                  const outerR = 34;
                  const innerR = 24;
                  const toothW = 8;
                  const cx = 35, cy = 35;
                  const cos = Math.cos(angle);
                  const sin = Math.sin(angle);
                  const cos2 = Math.cos(angle + 0.15);
                  const sin2 = Math.sin(angle + 0.15);
                  const cos3 = Math.cos(angle - 0.15);
                  const sin3 = Math.sin(angle - 0.15);
                  return (
                    <polygon key={i}
                      points={`${cx + cos3 * innerR},${cy + sin3 * innerR} ${cx + cos * outerR},${cy + sin * outerR} ${cx + cos2 * innerR},${cy + sin2 * innerR}`}
                      fill="#ec4899"
                    />
                  );
                })}
                <circle cx="35" cy="35" r="20" fill="#ec4899" />
                <circle cx="35" cy="35" r="10" fill="#1e1e2e" />
                <circle cx="35" cy="35" r="5" fill="#ec4899" />
              </svg>
            </>
          ) : (
            <>
              {/* Normal player */}
              {/* Speed boost trail */}
              {isSpeedBoosted && (
                <div className="absolute inset-0 rounded-full"
                  style={{
                    background: 'radial-gradient(circle, rgba(249,115,22,0.25), transparent 70%)',
                    animation: 'pulse-fast 0.3s ease-in-out infinite',
                  }}
                />
              )}
              {/* Glow ring */}
              <div className="absolute inset-0 rounded-full"
                style={{
                  background: isSpeedBoosted
                    ? 'radial-gradient(circle, rgba(249,115,22,0.2), transparent 70%)'
                    : 'radial-gradient(circle, rgba(103,232,249,0.15), transparent 70%)',
                }}
              />
              {/* Arrow SVG */}
              <svg viewBox="0 0 36 36" className="w-full h-full"
                style={{
                  transform: `rotate(${isMoving ? moveAngle : 0}deg)`,
                  transition: 'transform 0.1s ease-out',
                  filter: isSpeedBoosted
                    ? 'drop-shadow(0 0 6px rgba(249,115,22,0.8)) drop-shadow(0 0 12px rgba(249,115,22,0.4))'
                    : 'drop-shadow(0 0 6px rgba(103,232,249,0.8)) drop-shadow(0 0 12px rgba(103,232,249,0.4))',
                }}
              >
                <polygon
                  points="18,4 28,30 18,24 8,30"
                  fill={isSpeedBoosted ? '#f97316' : '#67e8f9'}
                  stroke={isSpeedBoosted ? '#fdba74' : '#a5f3fc'}
                  strokeWidth="1"
                />
              </svg>
            </>
          )}
        </div>
      )}

      {/* HUD: Score */}
      {status === 'PLAYING' && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30">
          <div className="text-2xl font-black tracking-[0.3em] text-white/90"
            style={{ textShadow: '0 0 20px rgba(103,232,249,0.5)' }}>
            {score.toString().padStart(6, '0')}
          </div>
        </div>
      )}

      {/* HUD: Difficulty */}
      {status === 'PLAYING' && difficultyLevel > 0 && (
        <div className="absolute top-5 left-5 z-30 text-xs font-bold text-cyan-400 bg-cyan-900/30 px-3 py-1 rounded-full border border-cyan-500/30">
          WAVE {difficultyLevel + 1}
        </div>
      )}

      {/* HUD: Active effects */}
      {status === 'PLAYING' && (isFrozen || vortexActive || isSpeedBoosted || isBuzzsawActive) && (
        <div className="absolute top-5 right-5 z-30 flex flex-col gap-1">
          {isFrozen && (
            <div className="text-xs font-bold text-green-400 bg-green-900/30 px-3 py-1 rounded-full border border-green-500/30">
              FREEZE {Math.ceil((frozenUntil - now) / 1000)}s
            </div>
          )}
          {vortexActive && vortex && (
            <div className="text-xs font-bold text-purple-400 bg-purple-900/30 px-3 py-1 rounded-full border border-purple-500/30">
              VORTEX {Math.ceil((vortex.duration - (now - vortex.startTime)) / 1000)}s
            </div>
          )}
          {isSpeedBoosted && (
            <div className="text-xs font-bold text-orange-400 bg-orange-900/30 px-3 py-1 rounded-full border border-orange-500/30">
              SPEED {Math.ceil((speedBoostUntil - now) / 1000)}s
            </div>
          )}
          {isBuzzsawActive && (
            <div className="text-xs font-bold text-pink-400 bg-pink-900/30 px-3 py-1 rounded-full border border-pink-500/30">
              BUZZSAW {Math.ceil((buzzsawUntil - now) / 1000)}s
            </div>
          )}
        </div>
      )}

      {/* READY screen */}
      {status === 'READY' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6">
          <div className="text-5xl font-black text-cyan-400 tracking-wider"
            style={{ textShadow: '0 0 30px rgba(103,232,249,0.6)' }}>
            TILT TO LIVE
          </div>
          <div className="text-white/40 text-sm tracking-widest animate-pulse">
            TILT TO MOVE
          </div>
          <div className="flex gap-4 mt-4 flex-wrap justify-center">
            {(['missile', 'freeze', 'vortex', 'speed', 'buzzsaw', 'nuke'] as PowerupType[]).map(type => (
              <div key={type} className="flex flex-col items-center gap-1">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{
                    background: POWERUP_COLORS[type],
                    boxShadow: `0 0 10px ${POWERUP_COLORS[type]}66`,
                  }}>
                  {POWERUP_LABELS[type]}
                </div>
                <div className="text-white/30 text-[10px] uppercase">{type}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GAME OVER screen */}
      {status === 'GAME_OVER' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/60">
          <div className="text-4xl font-black text-red-500 tracking-wider"
            style={{ textShadow: '0 0 30px rgba(239,68,68,0.5)' }}>
            GAME OVER
          </div>
          <div className="text-2xl font-bold text-white/80 tracking-widest">
            {score.toString().padStart(6, '0')}
          </div>
          <div className="text-white/30 text-xs tracking-widest mt-2 animate-pulse">
            TAP RESTART ON CONTROLLER
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse-fast {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.3); opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
