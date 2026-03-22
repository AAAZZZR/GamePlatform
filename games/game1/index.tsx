// games/game1/index.tsx — Rocket Shooter (R3F)
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo, MutableRefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import { NormalizedInput, GameCallbacks, GameStatus } from '@/platform/types';

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
  SPAWN_RATE: 400,
  POWERUP_SIZE: 30,
  POWERUP_SPEED: 4,
  POWERUP_CHANCE: 0.15,
  SCORE_PER_HIT: 100,
  STAR_COUNT: 80,
};

// ==========================================
// 2. Types
// ==========================================
interface Entity { id: string; x: number; y: number; width: number; height: number; active: boolean; type?: string; }
interface Particle { id: string; x: number; y: number; vx: number; vy: number; life: number; color: string; }
interface Star { id: string; x: number; y: number; size: number; speed: number; opacity: number; }
interface Player extends Entity { score: number; }

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
    player: { id: 'p1', x: 0, y: 0, width: CFG.PLAYER_SIZE, height: CFG.PLAYER_SIZE, active: true, score: 0 },
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
        const obstSpeed = CFG.INITIAL_OBSTACLE_SPEED + diffLvl * 0.6;
        const spawnRate = Math.max(150, CFG.SPAWN_RATE - diffLvl * 25);

        // Player movement
        let px = s.player.x + input.move.x;
        let py = s.player.y + input.move.y;
        const limX = halfW - CFG.PLAYER_SIZE / 2;
        const limY = halfH - CFG.PLAYER_SIZE / 2;
        px = Math.max(-limX, Math.min(limX, px));
        py = Math.max(-limY, Math.min(limY, py));

        // Bullets
        const bullets = [...s.bullets];
        if (input.actions.fire && now - lastFireTimeRef.current >= s.fireRate) {
          bullets.push({ id: uuidv4(), x: px, y: py - 30, width: CFG.BULLET_W, height: CFG.BULLET_H, active: true });
          lastFireTimeRef.current = now;
        }
        for (const b of bullets) { b.y -= CFG.BULLET_SPEED; if (b.y < -halfH - 30) b.active = false; }

        // Spawn
        spawnTimer += 16;
        const obstacles = [...s.obstacles];
        const powerUps = [...s.powerUps];
        if (spawnTimer > spawnRate) {
          spawnTimer = 0;
          const rx = Math.random() * halfW * 2 - halfW;
          if (Math.random() < CFG.POWERUP_CHANCE) {
            powerUps.push({ id: uuidv4(), x: rx, y: -halfH - 50, width: CFG.POWERUP_SIZE, height: CFG.POWERUP_SIZE, active: true, type: 'POWERUP_RATE' });
          } else {
            const sz = CFG.OBSTACLE_SIZE + (Math.random() * 20 - 10);
            obstacles.push({ id: uuidv4(), x: rx, y: -halfH - 50, width: sz, height: sz, active: true, type: 'METEOR' });
          }
        }
        for (const o of obstacles) { o.y += obstSpeed; if (o.y > halfH + 50) o.active = false; }
        for (const p of powerUps) { p.y += CFG.POWERUP_SPEED; if (p.y > halfH + 50) p.active = false; }

        // Stars
        const stars = s.stars.map(st => {
          let ny = st.y + st.speed * (1 + obstSpeed * 0.3);
          if (ny > halfH) ny = -halfH;
          return { ...st, y: ny };
        });

        // Collisions
        let scoreAdd = 0;
        let gameOver = false;
        let fireRate = s.fireRate;
        const particles = [...s.particles];
        const colors = ['#f97316', '#ef4444', '#fbbf24', '#fb923c', '#fff'];

        for (const b of bullets) {
          if (!b.active) continue;
          for (const o of obstacles) {
            if (!o.active) continue;
            if (b.x - b.width / 2 < o.x + o.width / 2 && b.x + b.width / 2 > o.x - o.width / 2 &&
                b.y - b.height / 2 < o.y + o.height / 2 && b.y + b.height / 2 > o.y - o.height / 2) {
              b.active = false;
              o.active = false;
              scoreAdd += CFG.SCORE_PER_HIT;
              for (let i = 0; i < 12; i++) {
                const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
                const spd = Math.random() * 4 + 2;
                particles.push({ id: uuidv4(), x: o.x, y: o.y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, life: 1, color: colors[Math.floor(Math.random() * colors.length)] });
              }
            }
          }
        }

        // Player vs meteor
        for (const o of obstacles) {
          if (!o.active) continue;
          const dx = Math.abs(px - o.x);
          const dy = Math.abs(py - o.y);
          if (dx < (CFG.PLAYER_SIZE + o.width) / 2 * 0.7 && dy < (CFG.PLAYER_SIZE + o.height) / 2 * 0.7) {
            gameOver = true;
          }
        }

        // Player vs powerup
        for (const p of powerUps) {
          if (!p.active) continue;
          const dx = Math.abs(px - p.x);
          const dy = Math.abs(py - p.y);
          if (dx < (CFG.PLAYER_SIZE + p.width) / 2 && dy < (CFG.PLAYER_SIZE + p.height) / 2) {
            p.active = false;
            scoreAdd += 500;
            fireRate = Math.max(CFG.MIN_FIRE_RATE, fireRate * 0.9);
          }
        }

        // Particles
        for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= 0.04; }

        setGameState({
          ...s,
          status: gameOver ? 'GAME_OVER' : 'PLAYING',
          player: { ...s.player, x: px, y: py, score: s.player.score + scoreAdd },
          bullets: bullets.filter(b => b.active),
          obstacles: obstacles.filter(o => o.active),
          powerUps: powerUps.filter(p => p.active),
          particles: particles.filter(p => p.life > 0),
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

function Meteors({ data }: { data: Entity[] }) {
  return (
    <group>
      {data.map(o => (
        <mesh key={o.id} position={[o.x, -o.y, 1]} rotation={[0, 0, o.y * 0.035]}>
          <circleGeometry args={[o.width / 2, 12]} />
          <meshBasicMaterial color="#f97316" />
        </mesh>
      ))}
    </group>
  );
}

function PowerUps({ data }: { data: Entity[] }) {
  return (
    <group>
      {data.map(p => (
        <mesh key={p.id} position={[p.x, -p.y, 1]}>
          <circleGeometry args={[p.width / 2, 12]} />
          <meshBasicMaterial color="#4ade80" />
        </mesh>
      ))}
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

      {/* Score */}
      {status === 'PLAYING' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 text-lg font-black text-white/80 tracking-widest">
          {player.score.toString().padStart(6, '0')}
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
        <Meteors data={obstacles} />
        <PowerUps data={powerUps} />
        <ExplosionParticles data={particles} />
        <PlayerShip player={player} />
      </Canvas>
    </div>
  );
}
