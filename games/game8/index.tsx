// games/game8/index.tsx — Paper Plane
'use client';

import React, { useEffect, useState, useRef, useCallback, MutableRefObject } from 'react';
import { NormalizedInput, GameCallbacks, GameStatus } from '@/platform/types';
import { sfx } from '@/platform/audio';

// ==========================================
// 1. Configuration
// ==========================================
const CFG = {
  PLANE_X_RATIO: 0.25,         // plane at 25% from left
  PLANE_W: 30,
  PLANE_H: 15,
  GRAVITY: 0.12,               // gentle gravity pull
  TILT_FORCE: 0.35,            // tilt-forward → climb (positive = up after sign flip)
  BOOST_FORCE: -0.4,           // boost pushes plane upward (negative = up on screen)
  MAX_VY: 5,
  INPUT_SCALE: 15,             // platform input.move ranges -15..+15; divide to get -1..+1
  INITIAL_SCROLL_SPEED: 2.5,
  MAX_SCROLL_SPEED: 7,
  SPEED_RAMP: 0.0008,          // per frame
  OBSTACLE_SPACING_MIN: 600,
  OBSTACLE_SPACING_MAX: 800,
  GAP_INITIAL: 400,
  GAP_MIN: 240,
  GAP_SHRINK_RATE: 0.15,       // per obstacle spawned (halved for gentler ramp)
  WALL_WIDTH: 60,
  STAR_SCORE: 50,
  STAR_SIZE: 18,
  CLOUD_COUNT: 8,
  TRAIL_LENGTH: 20,
  TRAIL_SPACING: 4,
  SCORE_PER_10PX: 1,
};

// ==========================================
// 2. Types
// ==========================================
interface Obstacle {
  id: number;
  x: number;
  gapY: number;     // center of the gap
  gapSize: number;
  passed: boolean;
}

interface Star {
  id: number;
  x: number;
  y: number;
  collected: boolean;
}

interface Cloud {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;    // parallax multiplier (0.2-0.5)
  opacity: number;
}

interface TrailDot {
  x: number;
  y: number;
  age: number;      // 0 = fresh, increments each frame
}

interface GameState {
  planeY: number;
  planeVY: number;
  scrollX: number;
  scrollSpeed: number;
  obstacles: Obstacle[];
  stars: Star[];
  clouds: Cloud[];
  trail: TrailDot[];
  score: number;
  starScore: number;
  status: GameStatus;
  obstacleCount: number;
  boosting: boolean;
}

// ==========================================
// 3. Helpers
// ==========================================
let nextId = 1;
function genId() { return nextId++; }

function createCloud(screenW: number, screenH: number, offscreen = false): Cloud {
  return {
    id: genId(),
    x: offscreen ? screenW + Math.random() * 300 : Math.random() * screenW,
    y: Math.random() * screenH * 0.7,
    w: 80 + Math.random() * 120,
    h: 30 + Math.random() * 40,
    speed: 0.2 + Math.random() * 0.3,
    opacity: 0.15 + Math.random() * 0.2,
  };
}

function createObstacle(
  x: number,
  screenH: number,
  gapSize: number
): Obstacle {
  const margin = gapSize / 2 + 30;
  const gapY = margin + Math.random() * (screenH - margin * 2);
  return { id: genId(), x, gapY, gapSize, passed: false };
}

function createStarsBetween(
  fromX: number,
  toX: number,
  screenH: number,
  obstacle: Obstacle | null
): Star[] {
  const stars: Star[] = [];
  const count = 1 + Math.floor(Math.random() * 3); // 1-3 stars
  for (let i = 0; i < count; i++) {
    const sx = fromX + (toX - fromX) * (0.2 + Math.random() * 0.6);
    let sy: number;
    if (obstacle && Math.random() < 0.6) {
      // Place near gap edges for risk/reward
      const offset = (obstacle.gapSize / 2) * (0.7 + Math.random() * 0.5);
      sy = obstacle.gapY + (Math.random() < 0.5 ? -offset : offset);
    } else {
      sy = 40 + Math.random() * (screenH - 80);
    }
    sy = Math.max(20, Math.min(screenH - 20, sy));
    stars.push({ id: genId(), x: sx, y: sy, collected: false });
  }
  return stars;
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
      planeY: h / 2,
      planeVY: 0,
      scrollX: 0,
      scrollSpeed: CFG.INITIAL_SCROLL_SPEED,
      obstacles: [],
      stars: [],
      clouds: Array.from({ length: CFG.CLOUD_COUNT }, () => createCloud(w, h)),
      trail: [],
      score: 0,
      starScore: 0,
      status: 'READY',
      obstacleCount: 0,
      boosting: false,
    };
  }, []);

  const [gameState, setGameState] = useState<GameState>(getInitialState);
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Report score
  useEffect(() => {
    callbacksRef.current.onScoreChange(gameState.score + gameState.starScore);
  }, [gameState.score, gameState.starScore]);

  // Report status
  useEffect(() => {
    callbacksRef.current.onStatusChange(gameState.status);
  }, [gameState.status]);

  // Track last obstacle spawn X
  const lastObstacleXRef = useRef(0);
  const nextSpawnDistRef = useRef(CFG.OBSTACLE_SPACING_MIN + Math.random() * (CFG.OBSTACLE_SPACING_MAX - CFG.OBSTACLE_SPACING_MIN));
  const trailCounterRef = useRef(0);
  const bobRef = useRef(0);

  // ── Game Loop ──
  useEffect(() => {
    let loopId: number;

    const loop = () => {
      const input = inputRef.current;
      const s = stateRef.current;
      const { w, h } = boundsRef.current;
      const planeX = w * CFG.PLANE_X_RATIO;

      // ── Lifecycle actions ──
      if (s.status === 'READY' && input.actions['start-game']) {
        lastObstacleXRef.current = 0;
        nextSpawnDistRef.current = CFG.OBSTACLE_SPACING_MIN + Math.random() * (CFG.OBSTACLE_SPACING_MAX - CFG.OBSTACLE_SPACING_MIN);
        trailCounterRef.current = 0;
        setGameState(prev => ({ ...prev, status: 'PLAYING' }));
      }
      if (input.actions['restart-game']) {
        nextId = 1;
        lastObstacleXRef.current = 0;
        nextSpawnDistRef.current = CFG.OBSTACLE_SPACING_MIN;
        trailCounterRef.current = 0;
        setGameState(getInitialState());
      }

      // ── READY: gentle bobbing ──
      if (s.status === 'READY') {
        bobRef.current += 0.03;
        const bobY = h / 2 + Math.sin(bobRef.current) * 8;
        // Update clouds even in READY
        const clouds = s.clouds.map(c => {
          let nx = c.x - c.speed * 0.5;
          if (nx + c.w < 0) return createCloud(w, h, true);
          return { ...c, x: nx };
        });
        setGameState(prev => ({ ...prev, planeY: bobY, clouds }));
      }

      // ── Game update ──
      if (s.status === 'PLAYING' && !paused) {
        // Normalize input: platform sends -15..+15, we need -1..+1
        const rawY = input.move.y / CFG.INPUT_SCALE;
        const moveY = Math.max(-1, Math.min(1, rawY));
        const boosting = !!input.actions['boost'];

        // Physics: positive vy = downward on screen
        let vy = s.planeVY;
        vy += CFG.GRAVITY;                         // gravity pulls plane down (+vy)
        vy += moveY * CFG.TILT_FORCE;              // tilt forward (moveY>0) → dive (+vy), consistent with G1
        if (boosting) vy += CFG.BOOST_FORCE;       // boost upward (negative vy)
        vy = Math.max(-CFG.MAX_VY, Math.min(CFG.MAX_VY, vy));

        let planeY = s.planeY + vy;
        // Soft bounce off bounds
        if (planeY < 15) { planeY = 15; vy = Math.abs(vy) * 0.3; }
        if (planeY > h - 15) { planeY = h - 15; vy = -Math.abs(vy) * 0.3; }

        // Scroll speed ramp
        const scrollSpeed = Math.min(CFG.MAX_SCROLL_SPEED, s.scrollSpeed + CFG.SPEED_RAMP);
        const scrollX = s.scrollX + scrollSpeed;

        // Trail
        trailCounterRef.current++;
        let trail = [...s.trail];
        if (trailCounterRef.current % CFG.TRAIL_SPACING === 0) {
          trail.push({ x: planeX - 15, y: planeY, age: 0 });
        }
        trail = trail
          .map(t => ({ ...t, x: t.x - scrollSpeed, age: t.age + 1 }))
          .filter(t => t.age < CFG.TRAIL_LENGTH && t.x > -10);

        // Obstacle spawn
        let obstacles = [...s.obstacles];
        let stars = [...s.stars];
        let obstacleCount = s.obstacleCount;

        const distSinceLastObstacle = scrollX - lastObstacleXRef.current;
        if (distSinceLastObstacle >= nextSpawnDistRef.current) {
          const gapSize = Math.max(
            CFG.GAP_MIN,
            CFG.GAP_INITIAL - obstacleCount * CFG.GAP_SHRINK_RATE
          );
          const obsX = w + 50; // spawn off-screen right
          const newObs = createObstacle(obsX, h, gapSize);
          obstacles.push(newObs);

          // Stars between this obstacle and the previous one
          const prevObsX = obstacles.length > 1
            ? obstacles[obstacles.length - 2].x
            : planeX;
          const newStars = createStarsBetween(
            Math.max(prevObsX + CFG.WALL_WIDTH, planeX + 50),
            obsX - CFG.WALL_WIDTH,
            h,
            newObs
          );
          stars.push(...newStars);

          lastObstacleXRef.current = scrollX;
          nextSpawnDistRef.current = CFG.OBSTACLE_SPACING_MIN +
            Math.random() * (CFG.OBSTACLE_SPACING_MAX - CFG.OBSTACLE_SPACING_MIN);
          obstacleCount++;
        }

        // Move obstacles and stars
        for (const o of obstacles) { o.x -= scrollSpeed; }
        for (const st of stars) { st.x -= scrollSpeed; }

        // Clouds parallax
        const clouds = s.clouds.map(c => {
          let nx = c.x - scrollSpeed * c.speed;
          if (nx + c.w < -50) return createCloud(w, h, true);
          return { ...c, x: nx };
        });

        // Collision detection
        let gameOver = false;
        let starScore = s.starScore;

        // Plane hitbox (centered on planeX, planeY)
        const pLeft = planeX - CFG.PLANE_W / 2;
        const pRight = planeX + CFG.PLANE_W / 2;
        const pTop = planeY - CFG.PLANE_H / 2;
        const pBottom = planeY + CFG.PLANE_H / 2;

        for (const o of obstacles) {
          const wallLeft = o.x - CFG.WALL_WIDTH / 2;
          const wallRight = o.x + CFG.WALL_WIDTH / 2;
          const gapTop = o.gapY - o.gapSize / 2;
          const gapBottom = o.gapY + o.gapSize / 2;

          // Only check if plane overlaps horizontally with wall
          if (pRight > wallLeft && pLeft < wallRight) {
            // Top wall collision
            if (pTop < gapTop) {
              gameOver = true;
              break;
            }
            // Bottom wall collision
            if (pBottom > gapBottom) {
              gameOver = true;
              break;
            }

            // Successfully passing through gap
            if (!o.passed && pLeft > wallLeft) {
              o.passed = true;
              sfx.turn();
            }
          }
        }

        // Star collection
        for (const st of stars) {
          if (st.collected) continue;
          const dx = Math.abs(planeX - st.x);
          const dy = Math.abs(planeY - st.y);
          if (dx < (CFG.PLANE_W + CFG.STAR_SIZE) / 2 && dy < (CFG.PLANE_H + CFG.STAR_SIZE) / 2) {
            st.collected = true;
            starScore += CFG.STAR_SCORE;
            sfx.coin();
          }
        }

        if (gameOver) {
          sfx.crash();
        }

        // Distance score
        const score = Math.floor(scrollX / 10) * CFG.SCORE_PER_10PX;

        // Clean up off-screen entities
        const activeObstacles = obstacles.filter(o => o.x + CFG.WALL_WIDTH / 2 > -50);
        const activeStars = stars.filter(st => !st.collected && st.x > -50);

        setGameState({
          planeY,
          planeVY: vy,
          scrollX,
          scrollSpeed,
          obstacles: activeObstacles,
          stars: activeStars,
          clouds,
          trail,
          score,
          starScore,
          status: gameOver ? 'GAME_OVER' : 'PLAYING',
          obstacleCount,
          boosting,
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
// 5. Main Component
// ==========================================
interface Props {
  inputRef: MutableRefObject<NormalizedInput>;
  paused: boolean;
  callbacks: GameCallbacks;
  [key: string]: any;
}

export default function Game8({ inputRef, paused, callbacks }: Props) {
  const gameState = useGameLogic(inputRef, paused, callbacks);
  const {
    planeY, planeVY, obstacles, stars, clouds, trail,
    score, starScore, status, scrollSpeed, boosting,
  } = gameState;

  const [dims, setDims] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const update = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const planeX = dims.w * CFG.PLANE_X_RATIO;

  // Plane pitch angle based on vertical velocity
  const pitchDeg = Math.max(-35, Math.min(35, planeVY * 6));

  const totalScore = score + starScore;

  return (
    <div
      className="relative w-full h-screen overflow-hidden select-none"
      style={{
        background: 'linear-gradient(180deg, #87CEEB 0%, #B0D4F1 40%, #A8C8E8 100%)',
      }}
    >
      {/* Paper texture overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.03,
          backgroundImage: `radial-gradient(circle, #000 1px, transparent 1px)`,
          backgroundSize: '8px 8px',
        }}
      />

      {/* Clouds (background layer) */}
      {clouds.map(c => (
        <div
          key={c.id}
          className="absolute pointer-events-none"
          style={{
            left: c.x,
            top: c.y,
            width: c.w,
            height: c.h,
            opacity: c.opacity,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.9), rgba(255,255,255,0.3))',
            filter: 'blur(2px)',
          }}
        />
      ))}

      {/* Wind streaks (subtle) */}
      {status === 'PLAYING' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="absolute"
              style={{
                top: `${15 + i * 18}%`,
                right: 0,
                width: 60 + i * 20,
                height: 1,
                background: `linear-gradient(90deg, transparent, rgba(255,255,255,${0.1 + scrollSpeed * 0.02}), transparent)`,
                animation: `windStreak ${1.5 + i * 0.3}s linear infinite`,
                animationDelay: `${i * 0.4}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Obstacles */}
      {obstacles.map(o => {
        const gapTop = o.gapY - o.gapSize / 2;
        const gapBottom = o.gapY + o.gapSize / 2;
        const wallLeft = o.x - CFG.WALL_WIDTH / 2;

        // Only render if on screen
        if (wallLeft > dims.w + 50 || wallLeft + CFG.WALL_WIDTH < -50) return null;

        return (
          <React.Fragment key={o.id}>
            {/* Top wall */}
            <div
              className="absolute"
              style={{
                left: wallLeft,
                top: 0,
                width: CFG.WALL_WIDTH,
                height: Math.max(0, gapTop),
                background: 'linear-gradient(90deg, #8B6914, #A0782C, #8B6914)',
                borderBottom: '3px solid #6B4F10',
                boxShadow: '2px 0 8px rgba(0,0,0,0.2)',
              }}
            >
              {/* Torn edge effect */}
              <div
                className="absolute bottom-0 left-0 right-0"
                style={{
                  height: 6,
                  background: 'linear-gradient(90deg, #8B6914, #A0782C, #8B6914)',
                  clipPath: 'polygon(0% 0%, 5% 100%, 10% 20%, 15% 80%, 20% 0%, 25% 100%, 30% 30%, 35% 90%, 40% 0%, 45% 70%, 50% 10%, 55% 100%, 60% 0%, 65% 80%, 70% 20%, 75% 100%, 80% 0%, 85% 60%, 90% 10%, 95% 100%, 100% 0%)',
                }}
              />
              {/* Cardboard lines */}
              <div className="absolute inset-0 opacity-20" style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 12px, rgba(0,0,0,0.15) 12px, rgba(0,0,0,0.15) 13px)',
              }} />
            </div>
            {/* Bottom wall */}
            <div
              className="absolute"
              style={{
                left: wallLeft,
                top: gapBottom,
                width: CFG.WALL_WIDTH,
                height: Math.max(0, dims.h - gapBottom),
                background: 'linear-gradient(90deg, #8B6914, #A0782C, #8B6914)',
                borderTop: '3px solid #6B4F10',
                boxShadow: '2px 0 8px rgba(0,0,0,0.2)',
              }}
            >
              {/* Torn edge effect */}
              <div
                className="absolute top-0 left-0 right-0"
                style={{
                  height: 6,
                  background: 'linear-gradient(90deg, #8B6914, #A0782C, #8B6914)',
                  clipPath: 'polygon(0% 100%, 5% 0%, 10% 80%, 15% 20%, 20% 100%, 25% 0%, 30% 70%, 35% 10%, 40% 100%, 45% 30%, 50% 90%, 55% 0%, 60% 100%, 65% 20%, 70% 80%, 75% 0%, 80% 100%, 85% 40%, 90% 90%, 95% 0%, 100% 100%)',
                }}
              />
              <div className="absolute inset-0 opacity-20" style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 12px, rgba(0,0,0,0.15) 12px, rgba(0,0,0,0.15) 13px)',
              }} />
            </div>
          </React.Fragment>
        );
      })}

      {/* Stars */}
      {stars.map(st => {
        if (st.collected || st.x < -30 || st.x > dims.w + 30) return null;
        return (
          <div
            key={st.id}
            className="absolute pointer-events-none"
            style={{
              left: st.x - CFG.STAR_SIZE / 2,
              top: st.y - CFG.STAR_SIZE / 2,
              width: CFG.STAR_SIZE,
              height: CFG.STAR_SIZE,
              animation: 'starSpin 2s linear infinite',
            }}
          >
            {/* Star shape */}
            <div
              className="w-full h-full flex items-center justify-center text-yellow-400 font-bold"
              style={{
                fontSize: CFG.STAR_SIZE,
                textShadow: '0 0 8px rgba(255,215,0,0.8), 0 0 16px rgba(255,215,0,0.4)',
                lineHeight: 1,
              }}
            >
              *
            </div>
          </div>
        );
      })}

      {/* Trail */}
      {trail.map((t, i) => (
        <div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: t.x - 2,
            top: t.y - 2,
            width: 4,
            height: 4,
            backgroundColor: 'rgba(255, 255, 255, 0.6)',
            opacity: Math.max(0, 1 - t.age / CFG.TRAIL_LENGTH),
          }}
        />
      ))}

      {/* Paper Plane */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: planeX - 20,
          top: planeY - 12,
          width: 40,
          height: 24,
          transform: `rotate(${pitchDeg}deg)`,
          transition: 'transform 0.05s linear',
          filter: boosting ? 'drop-shadow(0 0 6px rgba(135,206,235,0.8))' : 'drop-shadow(1px 2px 3px rgba(0,0,0,0.2))',
        }}
      >
        {/* Plane body - paper dart shape */}
        <svg viewBox="0 0 40 24" width="40" height="24">
          {/* Main body */}
          <polygon
            points="0,12 38,2 38,12"
            fill="#F5F0E8"
            stroke="#D4C9B8"
            strokeWidth="0.5"
          />
          {/* Bottom wing */}
          <polygon
            points="0,12 38,12 38,22"
            fill="#EAE4D8"
            stroke="#D4C9B8"
            strokeWidth="0.5"
          />
          {/* Center fold line */}
          <line x1="4" y1="12" x2="38" y2="12" stroke="#C8BDA8" strokeWidth="0.8" />
          {/* Top fold line */}
          <line x1="8" y1="8" x2="38" y2="6" stroke="#D4C9B8" strokeWidth="0.4" opacity="0.5" />
          {/* Bottom fold line */}
          <line x1="8" y1="16" x2="38" y2="18" stroke="#D4C9B8" strokeWidth="0.4" opacity="0.5" />
          {/* Nose tip highlight */}
          <polygon
            points="36,2 40,12 36,22 38,12"
            fill="#FAFAF5"
            opacity="0.6"
          />
        </svg>
      </div>

      {/* HUD - Score */}
      {status === 'PLAYING' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
          <div
            className="text-xl font-black tracking-widest px-4 py-1 rounded-full"
            style={{
              color: '#4A6FA5',
              backgroundColor: 'rgba(255,255,255,0.5)',
              backdropFilter: 'blur(4px)',
              textShadow: '0 1px 2px rgba(255,255,255,0.5)',
            }}
          >
            {totalScore.toString().padStart(6, '0')}
          </div>
          {starScore > 0 && (
            <div className="text-xs mt-1" style={{ color: '#B8860B' }}>
              +{starScore} stars
            </div>
          )}
        </div>
      )}

      {/* READY screen */}
      {status === 'READY' && (
        <div className="absolute inset-0 flex items-center justify-center z-30">
          <div className="flex flex-col items-center gap-4">
            <div
              className="text-4xl font-black tracking-wider"
              style={{
                color: '#4A6FA5',
                textShadow: '0 2px 4px rgba(255,255,255,0.5)',
              }}
            >
              PAPER PLANE
            </div>
            <div
              className="text-lg font-bold animate-pulse"
              style={{ color: '#6B8FC4' }}
            >
              TILT TO FLY
            </div>
            <div className="text-sm mt-2" style={{ color: '#8BA8CC' }}>
              dodge obstacles &bull; collect stars
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER screen */}
      {status === 'GAME_OVER' && (
        <div className="absolute inset-0 flex items-center justify-center z-30"
          style={{ backgroundColor: 'rgba(135,180,220,0.3)', backdropFilter: 'blur(2px)' }}
        >
          <div className="flex flex-col items-center gap-3">
            {/* Crumpled plane icon */}
            <div
              className="text-5xl mb-2"
              style={{
                transform: 'rotate(45deg)',
                opacity: 0.6,
                filter: 'grayscale(0.5)',
              }}
            >
              <svg viewBox="0 0 40 24" width="60" height="36">
                <polygon points="0,12 38,2 38,12" fill="#D4C9B8" stroke="#B0A898" strokeWidth="1" />
                <polygon points="0,12 38,12 38,22" fill="#C8BDA8" stroke="#B0A898" strokeWidth="1" />
                {/* Crumple lines */}
                <line x1="10" y1="5" x2="15" y2="15" stroke="#A09888" strokeWidth="0.8" />
                <line x1="20" y1="3" x2="22" y2="20" stroke="#A09888" strokeWidth="0.6" />
                <line x1="28" y1="6" x2="30" y2="18" stroke="#A09888" strokeWidth="0.7" />
              </svg>
            </div>
            <div
              className="text-3xl font-black tracking-wider"
              style={{ color: '#4A6FA5' }}
            >
              CRASHED!
            </div>
            <div
              className="text-xl font-bold mt-1"
              style={{ color: '#6B8FC4' }}
            >
              Score: {totalScore}
            </div>
            <div className="text-sm" style={{ color: '#8BA8CC' }}>
              Distance: {score} &bull; Stars: {starScore}
            </div>
            <div
              className="text-sm mt-4 animate-pulse font-bold"
              style={{ color: '#6B8FC4' }}
            >
              TAP RESTART ON CONTROLLER
            </div>
          </div>
        </div>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes starSpin {
          0% { transform: rotate(0deg) scale(1); }
          25% { transform: rotate(90deg) scale(1.1); }
          50% { transform: rotate(180deg) scale(1); }
          75% { transform: rotate(270deg) scale(1.1); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes windStreak {
          0% { transform: translateX(100vw); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateX(-200px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
