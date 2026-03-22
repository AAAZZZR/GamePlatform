// games/game6/index.tsx — Labyrinth (HTML/CSS)
'use client';

import React, { useEffect, useState, useRef, useCallback, MutableRefObject } from 'react';
import { NormalizedInput, GameCallbacks, GameStatus } from '@/platform/types';
import { sfx } from '@/platform/audio';

// ==========================================
// 1. Configuration
// ==========================================
const CFG = {
  BOARD_W: 700,
  BOARD_H: 500,
  BALL_R: 10,
  GRAVITY: 0.5,
  FRICTION: 0.97,
  MAX_VELOCITY: 8,
  BOUNCE_DAMPING: 0.6,
  WALL_THICKNESS: 8,
  HOLE_FALL_DURATION: 400,
  GOAL_R: 14,
  HOLE_R: 13,
};

// ==========================================
// 2. Types
// ==========================================
interface Wall { x: number; y: number; w: number; h: number }
interface Hole { x: number; y: number; r: number }
interface Point { x: number; y: number }

interface MazeLevel {
  walls: Wall[];
  holes: Hole[];
  start: Point;
  goal: Point;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

type LevelStatus = 'READY' | 'PLAYING' | 'FALLING' | 'LEVEL_COMPLETE' | 'GAME_OVER' | 'VICTORY';

interface GameState {
  ball: Ball;
  level: number;
  levelStatus: LevelStatus;
  platformStatus: GameStatus;
  startTime: number;
  elapsedTime: number;
  score: number;
  fallingHole: Hole | null;
  fallProgress: number;
  celebrateTimer: number;
}

// ==========================================
// 3. Level Data
// ==========================================
const LEVELS: MazeLevel[] = [
  // Level 1: Simple intro
  {
    start: { x: 60, y: 60 },
    goal: { x: 630, y: 430 },
    walls: [
      // Outer frame
      { x: 0, y: 0, w: CFG.BOARD_W, h: CFG.WALL_THICKNESS },
      { x: 0, y: CFG.BOARD_H - CFG.WALL_THICKNESS, w: CFG.BOARD_W, h: CFG.WALL_THICKNESS },
      { x: 0, y: 0, w: CFG.WALL_THICKNESS, h: CFG.BOARD_H },
      { x: CFG.BOARD_W - CFG.WALL_THICKNESS, y: 0, w: CFG.WALL_THICKNESS, h: CFG.BOARD_H },
      // Internal walls
      { x: 150, y: 0, w: CFG.WALL_THICKNESS, h: 200 },
      { x: 150, y: 300, w: CFG.WALL_THICKNESS, h: 200 },
      { x: 300, y: 100, w: CFG.WALL_THICKNESS, h: 300 },
      { x: 450, y: 0, w: CFG.WALL_THICKNESS, h: 250 },
      { x: 450, y: 350, w: CFG.WALL_THICKNESS, h: 150 },
      { x: 300, y: 100, w: 150, h: CFG.WALL_THICKNESS },
      { x: 450, y: 350, w: 150, h: CFG.WALL_THICKNESS },
    ],
    holes: [
      { x: 225, y: 250, r: CFG.HOLE_R },
      { x: 530, y: 150, r: CFG.HOLE_R },
    ],
  },
  // Level 2: Winding path
  {
    start: { x: 60, y: 60 },
    goal: { x: 630, y: 440 },
    walls: [
      // Outer frame
      { x: 0, y: 0, w: CFG.BOARD_W, h: CFG.WALL_THICKNESS },
      { x: 0, y: CFG.BOARD_H - CFG.WALL_THICKNESS, w: CFG.BOARD_W, h: CFG.WALL_THICKNESS },
      { x: 0, y: 0, w: CFG.WALL_THICKNESS, h: CFG.BOARD_H },
      { x: CFG.BOARD_W - CFG.WALL_THICKNESS, y: 0, w: CFG.WALL_THICKNESS, h: CFG.BOARD_H },
      // Horizontal barriers creating a zigzag
      { x: 100, y: 100, w: 500, h: CFG.WALL_THICKNESS },
      { x: 100, y: 200, w: 500, h: CFG.WALL_THICKNESS },
      { x: 100, y: 300, w: 500, h: CFG.WALL_THICKNESS },
      { x: 100, y: 400, w: 500, h: CFG.WALL_THICKNESS },
      // Alternating gaps (right then left)
      { x: 100, y: 100, w: CFG.WALL_THICKNESS, h: 100 },
      { x: 600 - CFG.WALL_THICKNESS, y: 200, w: CFG.WALL_THICKNESS, h: 100 },
      { x: 100, y: 300, w: CFG.WALL_THICKNESS, h: 100 },
      // Extra internal blocks
      { x: 300, y: 130, w: 60, h: CFG.WALL_THICKNESS },
      { x: 400, y: 230, w: 60, h: CFG.WALL_THICKNESS },
      { x: 250, y: 330, w: 60, h: CFG.WALL_THICKNESS },
    ],
    holes: [
      { x: 250, y: 150, r: CFG.HOLE_R },
      { x: 500, y: 150, r: CFG.HOLE_R },
      { x: 200, y: 250, r: CFG.HOLE_R },
      { x: 450, y: 250, r: CFG.HOLE_R },
      { x: 350, y: 350, r: CFG.HOLE_R },
      { x: 550, y: 450, r: CFG.HOLE_R },
    ],
  },
  // Level 3: Complex labyrinth
  {
    start: { x: 50, y: 50 },
    goal: { x: 650, y: 450 },
    walls: [
      // Outer frame
      { x: 0, y: 0, w: CFG.BOARD_W, h: CFG.WALL_THICKNESS },
      { x: 0, y: CFG.BOARD_H - CFG.WALL_THICKNESS, w: CFG.BOARD_W, h: CFG.WALL_THICKNESS },
      { x: 0, y: 0, w: CFG.WALL_THICKNESS, h: CFG.BOARD_H },
      { x: CFG.BOARD_W - CFG.WALL_THICKNESS, y: 0, w: CFG.WALL_THICKNESS, h: CFG.BOARD_H },
      // Vertical partitions
      { x: 120, y: 0, w: CFG.WALL_THICKNESS, h: 160 },
      { x: 120, y: 220, w: CFG.WALL_THICKNESS, h: 180 },
      { x: 240, y: 80, w: CFG.WALL_THICKNESS, h: 200 },
      { x: 240, y: 340, w: CFG.WALL_THICKNESS, h: 160 },
      { x: 360, y: 0, w: CFG.WALL_THICKNESS, h: 140 },
      { x: 360, y: 200, w: CFG.WALL_THICKNESS, h: 140 },
      { x: 360, y: 400, w: CFG.WALL_THICKNESS, h: 100 },
      { x: 480, y: 60, w: CFG.WALL_THICKNESS, h: 200 },
      { x: 480, y: 320, w: CFG.WALL_THICKNESS, h: 180 },
      { x: 580, y: 0, w: CFG.WALL_THICKNESS, h: 120 },
      { x: 580, y: 180, w: CFG.WALL_THICKNESS, h: 160 },
      { x: 580, y: 400, w: CFG.WALL_THICKNESS, h: 100 },
      // Horizontal connectors
      { x: 120, y: 160, w: 120, h: CFG.WALL_THICKNESS },
      { x: 240, y: 80, w: 120, h: CFG.WALL_THICKNESS },
      { x: 360, y: 340, w: 120, h: CFG.WALL_THICKNESS },
      { x: 480, y: 260, w: 100, h: CFG.WALL_THICKNESS },
      { x: 120, y: 400, w: 120, h: CFG.WALL_THICKNESS },
      { x: 360, y: 140, w: 120, h: CFG.WALL_THICKNESS },
    ],
    holes: [
      { x: 80, y: 190, r: CFG.HOLE_R },
      { x: 180, y: 120, r: CFG.HOLE_R },
      { x: 180, y: 350, r: CFG.HOLE_R },
      { x: 300, y: 200, r: CFG.HOLE_R },
      { x: 300, y: 420, r: CFG.HOLE_R },
      { x: 420, y: 100, r: CFG.HOLE_R },
      { x: 420, y: 300, r: CFG.HOLE_R },
      { x: 530, y: 170, r: CFG.HOLE_R },
      { x: 530, y: 420, r: CFG.HOLE_R },
      { x: 630, y: 300, r: CFG.HOLE_R },
    ],
  },
  // Level 4: Narrow corridors
  {
    start: { x: 50, y: 250 },
    goal: { x: 650, y: 250 },
    walls: [
      // Outer frame
      { x: 0, y: 0, w: CFG.BOARD_W, h: CFG.WALL_THICKNESS },
      { x: 0, y: CFG.BOARD_H - CFG.WALL_THICKNESS, w: CFG.BOARD_W, h: CFG.WALL_THICKNESS },
      { x: 0, y: 0, w: CFG.WALL_THICKNESS, h: CFG.BOARD_H },
      { x: CFG.BOARD_W - CFG.WALL_THICKNESS, y: 0, w: CFG.WALL_THICKNESS, h: CFG.BOARD_H },
      // Central horizontal corridor walls
      { x: 80, y: 210, w: 540, h: CFG.WALL_THICKNESS },
      { x: 80, y: 280, w: 540, h: CFG.WALL_THICKNESS },
      // Upper maze
      { x: 80, y: 70, w: CFG.WALL_THICKNESS, h: 140 },
      { x: 200, y: 0, w: CFG.WALL_THICKNESS, h: 140 },
      { x: 200, y: 70, w: 100, h: CFG.WALL_THICKNESS },
      { x: 350, y: 50, w: CFG.WALL_THICKNESS, h: 160 },
      { x: 350, y: 120, w: 100, h: CFG.WALL_THICKNESS },
      { x: 500, y: 0, w: CFG.WALL_THICKNESS, h: 130 },
      { x: 500, y: 120, w: 100, h: CFG.WALL_THICKNESS },
      // Lower maze
      { x: 80, y: 280, w: CFG.WALL_THICKNESS, h: 150 },
      { x: 200, y: 350, w: CFG.WALL_THICKNESS, h: 150 },
      { x: 80, y: 420, w: 120, h: CFG.WALL_THICKNESS },
      { x: 350, y: 280, w: CFG.WALL_THICKNESS, h: 130 },
      { x: 350, y: 380, w: 100, h: CFG.WALL_THICKNESS },
      { x: 500, y: 350, w: CFG.WALL_THICKNESS, h: 150 },
      { x: 500, y: 380, w: 100, h: CFG.WALL_THICKNESS },
      // Entry and exit gaps in corridor
      { x: 620, y: 210, w: 80, h: CFG.WALL_THICKNESS },
      { x: 620, y: 280, w: 80, h: CFG.WALL_THICKNESS },
    ],
    holes: [
      { x: 140, y: 150, r: CFG.HOLE_R },
      { x: 280, y: 100, r: CFG.HOLE_R },
      { x: 430, y: 80, r: CFG.HOLE_R },
      { x: 140, y: 350, r: CFG.HOLE_R },
      { x: 280, y: 430, r: CFG.HOLE_R },
      { x: 430, y: 330, r: CFG.HOLE_R },
      { x: 570, y: 250, r: CFG.HOLE_R },
      { x: 250, y: 250, r: 10 },
      { x: 400, y: 250, r: 10 },
      { x: 550, y: 170, r: CFG.HOLE_R },
      { x: 600, y: 400, r: CFG.HOLE_R },
    ],
  },
  // Level 5: Gauntlet
  {
    start: { x: 50, y: 50 },
    goal: { x: 350, y: 450 },
    walls: [
      // Outer frame
      { x: 0, y: 0, w: CFG.BOARD_W, h: CFG.WALL_THICKNESS },
      { x: 0, y: CFG.BOARD_H - CFG.WALL_THICKNESS, w: CFG.BOARD_W, h: CFG.WALL_THICKNESS },
      { x: 0, y: 0, w: CFG.WALL_THICKNESS, h: CFG.BOARD_H },
      { x: CFG.BOARD_W - CFG.WALL_THICKNESS, y: 0, w: CFG.WALL_THICKNESS, h: CFG.BOARD_H },
      // Dense internal grid
      { x: 100, y: 0, w: CFG.WALL_THICKNESS, h: 80 },
      { x: 100, y: 120, w: CFG.WALL_THICKNESS, h: 80 },
      { x: 100, y: 240, w: CFG.WALL_THICKNESS, h: 80 },
      { x: 100, y: 360, w: CFG.WALL_THICKNESS, h: 140 },
      { x: 200, y: 60, w: CFG.WALL_THICKNESS, h: 100 },
      { x: 200, y: 200, w: CFG.WALL_THICKNESS, h: 120 },
      { x: 200, y: 380, w: CFG.WALL_THICKNESS, h: 60 },
      { x: 300, y: 0, w: CFG.WALL_THICKNESS, h: 120 },
      { x: 300, y: 160, w: CFG.WALL_THICKNESS, h: 100 },
      { x: 300, y: 300, w: CFG.WALL_THICKNESS, h: 100 },
      { x: 300, y: 440, w: CFG.WALL_THICKNESS, h: 60 },
      { x: 400, y: 40, w: CFG.WALL_THICKNESS, h: 100 },
      { x: 400, y: 180, w: CFG.WALL_THICKNESS, h: 120 },
      { x: 400, y: 340, w: CFG.WALL_THICKNESS, h: 100 },
      { x: 500, y: 0, w: CFG.WALL_THICKNESS, h: 80 },
      { x: 500, y: 120, w: CFG.WALL_THICKNESS, h: 100 },
      { x: 500, y: 260, w: CFG.WALL_THICKNESS, h: 120 },
      { x: 500, y: 420, w: CFG.WALL_THICKNESS, h: 80 },
      { x: 600, y: 60, w: CFG.WALL_THICKNESS, h: 140 },
      { x: 600, y: 240, w: CFG.WALL_THICKNESS, h: 80 },
      { x: 600, y: 360, w: CFG.WALL_THICKNESS, h: 140 },
      // Horizontal connectors
      { x: 100, y: 80, w: 100, h: CFG.WALL_THICKNESS },
      { x: 200, y: 160, w: 100, h: CFG.WALL_THICKNESS },
      { x: 300, y: 260, w: 100, h: CFG.WALL_THICKNESS },
      { x: 400, y: 140, w: 100, h: CFG.WALL_THICKNESS },
      { x: 500, y: 380, w: 100, h: CFG.WALL_THICKNESS },
      { x: 100, y: 320, w: 100, h: CFG.WALL_THICKNESS },
      { x: 300, y: 400, w: 100, h: CFG.WALL_THICKNESS },
      { x: 200, y: 440, w: 100, h: CFG.WALL_THICKNESS },
      { x: 400, y: 440, w: 100, h: CFG.WALL_THICKNESS },
      { x: 500, y: 220, w: 100, h: CFG.WALL_THICKNESS },
    ],
    holes: [
      { x: 50, y: 150, r: 11 },
      { x: 150, y: 50, r: 11 },
      { x: 150, y: 180, r: 11 },
      { x: 150, y: 300, r: 11 },
      { x: 150, y: 430, r: 11 },
      { x: 250, y: 130, r: 11 },
      { x: 250, y: 280, r: 11 },
      { x: 250, y: 400, r: 11 },
      { x: 350, y: 50, r: 11 },
      { x: 350, y: 220, r: 11 },
      { x: 350, y: 360, r: 11 },
      { x: 450, y: 120, r: 11 },
      { x: 450, y: 260, r: 11 },
      { x: 450, y: 420, r: 11 },
      { x: 550, y: 50, r: 11 },
      { x: 550, y: 200, r: 11 },
      { x: 550, y: 340, r: 11 },
      { x: 650, y: 160, r: 11 },
      { x: 650, y: 320, r: 11 },
    ],
  },
];

// ==========================================
// 4. Physics / Collision Helpers
// ==========================================
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function ballWallCollision(ball: Ball, wall: Wall, r: number): Ball {
  // Find closest point on wall rect to ball center
  const cx = clamp(ball.x, wall.x, wall.x + wall.w);
  const cy = clamp(ball.y, wall.y, wall.y + wall.h);
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < r && dist > 0) {
    // Push ball out
    const overlap = r - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    ball.x += nx * overlap;
    ball.y += ny * overlap;

    // Reflect velocity
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx -= 2 * dot * nx;
      ball.vy -= 2 * dot * ny;
      ball.vx *= CFG.BOUNCE_DAMPING;
      ball.vy *= CFG.BOUNCE_DAMPING;
      return { ...ball }; // signal bounce happened
    }
  } else if (dist === 0) {
    // Ball center is inside wall — push out via shortest axis
    const overlapX1 = (wall.x + wall.w) - (ball.x - r);
    const overlapX2 = (ball.x + r) - wall.x;
    const overlapY1 = (wall.y + wall.h) - (ball.y - r);
    const overlapY2 = (ball.y + r) - wall.y;
    const minOverlap = Math.min(overlapX1, overlapX2, overlapY1, overlapY2);

    if (minOverlap === overlapX1) { ball.x = wall.x + wall.w + r; ball.vx = Math.abs(ball.vx) * CFG.BOUNCE_DAMPING; }
    else if (minOverlap === overlapX2) { ball.x = wall.x - r; ball.vx = -Math.abs(ball.vx) * CFG.BOUNCE_DAMPING; }
    else if (minOverlap === overlapY1) { ball.y = wall.y + wall.h + r; ball.vy = Math.abs(ball.vy) * CFG.BOUNCE_DAMPING; }
    else { ball.y = wall.y - r; ball.vy = -Math.abs(ball.vy) * CFG.BOUNCE_DAMPING; }
    return { ...ball };
  }

  return ball;
}

function checkHole(ball: Ball, hole: Hole): boolean {
  const dx = ball.x - hole.x;
  const dy = ball.y - hole.y;
  return Math.sqrt(dx * dx + dy * dy) < hole.r;
}

function checkGoal(ball: Ball, goal: Point): boolean {
  const dx = ball.x - goal.x;
  const dy = ball.y - goal.y;
  return Math.sqrt(dx * dx + dy * dy) < CFG.GOAL_R + CFG.BALL_R * 0.5;
}

// ==========================================
// 5. Game Logic Hook
// ==========================================
function useLabyrinthLogic(
  inputRef: MutableRefObject<NormalizedInput>,
  paused: boolean,
  callbacks: GameCallbacks
) {
  const getInitialState = useCallback((level = 0): GameState => {
    const maze = LEVELS[level % LEVELS.length];
    return {
      ball: { x: maze.start.x, y: maze.start.y, vx: 0, vy: 0 },
      level,
      levelStatus: 'READY',
      platformStatus: 'READY',
      startTime: 0,
      elapsedTime: 0,
      score: 0,
      fallingHole: null,
      fallProgress: 0,
      celebrateTimer: 0,
    };
  }, []);

  const [gameState, setGameState] = useState<GameState>(getInitialState);
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Report score / status to platform
  useEffect(() => { callbacksRef.current.onScoreChange(gameState.score); }, [gameState.score]);
  useEffect(() => { callbacksRef.current.onStatusChange(gameState.platformStatus); }, [gameState.platformStatus]);

  // Game Loop
  useEffect(() => {
    let loopId: number;
    let lastTime = performance.now();
    let bounceCooldown = 0;

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 16.667, 3); // normalize to ~60fps, cap at 3 frames
      lastTime = now;

      const input = inputRef.current;
      const s = stateRef.current;

      // -- Lifecycle actions --
      if (s.levelStatus === 'READY' && input.actions['start-game']) {
        setGameState(prev => ({
          ...prev,
          levelStatus: 'PLAYING',
          platformStatus: 'PLAYING',
          startTime: Date.now(),
        }));
      }
      if (input.actions['restart-game']) {
        setGameState(getInitialState(0));
      }

      // -- Playing --
      if (s.levelStatus === 'PLAYING' && !paused) {
        const maze = LEVELS[s.level % LEVELS.length];
        const ball = { ...s.ball };

        // Apply tilt acceleration
        ball.vx += input.move.x * CFG.GRAVITY * dt;
        ball.vy += input.move.y * CFG.GRAVITY * dt;

        // Friction
        ball.vx *= Math.pow(CFG.FRICTION, dt);
        ball.vy *= Math.pow(CFG.FRICTION, dt);

        // Clamp velocity
        ball.vx = clamp(ball.vx, -CFG.MAX_VELOCITY, CFG.MAX_VELOCITY);
        ball.vy = clamp(ball.vy, -CFG.MAX_VELOCITY, CFG.MAX_VELOCITY);

        // Move
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        // Wall collisions
        let bounced = false;
        bounceCooldown = Math.max(0, bounceCooldown - dt);
        for (const wall of maze.walls) {
          const prev = { ...ball };
          const result = ballWallCollision(ball, wall, CFG.BALL_R);
          ball.x = result.x; ball.y = result.y;
          ball.vx = result.vx; ball.vy = result.vy;
          if ((prev.vx !== ball.vx || prev.vy !== ball.vy) && !bounced) {
            bounced = true;
          }
        }
        if (bounced && bounceCooldown <= 0) {
          sfx.paddleHit();
          bounceCooldown = 4;
        }

        // Hole check
        for (const hole of maze.holes) {
          if (checkHole(ball, hole)) {
            sfx.ballLost();
            setGameState(prev => ({
              ...prev,
              ball,
              levelStatus: 'FALLING',
              fallingHole: hole,
              fallProgress: 0,
            }));
            loopId = requestAnimationFrame(loop);
            return;
          }
        }

        // Goal check
        if (checkGoal(ball, maze.goal)) {
          sfx.levelUp();
          const elapsed = (Date.now() - s.startTime) / 1000;
          const levelScore = Math.max(100, (s.level + 1) * 1000 - Math.floor(elapsed) * 10);

          if (s.level >= LEVELS.length - 1) {
            // Completed all levels
            setGameState(prev => ({
              ...prev,
              ball,
              levelStatus: 'VICTORY',
              platformStatus: 'GAME_OVER',
              score: prev.score + levelScore,
              elapsedTime: elapsed,
            }));
          } else {
            setGameState(prev => ({
              ...prev,
              ball,
              levelStatus: 'LEVEL_COMPLETE',
              score: prev.score + levelScore,
              elapsedTime: elapsed,
              celebrateTimer: 90, // ~1.5s at 60fps
            }));
          }
          loopId = requestAnimationFrame(loop);
          return;
        }

        // Normal update
        const elapsed = (Date.now() - s.startTime) / 1000;
        setGameState(prev => ({ ...prev, ball, elapsedTime: elapsed }));
      }

      // -- Falling animation --
      if (s.levelStatus === 'FALLING') {
        const progress = s.fallProgress + dt * 2.5;
        if (progress >= 100) {
          // Reset ball to start of current level
          const maze = LEVELS[s.level % LEVELS.length];
          setGameState(prev => ({
            ...prev,
            ball: { x: maze.start.x, y: maze.start.y, vx: 0, vy: 0 },
            levelStatus: 'PLAYING',
            fallingHole: null,
            fallProgress: 0,
          }));
        } else {
          setGameState(prev => ({ ...prev, fallProgress: progress }));
        }
      }

      // -- Level complete celebration --
      if (s.levelStatus === 'LEVEL_COMPLETE') {
        const timer = s.celebrateTimer - dt;
        if (timer <= 0) {
          const nextLevel = s.level + 1;
          const maze = LEVELS[nextLevel % LEVELS.length];
          setGameState(prev => ({
            ...prev,
            level: nextLevel,
            ball: { x: maze.start.x, y: maze.start.y, vx: 0, vy: 0 },
            levelStatus: 'READY',
            celebrateTimer: 0,
            startTime: 0,
          }));
        } else {
          setGameState(prev => ({ ...prev, celebrateTimer: timer }));
        }
      }

      loopId = requestAnimationFrame(loop);
    };

    loopId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(loopId);
  }, [paused, inputRef, getInitialState]);

  return gameState;
}

// ==========================================
// 6. Rendering
// ==========================================
interface Props {
  inputRef: MutableRefObject<NormalizedInput>;
  paused: boolean;
  callbacks: GameCallbacks;
  [key: string]: any;
}

export default function Game6({ inputRef, paused, callbacks }: Props) {
  const gs = useLabyrinthLogic(inputRef, paused, callbacks);
  const maze = LEVELS[gs.level % LEVELS.length];

  // Board scaling to fit viewport
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const sx = (vw - 40) / CFG.BOARD_W;
      const sy = (vh - 120) / CFG.BOARD_H;
      setScale(Math.min(sx, sy, 1.4));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const boardW = CFG.BOARD_W * scale;
  const boardH = CFG.BOARD_H * scale;

  // Falling ball scale
  const fallScale = gs.levelStatus === 'FALLING'
    ? Math.max(0, 1 - gs.fallProgress / 100)
    : 1;
  const fallBallX = gs.levelStatus === 'FALLING' && gs.fallingHole
    ? gs.ball.x + (gs.fallingHole.x - gs.ball.x) * (gs.fallProgress / 100)
    : gs.ball.x;
  const fallBallY = gs.levelStatus === 'FALLING' && gs.fallingHole
    ? gs.ball.y + (gs.fallingHole.y - gs.ball.y) * (gs.fallProgress / 100)
    : gs.ball.y;

  return (
    <div
      className="relative w-full h-screen overflow-hidden flex items-center justify-center select-none"
      style={{
        background: 'linear-gradient(135deg, #1a0e07 0%, #2d1a0e 40%, #1a0e07 100%)',
      }}
    >
      {/* Score & Level HUD */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-6">
        <div className="text-amber-200/80 text-sm font-bold tracking-wider"
          style={{ fontFamily: 'monospace' }}>
          LEVEL {gs.level + 1}/{LEVELS.length}
        </div>
        {gs.levelStatus === 'PLAYING' && (
          <div className="text-amber-100/60 text-sm font-mono">
            {gs.elapsedTime.toFixed(1)}s
          </div>
        )}
        <div className="text-amber-300/90 text-sm font-bold font-mono">
          {gs.score.toString().padStart(5, '0')}
        </div>
      </div>

      {/* Board */}
      <div
        ref={containerRef}
        className="relative"
        style={{
          width: boardW,
          height: boardH,
          background: 'linear-gradient(160deg, #3d2817 0%, #2a1a0d 50%, #3d2817 100%)',
          borderRadius: 8 * scale,
          boxShadow: `
            0 0 0 ${4 * scale}px #5a3a20,
            0 0 0 ${8 * scale}px #2a1a0d,
            0 ${10 * scale}px ${30 * scale}px rgba(0,0,0,0.6),
            inset 0 0 ${20 * scale}px rgba(0,0,0,0.3)
          `,
        }}
      >
        {/* Wood grain texture overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: 8 * scale,
            opacity: 0.06,
            backgroundImage: `repeating-linear-gradient(
              90deg,
              transparent,
              transparent ${3 * scale}px,
              rgba(255,220,180,0.3) ${3 * scale}px,
              rgba(255,220,180,0.3) ${4 * scale}px
            )`,
          }}
        />

        {/* Walls */}
        {maze.walls.map((wall, i) => (
          <div
            key={`w-${i}`}
            className="absolute"
            style={{
              left: wall.x * scale,
              top: wall.y * scale,
              width: wall.w * scale,
              height: wall.h * scale,
              background: 'linear-gradient(180deg, #5a3a20 0%, #4a2e18 50%, #3d2510 100%)',
              boxShadow: `
                inset 0 ${1 * scale}px 0 rgba(255,220,180,0.15),
                0 ${1 * scale}px ${3 * scale}px rgba(0,0,0,0.5)
              `,
              borderRadius: 1 * scale,
            }}
          />
        ))}

        {/* Holes */}
        {maze.holes.map((hole, i) => (
          <div
            key={`h-${i}`}
            className="absolute"
            style={{
              left: (hole.x - hole.r) * scale,
              top: (hole.y - hole.r) * scale,
              width: hole.r * 2 * scale,
              height: hole.r * 2 * scale,
              borderRadius: '50%',
              background: 'radial-gradient(circle, #050505 40%, #1a1008 70%, #2a1a0d 100%)',
              boxShadow: `inset 0 ${2 * scale}px ${6 * scale}px rgba(0,0,0,0.9), inset 0 0 ${3 * scale}px rgba(0,0,0,0.5)`,
            }}
          />
        ))}

        {/* Goal */}
        <div
          className="absolute"
          style={{
            left: (maze.goal.x - CFG.GOAL_R) * scale,
            top: (maze.goal.y - CFG.GOAL_R) * scale,
            width: CFG.GOAL_R * 2 * scale,
            height: CFG.GOAL_R * 2 * scale,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #ffd700, #d4a017 60%, #b8860b)',
            boxShadow: `
              0 0 ${10 * scale}px rgba(255,215,0,0.6),
              0 0 ${20 * scale}px rgba(255,215,0,0.3),
              inset 0 ${-2 * scale}px ${4 * scale}px rgba(0,0,0,0.2)
            `,
            animation: 'labyrinth-goal-pulse 1.5s ease-in-out infinite',
          }}
        />

        {/* Ball */}
        {(gs.levelStatus === 'PLAYING' || gs.levelStatus === 'FALLING' || gs.levelStatus === 'READY') && (
          <div
            className="absolute"
            style={{
              left: (fallBallX - CFG.BALL_R) * scale,
              top: (fallBallY - CFG.BALL_R) * scale,
              width: CFG.BALL_R * 2 * scale,
              height: CFG.BALL_R * 2 * scale,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 30%, #ffffff, #d4d4d4 30%, #a0a0a0 60%, #707070 85%, #505050)',
              boxShadow: `
                ${2 * scale}px ${3 * scale}px ${6 * scale}px rgba(0,0,0,0.5),
                inset 0 ${-1 * scale}px ${2 * scale}px rgba(0,0,0,0.2),
                0 0 ${4 * scale}px rgba(200,200,200,0.2)
              `,
              transform: `scale(${fallScale})`,
              transition: gs.levelStatus === 'FALLING' ? 'none' : undefined,
              zIndex: 10,
            }}
          />
        )}
      </div>

      {/* READY Overlay */}
      {gs.levelStatus === 'READY' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center"
          style={{ background: 'rgba(10,5,2,0.65)' }}>
          <div className="text-amber-200 text-4xl font-black mb-3 tracking-wide"
            style={{ textShadow: '0 2px 10px rgba(255,180,50,0.4)' }}>
            LEVEL {gs.level + 1}
          </div>
          <div className="text-amber-100/60 text-lg font-mono mb-2">
            {gs.level === 0 ? 'Guide the ball to the golden goal' : `${LEVELS[gs.level % LEVELS.length].holes.length} holes to avoid`}
          </div>
          <div className="text-amber-200/40 text-sm font-mono mt-4 animate-pulse">
            TILT TO START
          </div>
        </div>
      )}

      {/* LEVEL COMPLETE Overlay */}
      {gs.levelStatus === 'LEVEL_COMPLETE' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center"
          style={{ background: 'rgba(10,5,2,0.6)' }}>
          <div className="text-amber-200 text-3xl font-black mb-2"
            style={{ textShadow: '0 2px 15px rgba(255,215,0,0.5)' }}>
            LEVEL COMPLETE!
          </div>
          <div className="text-amber-100/70 text-lg font-mono">
            Time: {gs.elapsedTime.toFixed(1)}s
          </div>
        </div>
      )}

      {/* VICTORY Overlay */}
      {gs.levelStatus === 'VICTORY' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center"
          style={{ background: 'rgba(10,5,2,0.7)' }}>
          <div className="text-amber-200 text-4xl font-black mb-3"
            style={{ textShadow: '0 2px 20px rgba(255,215,0,0.6)' }}>
            VICTORY!
          </div>
          <div className="text-amber-100/80 text-xl font-mono mb-2">
            All {LEVELS.length} levels completed!
          </div>
          <div className="text-amber-300 text-2xl font-black font-mono">
            Score: {gs.score}
          </div>
          <div className="text-amber-200/40 text-sm font-mono mt-6 animate-pulse">
            PRESS RESTART TO PLAY AGAIN
          </div>
        </div>
      )}

      {/* Pulsing goal animation keyframes */}
      <style>{`
        @keyframes labyrinth-goal-pulse {
          0%, 100% { box-shadow: 0 0 ${10 * scale}px rgba(255,215,0,0.6), 0 0 ${20 * scale}px rgba(255,215,0,0.3); }
          50% { box-shadow: 0 0 ${16 * scale}px rgba(255,215,0,0.8), 0 0 ${32 * scale}px rgba(255,215,0,0.5); }
        }
      `}</style>
    </div>
  );
}
