// games/game1/index.tsx — Rocket Shooter (R3F)
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo, MutableRefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import { NormalizedInput, GameCallbacks, GameStatus } from '@/platform/types';
import { sfx } from '@/platform/audio';

// ==========================================
// 1. Configuration
// ==========================================
const CFG = {
  PLAYER_SIZE: 50,
  BULLET_W: 6,
  BULLET_H: 22,
  BULLET_SPEED: 20,
  INITIAL_FIRE_RATE: 700,
  MIN_FIRE_RATE: 120,
  OBSTACLE_SIZE: 42,
  INITIAL_OBSTACLE_SPEED: 1.2,
  // Spawn rate: start much slower, ramp gentler
  SPAWN_RATE_INITIAL: 1200,   // first spawn every 1.2s (very gentle)
  SPAWN_RATE_MIN: 280,        // floor: never faster than 280ms
  SPAWN_RAMP_PER_LEVEL: 60,   // decrease per difficulty level
  // Grace period: first N seconds very easy
  GRACE_PERIOD: 10,            // seconds of gentle play
  GRACE_SPAWN_RATE: 1800,      // during grace: spawn every 1.8s
  POWERUP_SIZE: 30,
  POWERUP_SPEED: 4,
  POWERUP_CHANCE: 0.18,
  SCORE_PER_HIT: 100,
  STAR_COUNT: 80,
};

// Obstacle type definitions
type ObstacleType = 'METEOR' | 'FAST_SMALL' | 'LARGE_SLOW' | 'ZIGZAG';
type PowerUpType = 'POWERUP_RATE' | 'POWERUP_SHIELD' | 'POWERUP_MULTI' | 'POWERUP_RAPID';

interface ObstacleConfig {
  size: number;
  speed: number;
  score: number;
  color: string;
  hp: number;
}

const OBSTACLE_CONFIGS: Record<ObstacleType, ObstacleConfig> = {
  METEOR:     { size: 42, speed: 1.0,  score: 100, color: '#f97316', hp: 1 },
  FAST_SMALL: { size: 22, speed: 2.8,  score: 200, color: '#f43f5e', hp: 1 },
  LARGE_SLOW: { size: 70, speed: 0.6,  score: 150, color: '#a855f7', hp: 2 },
  ZIGZAG:     { size: 34, speed: 1.4,  score: 250, color: '#06b6d4', hp: 1 },
};

// Spawn weight tables by difficulty level (index = level, values = [METEOR, FAST_SMALL, LARGE_SLOW, ZIGZAG])
const SPAWN_WEIGHTS: number[][] = [
  [100, 0,  0,  0],   // level 0 (0-10s grace): only regular meteors
  [70, 15, 10,  5],   // level 1 (10-20s): mostly meteors, few others
  [50, 20, 15, 15],   // level 2 (20-30s): more variety
  [35, 25, 20, 20],   // level 3 (30-40s): balanced
  [25, 30, 20, 25],   // level 4+: lots of variety
];

function pickObstacleType(diffLvl: number): ObstacleType {
  const idx = Math.min(diffLvl, SPAWN_WEIGHTS.length - 1);
  const weights = SPAWN_WEIGHTS[idx];
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  const types: ObstacleType[] = ['METEOR', 'FAST_SMALL', 'LARGE_SLOW', 'ZIGZAG'];
  for (let i = 0; i < types.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return types[i];
  }
  return 'METEOR';
}

function pickPowerUpType(diffLvl: number): PowerUpType {
  if (diffLvl < 1) return 'POWERUP_RATE';
  const types: PowerUpType[] = ['POWERUP_RATE', 'POWERUP_SHIELD', 'POWERUP_MULTI', 'POWERUP_RAPID'];
  return types[Math.floor(Math.random() * types.length)];
}

// ==========================================
// 2. Types
// ==========================================
interface Entity {
  id: string; x: number; y: number; width: number; height: number;
  active: boolean; type?: string;
  hp?: number;          // hit points for multi-hit obstacles
  spawnX?: number;      // original x for zigzag
  spawnTime?: number;   // spawn timestamp for zigzag wave
}
interface Particle { id: string; x: number; y: number; vx: number; vy: number; life: number; color: string; }
interface Star { id: string; x: number; y: number; size: number; speed: number; opacity: number; }
interface Player extends Entity {
  score: number;
  shieldTimer: number;     // remaining shield ms
  scoreMultiplier: number; // score multiplier
  multiTimer: number;      // remaining multiplier ms
}

interface GameState {
  player: Player;
  bullets: Entity[];
  obstacles: Entity[];
  powerUps: Entity[];
  particles: Particle[];
  stars: Star[];
  status: GameStatus;
  fireRate: number;
  startTime: number;
}

// ==========================================
// 3. Game Logic Hook (platform inputRef)
// ==========================================
function useGameLogic(
  inputRef: MutableRefObject<NormalizedInput>,
  paused: boolean,
  callbacks: GameCallbacks
) {
  const boundsRef = useRef({ halfW: 400, halfH: 300 });

  useEffect(() => {
    const update = () => {
      boundsRef.current = { halfW: window.innerWidth / 2, halfH: window.innerHeight / 2 };
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const createStars = useCallback((): Star[] => {
    const { halfW, halfH } = boundsRef.current;
    return Array.from({ length: CFG.STAR_COUNT }, () => ({
      id: uuidv4(),
      x: Math.random() * halfW * 2 - halfW,
      y: Math.random() * halfH * 2 - halfH,
      size: Math.random() * 2.5 + 0.5,
      speed: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.7 + 0.3,
    }));
  }, []);

  const getInitialState = useCallback((): GameState => ({
    player: {
      id: 'p1', x: 0, y: 0, width: CFG.PLAYER_SIZE, height: CFG.PLAYER_SIZE,
      active: true, score: 0,
      shieldTimer: 0, scoreMultiplier: 1, multiTimer: 0,
    },
    bullets: [],
    obstacles: [],
    powerUps: [],
    particles: [],
    stars: createStars(),
    status: 'READY',
    fireRate: CFG.INITIAL_FIRE_RATE,
    startTime: 0,
  }), [createStars]);

  const [gameState, setGameState] = useState<GameState>(getInitialState);
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  const lastFireTimeRef = useRef(0);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // 回報分數 / 狀態
  useEffect(() => { callbacksRef.current.onScoreChange(gameState.player.score); }, [gameState.player.score]);
  useEffect(() => { callbacksRef.current.onStatusChange(gameState.status); }, [gameState.status]);

  // ── Game Loop ──
  useEffect(() => {
    let loopId: number;
    let spawnTimer = 0;

    const loop = () => {
      const input = inputRef.current;
      const s = stateRef.current;
      const { halfW, halfH } = boundsRef.current;

      // ── Lifecycle actions (always check, even when paused) ──
      if (s.status === 'READY' && input.actions['start-game']) {
        setGameState(prev => ({ ...prev, status: 'PLAYING', startTime: Date.now(), fireRate: CFG.INITIAL_FIRE_RATE }));
        lastFireTimeRef.current = 0;
      }
      if (input.actions['restart-game']) {
        setGameState(getInitialState());
        spawnTimer = 0;
      }
      if (input.actions.pause && s.status === 'PLAYING') {
        callbacksRef.current.onStatusChange('PAUSED');
      }
      if (input.actions.resume) {
        callbacksRef.current.onStatusChange('PLAYING');
      }

      // ── Game update (only when playing & not externally paused) ──
      if (s.status === 'PLAYING' && !paused) {
        const now = Date.now();
        const gameTime = (now - s.startTime) / 1000;
        const diffLvl = Math.floor(gameTime / 10);
        const inGrace = gameTime < CFG.GRACE_PERIOD;

        // Smooth ramp factor: 0 at end of grace, 1 after 50 more seconds
        // Timeline: 10s grace -> 50s ramp -> full difficulty at 60s
        // Spawn rates: ~1200ms@10s -> ~800ms@20s -> ~500ms@40s -> ~280ms@60s
        const RAMP_DURATION = 50; // seconds after grace to reach full difficulty
        const postGraceTime = Math.max(0, gameTime - CFG.GRACE_PERIOD);
        const rampFactor = Math.min(1, postGraceTime / RAMP_DURATION);

        // Difficulty-based speed multiplier (smooth ramp, not step function)
        // During grace: 1.0, then smoothly ramps to max (~2.4) over RAMP_DURATION
        const maxSpeedMul = 2.4;
        const speedMul = inGrace ? 1.0 : 1.0 + (maxSpeedMul - 1.0) * rampFactor;

        // Spawn rate: grace period is very slow, then smoothly ramps down
        // lerp from SPAWN_RATE_INITIAL (1200ms) to SPAWN_RATE_MIN (280ms)
        const spawnRate = inGrace
          ? CFG.GRACE_SPAWN_RATE
          : CFG.SPAWN_RATE_INITIAL - (CFG.SPAWN_RATE_INITIAL - CFG.SPAWN_RATE_MIN) * rampFactor;

        // Player movement
        let px = s.player.x + input.move.x;
        let py = s.player.y + input.move.y;
        const limX = halfW - CFG.PLAYER_SIZE / 2;
        const limY = halfH - CFG.PLAYER_SIZE / 2;
        px = Math.max(-limX, Math.min(limX, px));
        py = Math.max(-limY, Math.min(limY, py));

        // Decrement power-up timers (~16ms per frame)
        let shieldTimer = Math.max(0, s.player.shieldTimer - 16);
        let scoreMultiplier = s.player.scoreMultiplier;
        let multiTimer = Math.max(0, s.player.multiTimer - 16);
        if (multiTimer <= 0) scoreMultiplier = 1;

        // Bullets
        const bullets = [...s.bullets];
        if (input.actions.fire && now - lastFireTimeRef.current >= s.fireRate) {
          bullets.push({ id: uuidv4(), x: px, y: py - 30, width: CFG.BULLET_W, height: CFG.BULLET_H, active: true });
          lastFireTimeRef.current = now;
          sfx.shoot();
        }
        for (const b of bullets) { b.y -= CFG.BULLET_SPEED; if (b.y < -halfH - 30) b.active = false; }

        // Spawn obstacles & power-ups
        spawnTimer += 16;
        const obstacles = [...s.obstacles];
        const powerUps = [...s.powerUps];
        if (spawnTimer > spawnRate) {
          spawnTimer = 0;
          const rx = Math.random() * (halfW * 1.6) - halfW * 0.8; // spawn in 80% of width to avoid edge clipping

          if (Math.random() < CFG.POWERUP_CHANCE && !inGrace) {
            const puType = pickPowerUpType(diffLvl);
            powerUps.push({
              id: uuidv4(), x: rx, y: -halfH - 50,
              width: CFG.POWERUP_SIZE, height: CFG.POWERUP_SIZE,
              active: true, type: puType,
            });
          } else {
            const obstType = inGrace ? 'METEOR' as ObstacleType : pickObstacleType(diffLvl);
            const cfg = OBSTACLE_CONFIGS[obstType];
            const sizeJitter = cfg.size + (Math.random() * 10 - 5);
            obstacles.push({
              id: uuidv4(), x: rx, y: -halfH - 50,
              width: sizeJitter, height: sizeJitter,
              active: true, type: obstType,
              hp: cfg.hp,
              spawnX: rx,
              spawnTime: now,
            });
          }
        }

        // Move obstacles based on their type
        for (const o of obstacles) {
          const obstType = (o.type || 'METEOR') as ObstacleType;
          const cfg = OBSTACLE_CONFIGS[obstType];
          const baseSpeed = cfg.speed * speedMul;

          o.y += baseSpeed;

          // Zigzag: sine wave horizontal movement
          if (obstType === 'ZIGZAG' && o.spawnTime && o.spawnX !== undefined) {
            const elapsed = (now - o.spawnTime) / 1000;
            o.x = o.spawnX + Math.sin(elapsed * 4) * 60;
          }

          if (o.y > halfH + 50) o.active = false;
        }
        for (const p of powerUps) { p.y += CFG.POWERUP_SPEED; if (p.y > halfH + 50) p.active = false; }

        // Stars
        const stars = s.stars.map(st => {
          let ny = st.y + st.speed * (1 + speedMul * 0.2);
          if (ny > halfH) ny = -halfH;
          return { ...st, y: ny };
        });

        // Collisions: bullet vs obstacle
        let scoreAdd = 0;
        let gameOver = false;
        let fireRate = s.fireRate;
        const particles = [...s.particles];

        for (const b of bullets) {
          if (!b.active) continue;
          for (const o of obstacles) {
            if (!o.active) continue;
            if (b.x - b.width / 2 < o.x + o.width / 2 && b.x + b.width / 2 > o.x - o.width / 2 &&
                b.y - b.height / 2 < o.y + o.height / 2 && b.y + b.height / 2 > o.y - o.height / 2) {
              b.active = false;
              const obstType = (o.type || 'METEOR') as ObstacleType;
              const cfg = OBSTACLE_CONFIGS[obstType];
              const hp = (o.hp ?? 1) - 1;
              if (hp <= 0) {
                o.active = false;
                scoreAdd += Math.round(cfg.score * scoreMultiplier);
                sfx.explosion();
                // Explosion particles with obstacle-specific colors
                const baseColor = cfg.color;
                const pColors = [baseColor, '#fff', '#fbbf24', '#fb923c'];
                for (let i = 0; i < 12; i++) {
                  const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
                  const spd = Math.random() * 4 + 2;
                  particles.push({
                    id: uuidv4(), x: o.x, y: o.y,
                    vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
                    life: 1, color: pColors[Math.floor(Math.random() * pColors.length)],
                  });
                }
              } else {
                o.hp = hp;
                // Partial hit sparks
                for (let i = 0; i < 4; i++) {
                  const angle = Math.random() * Math.PI * 2;
                  particles.push({
                    id: uuidv4(), x: b.x, y: b.y,
                    vx: Math.cos(angle) * 2, vy: Math.sin(angle) * 2,
                    life: 0.6, color: '#fbbf24',
                  });
                }
              }
            }
          }
        }

        // Player vs obstacle
        for (const o of obstacles) {
          if (!o.active) continue;
          const dx = Math.abs(px - o.x);
          const dy = Math.abs(py - o.y);
          if (dx < (CFG.PLAYER_SIZE + o.width) / 2 * 0.7 && dy < (CFG.PLAYER_SIZE + o.height) / 2 * 0.7) {
            if (shieldTimer > 0) {
              // Shield absorbs the hit
              o.active = false;
              shieldTimer = 0;
              sfx.explosion();
              for (let i = 0; i < 8; i++) {
                const angle = (Math.PI * 2 * i) / 8;
                particles.push({
                  id: uuidv4(), x: px, y: py,
                  vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3,
                  life: 0.8, color: '#22d3ee',
                });
              }
            } else {
              gameOver = true;
            }
          }
        }

        // Player vs powerup
        for (const p of powerUps) {
          if (!p.active) continue;
          const dx = Math.abs(px - p.x);
          const dy = Math.abs(py - p.y);
          if (dx < (CFG.PLAYER_SIZE + p.width) / 2 && dy < (CFG.PLAYER_SIZE + p.height) / 2) {
            p.active = false;
            sfx.powerup();
            switch (p.type) {
              case 'POWERUP_RATE':
                scoreAdd += 500;
                fireRate = Math.max(CFG.MIN_FIRE_RATE, fireRate * 0.85);
                break;
              case 'POWERUP_SHIELD':
                shieldTimer = 8000; // 8 seconds of shield
                break;
              case 'POWERUP_MULTI':
                scoreMultiplier = 3;
                multiTimer = 10000; // 10s of 3x score
                scoreAdd += 200;
                break;
              case 'POWERUP_RAPID':
                fireRate = CFG.MIN_FIRE_RATE; // instant max fire rate
                scoreAdd += 300;
                break;
            }
          }
        }

        // Particles
        for (const pt of particles) { pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.1; pt.life -= 0.04; }

        setGameState({
          ...s,
          status: gameOver ? 'GAME_OVER' : 'PLAYING',
          player: {
            ...s.player, x: px, y: py,
            score: s.player.score + scoreAdd,
            shieldTimer, scoreMultiplier, multiTimer,
          },
          bullets: bullets.filter(b => b.active),
          obstacles: obstacles.filter(o => o.active),
          powerUps: powerUps.filter(p => p.active),
          particles: particles.filter(pt => pt.life > 0),
          stars,
          fireRate,
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
// 4. R3F Rendering Components
// ==========================================

// ── Ship shape (三角形飛船) ──
const shipShape = (() => {
  const s = new THREE.Shape();
  const sz = CFG.PLAYER_SIZE;
  s.moveTo(0, sz * 0.5);
  s.lineTo(-sz * 0.35, -sz * 0.5);
  s.lineTo(0, -sz * 0.2);
  s.lineTo(sz * 0.35, -sz * 0.5);
  s.closePath();
  return s;
})();

function PlayerShip({ player }: { player: Player }) {
  const hasShield = player.shieldTimer > 0;
  const shieldFlicker = hasShield && player.shieldTimer < 2000
    ? Math.sin(Date.now() * 0.02) * 0.3 + 0.3
    : 0.35;
  return (
    <group position={[player.x, -player.y, 2]}>
      {/* Engine glow */}
      <mesh position={[0, -CFG.PLAYER_SIZE * 0.45, -0.1]}>
        <circleGeometry args={[8, 8]} />
        <meshBasicMaterial color="#f97316" transparent opacity={0.6} />
      </mesh>
      {/* Ship body */}
      <mesh>
        <shapeGeometry args={[shipShape]} />
        <meshBasicMaterial color="#67e8f9" />
      </mesh>
      {/* Shield bubble */}
      {hasShield && (
        <mesh position={[0, 0, 0.5]}>
          <ringGeometry args={[CFG.PLAYER_SIZE * 0.45, CFG.PLAYER_SIZE * 0.55, 20]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={shieldFlicker} />
        </mesh>
      )}
    </group>
  );
}

function StarField({ data }: { data: Star[] }) {
  return (
    <group>
      {data.map(s => (
        <mesh key={s.id} position={[s.x, -s.y, -1]}>
          <circleGeometry args={[s.size, 6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={s.opacity} />
        </mesh>
      ))}
    </group>
  );
}

function Bullets({ data }: { data: Entity[] }) {
  return (
    <group>
      {data.map(b => (
        <mesh key={b.id} position={[b.x, -b.y, 1]}>
          <planeGeometry args={[b.width, b.height]} />
          <meshBasicMaterial color="#fde047" />
        </mesh>
      ))}
    </group>
  );
}

function Obstacles({ data }: { data: Entity[] }) {
  return (
    <group>
      {data.map(o => {
        const obstType = (o.type || 'METEOR') as ObstacleType;
        const cfg = OBSTACLE_CONFIGS[obstType];
        const r = o.width / 2;

        // Different shapes per type
        switch (obstType) {
          case 'FAST_SMALL':
            // Diamond shape, red-pink, fast spin
            return (
              <mesh key={o.id} position={[o.x, -o.y, 1]} rotation={[0, 0, o.y * 0.08]}>
                <circleGeometry args={[r, 4]} />
                <meshBasicMaterial color={cfg.color} />
              </mesh>
            );
          case 'LARGE_SLOW':
            // Large hexagon, purple, with inner ring showing HP
            return (
              <group key={o.id} position={[o.x, -o.y, 1]} rotation={[0, 0, o.y * 0.015]}>
                <mesh>
                  <circleGeometry args={[r, 6]} />
                  <meshBasicMaterial color={cfg.color} />
                </mesh>
                {/* Inner ring indicates remaining HP */}
                {(o.hp ?? 0) > 1 && (
                  <mesh position={[0, 0, 0.1]}>
                    <ringGeometry args={[r * 0.3, r * 0.5, 6]} />
                    <meshBasicMaterial color="#e9d5ff" transparent opacity={0.7} />
                  </mesh>
                )}
              </group>
            );
          case 'ZIGZAG':
            // Triangle shape, cyan, wobbles
            return (
              <mesh key={o.id} position={[o.x, -o.y, 1]} rotation={[0, 0, o.y * 0.06]}>
                <circleGeometry args={[r, 3]} />
                <meshBasicMaterial color={cfg.color} />
              </mesh>
            );
          default:
            // Regular meteor: circle, orange
            return (
              <mesh key={o.id} position={[o.x, -o.y, 1]} rotation={[0, 0, o.y * 0.035]}>
                <circleGeometry args={[r, 12]} />
                <meshBasicMaterial color={cfg.color} />
              </mesh>
            );
        }
      })}
    </group>
  );
}

const POWERUP_COLORS: Record<string, string> = {
  POWERUP_RATE:   '#4ade80',  // green — fire rate
  POWERUP_SHIELD: '#22d3ee',  // cyan — shield
  POWERUP_MULTI:  '#facc15',  // gold — score multiplier
  POWERUP_RAPID:  '#f472b6',  // pink — rapid fire
};

function PowerUps({ data }: { data: Entity[] }) {
  return (
    <group>
      {data.map(p => {
        const color = POWERUP_COLORS[p.type || 'POWERUP_RATE'] || '#4ade80';
        const r = p.width / 2;
        // Pulsing effect via y position
        const pulse = 1 + Math.sin(p.y * 0.05) * 0.15;
        return (
          <group key={p.id} position={[p.x, -p.y, 1]}>
            {/* Glow ring */}
            <mesh>
              <ringGeometry args={[r * 0.9 * pulse, r * 1.2 * pulse, 12]} />
              <meshBasicMaterial color={color} transparent opacity={0.3} />
            </mesh>
            {/* Core */}
            <mesh>
              <circleGeometry args={[r * 0.7, 12]} />
              <meshBasicMaterial color={color} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function ExplosionParticles({ data }: { data: Particle[] }) {
  return (
    <group>
      {data.map(p => (
        <mesh key={p.id} position={[p.x, -p.y, 1.5]}>
          <circleGeometry args={[3, 6]} />
          <meshBasicMaterial color={p.color} transparent opacity={Math.max(0, p.life)} />
        </mesh>
      ))}
    </group>
  );
}

// ==========================================
// 5. Main Component
// ==========================================
interface Props {
  inputRef: MutableRefObject<NormalizedInput>;
  paused: boolean;
  callbacks: GameCallbacks;
  // legacy props (ignored)
  [key: string]: any;
}

export default function Game1({ inputRef, paused, callbacks }: Props) {
  const gameState = useGameLogic(inputRef, paused, callbacks);
  const { player, bullets, obstacles, powerUps, particles, stars, status, startTime } = gameState;

  const gameTime = status === 'PLAYING' ? (Date.now() - startTime) / 1000 : 0;
  const difficultyLevel = Math.floor(gameTime / 10);

  return (
    <div
      className="relative w-full h-screen overflow-hidden font-mono select-none"
      style={{ background: 'linear-gradient(180deg, #050815 0%, #0f0f2e 50%, #1a0a2e 100%)' }}
    >
      {/* Difficulty indicator */}
      {status === 'PLAYING' && difficultyLevel > 0 && (
        <div className="absolute top-4 left-4 z-20 text-xs font-bold text-purple-400 bg-purple-900/40 px-3 py-1 rounded-full border border-purple-500/30">
          LVL {difficultyLevel + 1}
        </div>
      )}

      {/* Score (gold when multiplier active) */}
      {status === 'PLAYING' && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-20 text-lg font-black tracking-widest"
          style={{ color: player.scoreMultiplier > 1 ? '#facc15' : 'rgba(255,255,255,0.8)' }}
        >
          {player.score.toString().padStart(6, '0')}
          {player.scoreMultiplier > 1 && (
            <span className="ml-2 text-sm">x{player.scoreMultiplier}</span>
          )}
        </div>
      )}

      {/* Active power-up indicators */}
      {status === 'PLAYING' && (player.shieldTimer > 0 || player.multiTimer > 0) && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {player.shieldTimer > 0 && (
            <div className="text-xs font-bold text-cyan-300 bg-cyan-900/40 px-2 py-0.5 rounded-full border border-cyan-500/30">
              SHIELD {Math.ceil(player.shieldTimer / 1000)}s
            </div>
          )}
          {player.multiTimer > 0 && (
            <div className="text-xs font-bold text-yellow-300 bg-yellow-900/40 px-2 py-0.5 rounded-full border border-yellow-500/30">
              x{player.scoreMultiplier} {Math.ceil(player.multiTimer / 1000)}s
            </div>
          )}
        </div>
      )}

      {/* R3F Canvas */}
      <Canvas
        orthographic
        camera={{ position: [0, 0, 100], near: 0.1, far: 1000, zoom: 1 }}
        style={{ position: 'absolute', inset: 0 }}
        gl={{ antialias: false, alpha: true }}
      >
        <StarField data={stars} />
        <Bullets data={bullets} />
        <Obstacles data={obstacles} />
        <PowerUps data={powerUps} />
        <ExplosionParticles data={particles} />
        <PlayerShip player={player} />
      </Canvas>
    </div>
  );
}
