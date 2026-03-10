// games/game4/index.tsx — Snake 🐍
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { GyroData } from '@/types/game';

const GAME_CONFIG = {
  COLS: 25,
  ROWS: 20,
  CELL: 28,
  get WIDTH() { return this.COLS * this.CELL; },
  get HEIGHT() { return this.ROWS * this.CELL; },
  INITIAL_SPEED: 150,   // ms per step
  MIN_SPEED: 55,
  SPEED_INCREASE: 3,    // ms faster per food eaten
  SCORE_PER_FOOD: 100,
  BOOST_DURATION: 1500, // ms
  TILT_THRESHOLD: 8,    // degrees to register a direction change
};

type Dir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

interface Segment { x: number; y: number; }
interface Food { x: number; y: number; special: boolean; }
interface Particle { id: string; x: number; y: number; vx: number; vy: number; life: number; color: string; }

interface GameState {
  snake: Segment[];
  dir: Dir;
  nextDir: Dir;
  food: Food;
  particles: Particle[];
  status: 'READY' | 'PLAYING' | 'GAME_OVER';
  score: number;
  speed: number;
  boosting: boolean;
}

function randomFood(snake: Segment[]): Food {
  let x: number, y: number;
  do {
    x = Math.floor(Math.random() * GAME_CONFIG.COLS);
    y = Math.floor(Math.random() * GAME_CONFIG.ROWS);
  } while (snake.some(s => s.x === x && s.y === y));
  return { x, y, special: Math.random() < 0.2 };
}

function useGameLogic(paused: boolean = false) {
  const getInitialState = (): GameState => {
    const startSnake = [
      { x: 12, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 10 }
    ];
    return {
      snake: startSnake,
      dir: 'RIGHT',
      nextDir: 'RIGHT',
      food: randomFood(startSnake),
      particles: [],
      status: 'READY',
      score: 0,
      speed: GAME_CONFIG.INITIAL_SPEED,
      boosting: false
    };
  };

  const [gameState, setGameState] = useState<GameState>(getInitialState());
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const inputRef = useRef({ beta: 0, gamma: 0, boost: false });
  const boostTimeoutRef = useRef<any>(null);

  const updateGyro = useCallback((data: GyroData) => {
    const beta = data.beta ?? 0;   // forward/back tilt
    const gamma = data.gamma ?? 0; // left/right tilt
    inputRef.current.beta = beta;
    inputRef.current.gamma = gamma;

    // Map tilt to direction
    const t = GAME_CONFIG.TILT_THRESHOLD;
    const { dir } = stateRef.current;

    let newDir: Dir | null = null;
    if (Math.abs(gamma) > Math.abs(beta)) {
      // Horizontal tilt dominates → LEFT/RIGHT
      if (gamma > t && dir !== 'LEFT') newDir = 'RIGHT';
      else if (gamma < -t && dir !== 'RIGHT') newDir = 'LEFT';
    } else {
      // Vertical tilt dominates → UP/DOWN
      if (beta > t && dir !== 'DOWN') newDir = 'UP';
      else if (beta < -t && dir !== 'UP') newDir = 'DOWN';
    }

    if (newDir && newDir !== stateRef.current.nextDir) {
      setGameState(prev => ({ ...prev, nextDir: newDir as Dir }));
    }
  }, []);

  const setBoost = useCallback((active: boolean) => {
    inputRef.current.boost = active;
    if (active) {
      setGameState(prev => ({ ...prev, boosting: true }));
      if (boostTimeoutRef.current) clearTimeout(boostTimeoutRef.current);
      boostTimeoutRef.current = setTimeout(() => {
        setGameState(prev => ({ ...prev, boosting: false }));
        inputRef.current.boost = false;
      }, GAME_CONFIG.BOOST_DURATION);
    } else {
      if (boostTimeoutRef.current) clearTimeout(boostTimeoutRef.current);
      setGameState(prev => ({ ...prev, boosting: false }));
    }
  }, []);

  const startGame = useCallback(() => {
    setGameState(prev => ({ ...prev, status: 'PLAYING' }));
  }, []);

  const resetGame = useCallback(() => {
    setGameState(getInitialState());
  }, []);

  // Game loop (step-based)
  useEffect(() => {
    let timeoutId: any;

    const step = () => {
      if (stateRef.current.status !== 'PLAYING' || paused) {
        timeoutId = setTimeout(step, 100);
        return;
      }
      const current = stateRef.current;
      const effectiveSpeed = current.boosting
        ? Math.max(current.speed * 0.5, 40)
        : current.speed;

      const { snake, nextDir, food, particles } = current;
      const dir = nextDir;

      // Move head
      const head = snake[0];
      let newHead: Segment;
      switch (dir) {
        case 'UP': newHead = { x: head.x, y: head.y - 1 }; break;
        case 'DOWN': newHead = { x: head.x, y: head.y + 1 }; break;
        case 'LEFT': newHead = { x: head.x - 1, y: head.y }; break;
        case 'RIGHT': newHead = { x: head.x + 1, y: head.y }; break;
      }

      // Wall collision
      if (newHead.x < 0 || newHead.x >= GAME_CONFIG.COLS ||
        newHead.y < 0 || newHead.y >= GAME_CONFIG.ROWS) {
        setGameState(prev => ({ ...prev, status: 'GAME_OVER' }));
        return;
      }

      // Self collision
      if (snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
        setGameState(prev => ({ ...prev, status: 'GAME_OVER' }));
        return;
      }

      // Eat food?
      const ate = newHead.x === food.x && newHead.y === food.y;
      const newSnake = [newHead, ...snake];
      if (!ate) newSnake.pop(); // don't grow if not eating

      let newFood = food;
      let newScore = current.score;
      let newSpeed = current.speed;
      const newParticles = [...particles];

      if (ate) {
        newScore += food.special ? GAME_CONFIG.SCORE_PER_FOOD * 3 : GAME_CONFIG.SCORE_PER_FOOD;
        newFood = randomFood(newSnake);
        newSpeed = Math.max(GAME_CONFIG.MIN_SPEED, current.speed - GAME_CONFIG.SPEED_INCREASE);

        // Spawn food particles
        const colors = food.special
          ? ['#fbbf24', '#f59e0b', '#fde047', '#fff']
          : ['#4ade80', '#22c55e', '#86efac', '#fff'];
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI * 2 * i) / 10;
          const speed = Math.random() * 3 + 1;
          newParticles.push({
            id: uuidv4(),
            x: food.x * GAME_CONFIG.CELL + GAME_CONFIG.CELL / 2,
            y: food.y * GAME_CONFIG.CELL + GAME_CONFIG.CELL / 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            color: colors[Math.floor(Math.random() * colors.length)]
          });
        }
      }

      // Age particles
      const agedParticles = newParticles
        .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.06 }))
        .filter(p => p.life > 0);

      setGameState(prev => ({
        ...prev,
        snake: newSnake,
        dir,
        food: newFood,
        particles: agedParticles,
        score: newScore,
        speed: newSpeed
      }));

      timeoutId = setTimeout(step, effectiveSpeed);
    };

    timeoutId = setTimeout(step, stateRef.current.speed);
    return () => clearTimeout(timeoutId);
  }, [paused]);

  return { gameState, updateGyro, setBoost, startGame, resetGame };
}

interface Props {
  socket: Socket;
  roomId: string;
  onExit?: () => void;
  paused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onScoreChange?: (score: number) => void;
  onStatusChange?: (status: any) => void;
  settings?: any;
}

export default function Game4({ socket, roomId, paused = false, onPause, onResume, onScoreChange, onStatusChange }: Props) {
  const { gameState, updateGyro, setBoost, startGame, resetGame } = useGameLogic(paused);
  const { snake, food, particles, status, score, dir, boosting } = gameState;

  useEffect(() => { if (onScoreChange) onScoreChange(score); }, [score, onScoreChange]);
  useEffect(() => { if (onStatusChange) onStatusChange(status); }, [status, onStatusChange]);

  useEffect(() => {
    const handleGyro = (data: GyroData) => updateGyro(data);
    const handleAction = (payload: any) => {
      const action = typeof payload === 'string' ? payload : payload.action;
      if (action === 'boost-start') setBoost(true);
      if (action === 'boost-end') setBoost(false);
      if (action === 'start-game') startGame();
      if (action === 'restart-game') resetGame();
      if (action === 'pause') onPause?.();
      if (action === 'resume') onResume?.();
      // D-pad fallback
      if (action === 'dir-up') setGameState_dir('UP');
      if (action === 'dir-down') setGameState_dir('DOWN');
      if (action === 'dir-left') setGameState_dir('LEFT');
      if (action === 'dir-right') setGameState_dir('RIGHT');
    };
    socket.on('update-game-state', handleGyro);
    socket.on('controller-action', handleAction);
    socket.emit('sync-game-status', { roomId, status });
    return () => {
      socket.off('update-game-state');
      socket.off('controller-action');
    };
  }, [socket, updateGyro, setBoost, startGame, resetGame, status, onPause, onResume, roomId]);

  // Allow d-pad direction changes
  const setGameState_dir = useCallback((newDir: Dir) => {
    // Will be set via game state for next step
  }, []);

  const dirArrow = { UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→' }[dir];

  return (
    <div className="relative w-full h-screen overflow-hidden flex items-center justify-center font-mono select-none"
      style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #0d1b2a 50%, #0a1628 100%)' }}>

      {/* Direction indicator */}
      {status === 'PLAYING' && (
        <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-20 text-2xl font-black px-4 py-1 rounded-full border transition-all ${boosting ? 'text-yellow-300 border-yellow-500/50 bg-yellow-900/30 scale-125' : 'text-green-400 border-green-500/30 bg-green-900/20'}`}>
          {dirArrow} {boosting && '⚡BOOST'}
        </div>
      )}

      <div className="relative"
        style={{
          width: GAME_CONFIG.WIDTH,
          height: GAME_CONFIG.HEIGHT,
          background: 'rgba(0,20,10,0.8)',
          border: '2px solid rgba(74,222,128,0.3)',
          boxShadow: '0 0 40px rgba(74,222,128,0.1), inset 0 0 40px rgba(0,0,0,0.5)'
        }}>

        {/* Grid lines */}
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `linear-gradient(rgba(74,222,128,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(74,222,128,0.5) 1px, transparent 1px)`,
            backgroundSize: `${GAME_CONFIG.CELL}px ${GAME_CONFIG.CELL}px`
          }} />

        {/* Food */}
        <div className={`absolute rounded-full flex items-center justify-center font-bold transition-transform`}
          style={{
            left: food.x * GAME_CONFIG.CELL + 2,
            top: food.y * GAME_CONFIG.CELL + 2,
            width: GAME_CONFIG.CELL - 4,
            height: GAME_CONFIG.CELL - 4,
            background: food.special
              ? 'radial-gradient(circle, #fde047, #f59e0b)'
              : 'radial-gradient(circle, #86efac, #22c55e)',
            boxShadow: food.special
              ? '0 0 20px rgba(245,158,11,0.9)'
              : '0 0 15px rgba(74,222,128,0.8)',
            animation: 'pulse 1s infinite',
            fontSize: 14
          }}>
          {food.special ? '★' : '●'}
        </div>

        {/* Snake */}
        {snake.map((seg, i) => {
          const isHead = i === 0;
          const progress = i / snake.length;
          const hue = 120 + progress * 40; // green gradient from head to tail
          const lightness = isHead ? 70 : 45 - progress * 15;
          return (
            <div key={`${seg.x}-${seg.y}-${i}`}
              className={`absolute ${isHead ? 'rounded-md' : 'rounded-sm'}`}
              style={{
                left: seg.x * GAME_CONFIG.CELL + 1,
                top: seg.y * GAME_CONFIG.CELL + 1,
                width: GAME_CONFIG.CELL - 2,
                height: GAME_CONFIG.CELL - 2,
                backgroundColor: `hsl(${hue}, 80%, ${lightness}%)`,
                boxShadow: isHead ? `0 0 12px hsl(${hue}, 80%, 60%)` : undefined,
                transition: 'all 0.05s linear'
              }}>
              {isHead && (
                <>
                  <div className="absolute w-2 h-2 rounded-full bg-white/80"
                    style={{ top: dir === 'UP' || dir === 'DOWN' ? 4 : '30%', left: dir === 'LEFT' || dir === 'RIGHT' ? 4 : '20%' }} />
                  <div className="absolute w-2 h-2 rounded-full bg-white/80"
                    style={{ top: dir === 'UP' || dir === 'DOWN' ? 4 : '30%', right: dir === 'LEFT' || dir === 'RIGHT' ? 4 : '20%' }} />
                </>
              )}
            </div>
          );
        })}

        {/* Particles */}
        {particles.map(p => (
          <div key={p.id} className="absolute rounded-full pointer-events-none"
            style={{
              width: 6, height: 6,
              left: p.x - 3, top: p.y - 3,
              backgroundColor: p.color,
              opacity: p.life,
              boxShadow: `0 0 4px ${p.color}`
            }} />
        ))}
      </div>

      <style>{`@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }`}</style>
    </div>
  );
}
