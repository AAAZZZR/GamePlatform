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
  BALL_SPEED: 4,
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
];

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
  type: 'WIDE' | 'MULTIBALL' | 'FIREBALL' | 'FAST';
}
interface HitFlash { id: string; x: number; y: number; life: number; }

interface GameState {
  paddleX: number;
  paddleWidth: number;
  balls: Ball[];
  bricks: Brick[];
  powerUps: PowerUp[];
  hitFlashes: HitFlash[];
  status: 'READY' | 'PLAYING' | 'GAME_OVER' | 'VICTORY';
  score: number;
  level: number;
  startTime: number;
}

function createBricksForLevel(level: number): Brick[] {
  const bricks: Brick[] = [];
  const totalW = GAME_CONFIG.WIDTH;
  const brickW = (totalW - (GAME_CONFIG.BRICK_COLS + 1) * GAME_CONFIG.BRICK_GAP) / GAME_CONFIG.BRICK_COLS;
  const rows = Math.min(GAME_CONFIG.BRICK_ROWS + Math.floor(level / 2), 8);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < GAME_CONFIG.BRICK_COLS; c++) {
      // Some bricks are skipped for pattern variety on higher levels
      if (level > 1 && Math.random() < 0.1) continue;
      const hp = r === 0 && level > 2 ? 2 : 1;
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
    paddleWidth: GAME_CONFIG.PADDLE_WIDTH,
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
        const levelSpeedBonus = 1 + (current.level - 1) * 0.15;

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
        let scoreAdd = 0;

        for (let ball of newBalls) {
          if (!ball.active) continue;
          for (let b of newBricks) {
            if (!b.active) continue;
            if (ball.x >= b.x && ball.x <= b.x + b.width &&
              ball.y >= b.y && ball.y <= b.y + b.height) {
              if (ball.fireball) {
                b.active = false;
                scoreAdd += GAME_CONFIG.SCORE_PER_BRICK;
                sfx.brickBreak(b.row);
              } else {
                b.hp--;
                if (b.hp <= 0) {
                  b.active = false;
                  scoreAdd += GAME_CONFIG.SCORE_PER_BRICK;
                  sfx.brickBreak(b.row);
                  // Spawn power-up 20% chance
                  if (Math.random() < 0.2) {
                    const types: PowerUp['type'][] = ['WIDE', 'MULTIBALL', 'FIREBALL', 'FAST'];
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
            }
          }
        }

        // Age hit flashes
        for (const f of newFlashes) { f.life -= 0.1; }

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
          nextPaddleWidth = GAME_CONFIG.PADDLE_WIDTH; // reset paddle
          newStatus = 'READY';
        }

        // Apply WIDE powerup
        const wideCollected = newPowerUps.filter(p => !p.active && p.type === 'WIDE').length >
          current.powerUps.filter(p => !p.active && p.type === 'WIDE').length;
        if (wideCollected) {
          nextPaddleWidth = Math.min(240, current.paddleWidth + 40);
          if (paddleWidthTimeoutRef.current) clearTimeout(paddleWidthTimeoutRef.current);
          paddleWidthTimeoutRef.current = setTimeout(() => {
            setGameState(prev => ({ ...prev, paddleWidth: GAME_CONFIG.PADDLE_WIDTH }));
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
  const { paddleX, paddleWidth, balls, bricks, powerUps, hitFlashes, status, score, level } = gameState;

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

  const brickW = (GAME_CONFIG.WIDTH - (GAME_CONFIG.BRICK_COLS + 1) * GAME_CONFIG.BRICK_GAP) / GAME_CONFIG.BRICK_COLS;

  const powerUpColors: Record<PowerUp['type'], string> = {
    WIDE: '#22d3ee', MULTIBALL: '#a855f7', FIREBALL: '#f97316', FAST: '#facc15'
  };
  const powerUpLabels: Record<PowerUp['type'], string> = {
    WIDE: '↔', MULTIBALL: '✦', FIREBALL: '🔥', FAST: '⚡'
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
          <div key={b.id} className="absolute rounded-sm overflow-hidden transition-all duration-100"
            style={{
              left: b.x, top: b.y,
              width: b.width, height: b.height,
              background: BRICK_COLORS[b.row % BRICK_COLORS.length].fill,
              boxShadow: `0 0 8px ${BRICK_COLORS[b.row % BRICK_COLORS.length].glow}, inset 0 2px 4px rgba(255,255,255,0.3)`,
              opacity: b.hp > 1 ? 1 : 1
            }}>
            {b.hp > 1 && <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white text-xs font-bold">●</div>}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 50%)' }} />
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
