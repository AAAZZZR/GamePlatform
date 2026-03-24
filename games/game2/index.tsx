// games/game2/index.tsx — Space Brick (Enhanced)
import React, { useEffect, useState, useRef, useCallback, MutableRefObject } from 'react';
import { Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { NormalizedInput } from '@/platform/types';
import { sfx } from '@/platform/audio';

const GAME_CONFIG = {
  WIDTH: 800,
  HEIGHT: 600,
  PADDLE_WIDTH: 120,
  PADDLE_HEIGHT: 18,
  PADDLE_Y: 555,
  PADDLE_SPEED: 14,
  BALL_SIZE: 14,
  BALL_SPEED: 2.5,           // slower base speed (was 4)
  BRICK_ROWS: 5,
  BRICK_COLS: 10,
  BRICK_HEIGHT: 28,
  BRICK_GAP: 6,
  SCORE_PER_BRICK: 50,
  POWERUP_FALL_SPEED: 3,
};

const BRICK_COLORS = [
  { fill: '#f43f5e', glow: 'rgba(244,63,94,0.7)' },  // row 0 - red
  { fill: '#f97316', glow: 'rgba(249,115,22,0.7)' },  // row 1 - orange
  { fill: '#eab308', glow: 'rgba(234,179,8,0.7)' },   // row 2 - yellow
  { fill: '#22c55e', glow: 'rgba(34,197,94,0.7)' },   // row 3 - green
  { fill: '#6366f1', glow: 'rgba(99,102,241,0.7)' },  // row 4 - indigo
  { fill: '#ec4899', glow: 'rgba(236,72,153,0.7)' },  // row 5 - pink
  { fill: '#14b8a6', glow: 'rgba(20,184,166,0.7)' },  // row 6 - teal
  { fill: '#8b5cf6', glow: 'rgba(139,92,246,0.7)' },  // row 7 - violet
];

// Per-level config for progressive difficulty
interface LevelConfig {
  rows: number;
  cols: number;
  paddleWidth: number;
  speedMult: number;
  powerUpChance: number;
  layout: 'easy' | 'grid' | 'diamond' | 'checkerboard' | 'pyramid' | 'fortress';
  maxHp: number;
  hpRows: number[];  // which rows get multi-hp bricks
}

function getLevelConfig(level: number): LevelConfig {
  switch (level) {
    case 1:
      return { rows: 3, cols: 8, paddleWidth: 160, speedMult: 1.0, powerUpChance: 0.35,
               layout: 'easy', maxHp: 1, hpRows: [] };
    case 2:
      return { rows: 4, cols: 9, paddleWidth: 150, speedMult: 1.08, powerUpChance: 0.30,
               layout: 'diamond', maxHp: 1, hpRows: [] };
    case 3:
      return { rows: 4, cols: 10, paddleWidth: 140, speedMult: 1.16, powerUpChance: 0.25,
               layout: 'checkerboard', maxHp: 2, hpRows: [0] };
    case 4:
      return { rows: 5, cols: 10, paddleWidth: 130, speedMult: 1.24, powerUpChance: 0.22,
               layout: 'pyramid', maxHp: 2, hpRows: [0, 1] };
    case 5:
      return { rows: 5, cols: 10, paddleWidth: 125, speedMult: 1.32, powerUpChance: 0.20,
               layout: 'fortress', maxHp: 3, hpRows: [0, 1, 2] };
    default: {
      const l = Math.min(level, 12);
      return {
        rows: Math.min(5 + Math.floor((l - 5) / 2), 8),
        cols: 10,
        paddleWidth: Math.max(100, 125 - (l - 5) * 4),
        speedMult: 1.32 + (l - 5) * 0.1,
        powerUpChance: Math.max(0.12, 0.20 - (l - 5) * 0.015),
        layout: (['grid', 'diamond', 'checkerboard', 'pyramid', 'fortress'] as const)[(l - 1) % 5],
        maxHp: Math.min(3, 2 + Math.floor((l - 5) / 3)),
        hpRows: Array.from({ length: Math.min(l - 3, 5) }, (_, i) => i),
      };
    }
  }
}

interface Particle {
  id: string; x: number; y: number; vx: number; vy: number;
  life: number; color: string; size: number;
}

interface Brick {
  id: string; x: number; y: number; width: number; height: number;
  active: boolean; row: number; hp: number;
}
interface Ball {
  id: string; x: number; y: number; vx: number; vy: number;
  active: boolean; fireball?: boolean;
}
interface PowerUp {
  id: string; x: number; y: number; active: boolean;
  type: 'WIDE' | 'MULTIBALL' | 'FIREBALL' | 'SLOW';
}
interface HitFlash { id: string; x: number; y: number; life: number; }

interface GameState {
  paddleX: number;
  paddleWidth: number;
  balls: Ball[];
  bricks: Brick[];
  powerUps: PowerUp[];
  hitFlashes: HitFlash[];
  particles: Particle[];
  status: 'READY' | 'PLAYING' | 'GAME_OVER' | 'VICTORY';
  score: number;
  level: number;
  startTime: number;
}

function createBricksForLevel(level: number): Brick[] {
  const cfg = getLevelConfig(level);
  const bricks: Brick[] = [];
  const totalW = GAME_CONFIG.WIDTH;
  const brickW = (totalW - (cfg.cols + 1) * GAME_CONFIG.BRICK_GAP) / cfg.cols;

  // Helper to decide whether a brick exists in the given layout
  const shouldPlace = (r: number, c: number): boolean => {
    switch (cfg.layout) {
      case 'easy':
        // Only the center portion, with gaps — very few bricks
        return c >= 1 && c <= cfg.cols - 2 && (c + r) % 2 === 0;
      case 'diamond': {
        const midR = (cfg.rows - 1) / 2;
        const midC = (cfg.cols - 1) / 2;
        const dist = Math.abs(r - midR) / cfg.rows + Math.abs(c - midC) / cfg.cols;
        return dist < 0.45;
      }
      case 'checkerboard':
        return (r + c) % 2 === 0;
      case 'pyramid':
        // Each row narrows toward the top
        const margin = r;
        return c >= margin && c < cfg.cols - margin;
      case 'fortress':
        // Outer walls plus a center block
        if (r === 0 || r === cfg.rows - 1) return true;
        if (c === 0 || c === cfg.cols - 1) return true;
        if (r >= 1 && r <= 2 && c >= 3 && c <= 6) return true;
        return false;
      case 'grid':
      default:
        return true;
    }
  };

  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      if (!shouldPlace(r, c)) continue;
      const hp = cfg.hpRows.includes(r) ? cfg.maxHp : 1;
      bricks.push({
        id: uuidv4(),
        x: GAME_CONFIG.BRICK_GAP + c * (brickW + GAME_CONFIG.BRICK_GAP),
        y: GAME_CONFIG.BRICK_GAP + r * (GAME_CONFIG.BRICK_HEIGHT + GAME_CONFIG.BRICK_GAP) + 50,
        width: brickW,
        height: GAME_CONFIG.BRICK_HEIGHT,
        active: true,
        row: r,
        hp
      });
    }
  }
  return bricks;
}

function useGameLogic(inputRef: MutableRefObject<NormalizedInput>, paused: boolean = false) {
  const getInitialState = (level = 1): GameState => ({
    paddleX: GAME_CONFIG.WIDTH / 2,
    paddleWidth: getLevelConfig(level).paddleWidth,
    balls: [{
      id: 'ball-0',
      x: GAME_CONFIG.WIDTH / 2,
      y: GAME_CONFIG.PADDLE_Y - 20,
      vx: 0, vy: 0,
      active: true
    }],
    bricks: createBricksForLevel(level),
    powerUps: [],
    hitFlashes: [],
    particles: [],
    status: 'READY',
    score: 0,
    level,
    startTime: 0
  });

  const [gameState, setGameState] = useState<GameState>(getInitialState());
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const paddleWidthTimeoutRef = useRef<any>(null);

  const launchBall = useCallback(() => {
    if (stateRef.current.status === 'READY') {
      setGameState(prev => ({
        ...prev,
        status: 'PLAYING',
        startTime: Date.now(),
        balls: [{
          id: 'ball-0',
          x: prev.paddleX,
          y: GAME_CONFIG.PADDLE_Y - 20,
          vx: (Math.random() > 0.5 ? 1 : -1) * GAME_CONFIG.BALL_SPEED * 0.6,
          vy: -GAME_CONFIG.BALL_SPEED,
          active: true
        }]
      }));
    }
  }, []);

  const resetGame = useCallback(() => setGameState(getInitialState()), []);

  useEffect(() => {
    let loopId: number;
    const loop = () => {
      if (stateRef.current.status === 'PLAYING' && !paused) {
        const current = stateRef.current;
        const lvlCfg = getLevelConfig(current.level);
        const levelSpeedBonus = lvlCfg.speedMult;

        // Paddle movement (uses platform normalized input)
        let newPaddleX = current.paddleX + inputRef.current.move.x;
        const halfP = current.paddleWidth / 2;
        newPaddleX = Math.max(halfP, Math.min(GAME_CONFIG.WIDTH - halfP, newPaddleX));

        // Balls
        const newBalls = current.balls.map(ball => {
          if (!ball.active) return ball;
          let { x, y, vx, vy } = ball;
          x += vx * levelSpeedBonus;
          y += vy * levelSpeedBonus;

          // Wall bounces
          if (x <= 0) { vx = Math.abs(vx); x = 0; }
          if (x >= GAME_CONFIG.WIDTH) { vx = -Math.abs(vx); x = GAME_CONFIG.WIDTH; }
          if (y <= 0) { vy = Math.abs(vy); y = 0; }

          // Paddle collision
          const pLeft = newPaddleX - current.paddleWidth / 2;
          const pRight = newPaddleX + current.paddleWidth / 2;
          if (x >= pLeft && x <= pRight &&
            y + GAME_CONFIG.BALL_SIZE / 2 >= GAME_CONFIG.PADDLE_Y &&
            y <= GAME_CONFIG.PADDLE_Y + GAME_CONFIG.PADDLE_HEIGHT && vy > 0) {
            vy = -Math.abs(vy);
            vx = ((x - newPaddleX) / (current.paddleWidth / 2)) * GAME_CONFIG.BALL_SPEED;
            sfx.paddleHit();
          }

          // Dead
          if (y > GAME_CONFIG.HEIGHT + 20) {
            sfx.ballLost();
            return { ...ball, active: false };
          }
          return { ...ball, x, y, vx, vy };
        });

        // Brick collisions
        const newBricks = [...current.bricks];
        const newPowerUps = [...current.powerUps];
        const newFlashes = [...current.hitFlashes];
        const newParticles = [...current.particles];
        let scoreAdd = 0;

        const spawnParticles = (bx: number, by: number, row: number) => {
          const color = BRICK_COLORS[row % BRICK_COLORS.length].fill;
          for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8 + (Math.random() - 0.5) * 0.5;
            const speed = 1.5 + Math.random() * 2.5;
            newParticles.push({
              id: uuidv4(), x: bx, y: by,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 1.0, color, size: 3 + Math.random() * 3
            });
          }
        };

        for (const ball of newBalls) {
          if (!ball.active) continue;
          for (const b of newBricks) {
            if (!b.active) continue;
            if (ball.x >= b.x && ball.x <= b.x + b.width &&
              ball.y >= b.y && ball.y <= b.y + b.height) {
              if (ball.fireball) {
                b.active = false;
                scoreAdd += GAME_CONFIG.SCORE_PER_BRICK;
                sfx.brickBreak(b.row);
                spawnParticles(b.x + b.width / 2, b.y + b.height / 2, b.row);
              } else {
                b.hp--;
                if (b.hp <= 0) {
                  b.active = false;
                  scoreAdd += GAME_CONFIG.SCORE_PER_BRICK;
                  sfx.brickBreak(b.row);
                  spawnParticles(b.x + b.width / 2, b.y + b.height / 2, b.row);
                  // Spawn power-up (chance varies by level)
                  if (Math.random() < lvlCfg.powerUpChance) {
                    const types: PowerUp['type'][] = ['WIDE', 'MULTIBALL', 'FIREBALL', 'SLOW'];
                    newPowerUps.push({
                      id: uuidv4(),
                      x: b.x + b.width / 2,
                      y: b.y,
                      active: true,
                      type: types[Math.floor(Math.random() * types.length)]
                    });
                  }
                }
                // Hit flash
                newFlashes.push({ id: uuidv4(), x: b.x + b.width / 2, y: b.y + b.height / 2, life: 1 });
                ball.vy *= -1;
                break;
              }
            }
          }
        }

        // PowerUp movement + collection
        for (let p of newPowerUps) {
          if (!p.active) continue;
          p.y += GAME_CONFIG.POWERUP_FALL_SPEED;
          if (p.y > GAME_CONFIG.HEIGHT) { p.active = false; continue; }
          // Paddle pickup
          const pLeft = newPaddleX - current.paddleWidth / 2;
          const pRight = newPaddleX + current.paddleWidth / 2;
          if (p.x >= pLeft && p.x <= pRight && p.y >= GAME_CONFIG.PADDLE_Y && p.y <= GAME_CONFIG.PADDLE_Y + GAME_CONFIG.PADDLE_HEIGHT) {
            p.active = false;
            sfx.powerup();
            if (p.type === 'WIDE') {
              // paddle expand handled in state update below
            } else if (p.type === 'MULTIBALL') {
              // add extra balls
              const activeBalls = newBalls.filter(b => b.active);
              if (activeBalls.length > 0) {
                const ref = activeBalls[0];
                newBalls.push({ id: uuidv4(), x: ref.x, y: ref.y, vx: -ref.vx, vy: ref.vy, active: true });
                newBalls.push({ id: uuidv4(), x: ref.x, y: ref.y, vx: ref.vy, vy: ref.vx, active: true });
              }
            } else if (p.type === 'FIREBALL') {
              for (const b of newBalls) if (b.active) (b as any).fireball = true;
              setTimeout(() => {
                setGameState(prev => ({
                  ...prev,
                  balls: prev.balls.map(b => ({ ...b, fireball: false }))
                }));
              }, 5000);
            } else if (p.type === 'SLOW') {
              // Temporarily halve ball speed
              for (const b of newBalls) {
                if (b.active) { b.vx *= 0.5; b.vy *= 0.5; }
              }
              setTimeout(() => {
                setGameState(prev => ({
                  ...prev,
                  balls: prev.balls.map(b => ({ ...b, vx: b.vx * 2, vy: b.vy * 2 }))
                }));
              }, 6000);
            }
          }
        }

        // Age hit flashes
        for (const f of newFlashes) { f.life -= 0.1; }

        // Age & move particles
        for (const p of newParticles) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.05; // gravity
          p.life -= 0.03;
        }

        // Game over if all balls dead
        const anyBallActive = newBalls.some(b => b.active);
        const allBricksGone = newBricks.filter(b => b.active).length === 0;

        let newStatus: GameState['status'] = current.status;
        let newLevel = current.level;
        let nextBricks = newBricks;
        let nextPaddleWidth = current.paddleWidth;

        if (!anyBallActive) {
          newStatus = 'GAME_OVER';
        } else if (allBricksGone) {
          // Next level!
          newLevel = current.level + 1;
          sfx.levelUp();
          nextBricks = createBricksForLevel(newLevel);
          nextPaddleWidth = getLevelConfig(newLevel).paddleWidth; // level-based paddle
          newStatus = 'READY';
        }

        // Apply WIDE powerup
        const wideCollected = newPowerUps.filter(p => !p.active && p.type === 'WIDE').length >
          current.powerUps.filter(p => !p.active && p.type === 'WIDE').length;
        if (wideCollected) {
          nextPaddleWidth = Math.min(240, current.paddleWidth + 40);
          if (paddleWidthTimeoutRef.current) clearTimeout(paddleWidthTimeoutRef.current);
          paddleWidthTimeoutRef.current = setTimeout(() => {
            setGameState(prev => ({ ...prev, paddleWidth: getLevelConfig(prev.level).paddleWidth }));
          }, 8000);
        }

        setGameState(prev => ({
          ...prev,
          paddleX: newPaddleX,
          paddleWidth: nextPaddleWidth,
          balls: newBalls.filter(b => b.active || prev.balls.find(pb => pb.id === b.id)),
          bricks: nextBricks,
          powerUps: newPowerUps.filter(p => p.active),
          hitFlashes: newFlashes.filter(f => f.life > 0),
          particles: newParticles.filter(p => p.life > 0),
          score: prev.score + scoreAdd,
          status: newStatus,
          level: newLevel
        }));
      }
      loopId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(loopId);
  }, [paused]);

  return { gameState, launchBall, resetGame };
}

interface Props {
  inputRef: MutableRefObject<NormalizedInput>;
  socket: Socket;
  roomId: string;
  onExit?: () => void;
  paused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onScoreChange?: (score: number) => void;
  onStatusChange?: (status: any) => void;
  settings?: any;
  [key: string]: any;
}

export default function Game2({ inputRef, socket, roomId, paused = false, onPause, onResume, onScoreChange, onStatusChange }: Props) {
  const { gameState, launchBall, resetGame } = useGameLogic(inputRef, paused);
  const { paddleX, paddleWidth, balls, bricks, powerUps, hitFlashes, particles, status, score, level } = gameState;

  useEffect(() => { if (onScoreChange) onScoreChange(score); }, [score, onScoreChange]);
  useEffect(() => { if (onStatusChange) onStatusChange(status); }, [status, onStatusChange]);

  useEffect(() => {
    const handleAction = (payload: any) => {
      const action = typeof payload === 'string' ? payload : payload.action;
      if (action === 'launch' || action === 'fire-start') launchBall();
      if (action === 'restart-game') resetGame();
      if (action === 'pause') onPause?.();
      if (action === 'resume') onResume?.();
    };
    socket.on('controller-action', handleAction);
    socket.emit('sync-game-status', { roomId, status });
    return () => {
      socket.off('controller-action');
    };
  }, [socket, roomId, launchBall, resetGame, status, onPause, onResume]);

  const powerUpColors: Record<PowerUp['type'], string> = {
    WIDE: '#22d3ee', MULTIBALL: '#a855f7', FIREBALL: '#f97316', SLOW: '#38bdf8'
  };
  const powerUpLabels: Record<PowerUp['type'], string> = {
    WIDE: '↔', MULTIBALL: '✦', FIREBALL: '🔥', SLOW: '❄'
  };

  return (
    <div className="relative w-full h-screen overflow-hidden flex items-center justify-center font-mono select-none"
      style={{ background: 'linear-gradient(180deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}>

      {/* Level indicator */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 text-sm font-bold text-indigo-300 bg-indigo-900/40 px-4 py-1 rounded-full border border-indigo-500/30">
        LEVEL {level}
      </div>

      <div className="relative" style={{ width: GAME_CONFIG.WIDTH, height: GAME_CONFIG.HEIGHT }}>
        {/* Background grid */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        {/* Bricks */}
        {bricks.map(b => b.active && (
          <div key={b.id} className="absolute rounded-sm overflow-hidden"
            style={{
              left: b.x, top: b.y,
              width: b.width, height: b.height,
              background: BRICK_COLORS[b.row % BRICK_COLORS.length].fill,
              boxShadow: `0 0 ${b.hp > 1 ? 12 : 8}px ${BRICK_COLORS[b.row % BRICK_COLORS.length].glow}, inset 0 2px 4px rgba(255,255,255,0.3)`,
              border: b.hp >= 3 ? '2px solid rgba(255,255,255,0.6)' : b.hp === 2 ? '1px solid rgba(255,255,255,0.35)' : 'none',
            }}>
            {b.hp > 1 && (
              <div className="absolute inset-0 flex items-center justify-center text-white font-bold"
                style={{ fontSize: 11, textShadow: '0 0 4px rgba(0,0,0,0.8)' }}>
                {b.hp}
              </div>
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 50%)' }} />
          </div>
        ))}

        {/* Hit flashes */}
        {hitFlashes.map(f => (
          <div key={f.id} className="absolute rounded-full pointer-events-none"
            style={{
              width: 40, height: 40,
              left: f.x - 20, top: f.y - 20,
              background: 'radial-gradient(circle, rgba(255,255,255,0.8), transparent)',
              opacity: f.life,
              transform: `scale(${2 - f.life})`
            }} />
        ))}

        {/* Particles */}
        {particles.map(p => (
          <div key={p.id} className="absolute rounded-full pointer-events-none"
            style={{
              width: p.size, height: p.size,
              left: p.x - p.size / 2, top: p.y - p.size / 2,
              backgroundColor: p.color,
              opacity: p.life,
              boxShadow: `0 0 ${p.size + 2}px ${p.color}`,
            }} />
        ))}

        {/* Power-ups */}
        {powerUps.map(p => (
          <div key={p.id} className="absolute rounded-md flex items-center justify-center text-white font-bold text-lg"
            style={{
              width: 28, height: 28,
              left: p.x - 14, top: p.y,
              backgroundColor: powerUpColors[p.type],
              boxShadow: `0 0 12px ${powerUpColors[p.type]}`,
              border: '2px solid rgba(255,255,255,0.5)'
            }}>
            {powerUpLabels[p.type]}
          </div>
        ))}

        {/* Balls */}
        {balls.filter(b => b.active).map(b => (
          <div key={b.id}
            className="absolute rounded-full"
            style={{
              width: GAME_CONFIG.BALL_SIZE,
              height: GAME_CONFIG.BALL_SIZE,
              left: b.x - GAME_CONFIG.BALL_SIZE / 2,
              top: b.y - GAME_CONFIG.BALL_SIZE / 2,
              background: (b as any).fireball ? 'radial-gradient(circle, #fff, #f97316)' : 'radial-gradient(circle, #fff, #fde047)',
              boxShadow: (b as any).fireball ? '0 0 20px #f97316, 0 0 8px #fff' : '0 0 15px rgba(250,204,21,0.9)'
            }} />
        ))}

        {/* Paddle */}
        <div className="absolute rounded-full"
          style={{
            left: paddleX - paddleWidth / 2,
            top: GAME_CONFIG.PADDLE_Y,
            width: paddleWidth,
            height: GAME_CONFIG.PADDLE_HEIGHT,
            background: 'linear-gradient(90deg, #67e8f9, #818cf8, #67e8f9)',
            boxShadow: '0 0 20px rgba(129,140,248,0.8)',
            transition: 'width 0.3s ease'
          }}>
          <div className="absolute inset-x-0 top-1/2 h-[2px] bg-white/40 -translate-y-1/2" />
        </div>
      </div>
    </div>
  );
}
