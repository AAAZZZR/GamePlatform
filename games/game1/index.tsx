// games/game1/index.tsx — Rocket Shooter (Enhanced)
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { GyroData } from '@/types/game';

// ==========================================
// 1. Configuration
// ==========================================
const GAME_CONFIG = {
  WIDTH: 800,
  HEIGHT: 600,
  PLAYER_SIZE: 50,
  PLAYER_SPEED: 15,
  BULLET_W: 6,
  BULLET_H: 22,
  BULLET_SPEED: 20,
  INITIAL_FIRE_RATE: 700,
  MIN_FIRE_RATE: 120,
  OBSTACLE_SIZE: 42,
  INITIAL_OBSTACLE_SPEED: 2,
  SPAWN_RATE: 280,
  POWERUP_SIZE: 30,
  POWERUP_SPEED: 4,
  POWERUP_CHANCE: 0.15,
  SCORE_PER_HIT: 100,
  // Stars
  STAR_COUNT: 80,
};

// ==========================================
// 2. Types
// ==========================================
interface Entity {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
  type?: string;
}

interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0..1
  color: string;
}

interface Star {
  id: string;
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
}

interface Player extends Entity {
  score: number;
}

interface GameState {
  player: Player;
  bullets: Entity[];
  obstacles: Entity[];
  powerUps: Entity[];
  particles: Particle[];
  stars: Star[];
  status: 'READY' | 'PLAYING' | 'GAME_OVER';
  fireRate: number;
  startTime: number;
}

// ==========================================
// 3. Logic Hook
// ==========================================
function useGameLogic(paused: boolean = false) {
  const createStars = (): Star[] =>
    Array.from({ length: GAME_CONFIG.STAR_COUNT }, () => ({
      id: uuidv4(),
      x: Math.random() * GAME_CONFIG.WIDTH - GAME_CONFIG.WIDTH / 2,
      y: Math.random() * GAME_CONFIG.HEIGHT - GAME_CONFIG.HEIGHT / 2,
      size: Math.random() * 2.5 + 0.5,
      speed: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.7 + 0.3,
    }));

  const getInitialState = (): GameState => ({
    player: {
      id: 'p1', x: 0, y: 0,
      width: GAME_CONFIG.PLAYER_SIZE,
      height: GAME_CONFIG.PLAYER_SIZE,
      active: true, score: 0
    },
    bullets: [],
    obstacles: [],
    powerUps: [],
    particles: [],
    stars: createStars(),
    status: 'READY',
    fireRate: GAME_CONFIG.INITIAL_FIRE_RATE,
    startTime: 0
  });

  const [gameState, setGameState] = useState<GameState>(getInitialState());
  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  const inputRef = useRef({ moveX: 0, moveY: 0, isFiring: false });
  const lastFireTimeRef = useRef(0);

  const updateGyro = useCallback((data: GyroData) => {
    if (data.beta !== null && data.gamma !== null) {
      inputRef.current.moveX = (data.gamma / 30) * GAME_CONFIG.PLAYER_SPEED;
      inputRef.current.moveY = (data.beta / 30) * GAME_CONFIG.PLAYER_SPEED;
    }
  }, []);

  const setFiring = useCallback((firing: boolean) => {
    inputRef.current.isFiring = firing;
  }, []);

  const startGame = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      status: 'PLAYING',
      startTime: Date.now(),
      fireRate: GAME_CONFIG.INITIAL_FIRE_RATE
    }));
    lastFireTimeRef.current = 0;
  }, []);

  const resetGame = useCallback(() => {
    setGameState(getInitialState());
  }, []);

  useEffect(() => {
    let loopId: number;
    let spawnTimer = 0;

    const loop = () => {
      if (stateRef.current.status === 'PLAYING' && !paused) {
        const current = stateRef.current;
        const input = inputRef.current;
        const now = Date.now();

        const gameTime = (now - current.startTime) / 1000;
        const difficultyLevel = Math.floor(gameTime / 10);
        const currentObstacleSpeed = GAME_CONFIG.INITIAL_OBSTACLE_SPEED + difficultyLevel * 0.6;
        const currentSpawnRate = Math.max(150, GAME_CONFIG.SPAWN_RATE - difficultyLevel * 25);

        // Player movement
        let newPx = current.player.x + input.moveX;
        let newPy = current.player.y + input.moveY;
        const limitX = GAME_CONFIG.WIDTH / 2 - GAME_CONFIG.PLAYER_SIZE / 2;
        const limitY = GAME_CONFIG.HEIGHT / 2 - GAME_CONFIG.PLAYER_SIZE / 2;
        newPx = Math.max(-limitX, Math.min(limitX, newPx));
        newPy = Math.max(-limitY, Math.min(limitY, newPy));

        // Bullets
        const newBullets = [...current.bullets];
        if (input.isFiring && now - lastFireTimeRef.current >= current.fireRate) {
          newBullets.push({
            id: uuidv4(),
            x: newPx,
            y: newPy - 30,
            width: GAME_CONFIG.BULLET_W,
            height: GAME_CONFIG.BULLET_H,
            active: true
          });
          lastFireTimeRef.current = now;
        }
        for (let b of newBullets) {
          b.y -= GAME_CONFIG.BULLET_SPEED;
          if (b.y < -GAME_CONFIG.HEIGHT / 2) b.active = false;
        }

        // Spawn
        spawnTimer += 16;
        const newObstacles = [...current.obstacles];
        const newPowerUps = [...current.powerUps];
        if (spawnTimer > currentSpawnRate) {
          spawnTimer = 0;
          const randomX = Math.random() * GAME_CONFIG.WIDTH - GAME_CONFIG.WIDTH / 2;
          if (Math.random() < GAME_CONFIG.POWERUP_CHANCE) {
            newPowerUps.push({
              id: uuidv4(), x: randomX,
              y: -GAME_CONFIG.HEIGHT / 2 - 50,
              width: GAME_CONFIG.POWERUP_SIZE,
              height: GAME_CONFIG.POWERUP_SIZE,
              active: true, type: 'POWERUP_RATE'
            });
          } else {
            newObstacles.push({
              id: uuidv4(), x: randomX,
              y: -GAME_CONFIG.HEIGHT / 2 - 50,
              width: GAME_CONFIG.OBSTACLE_SIZE + (Math.random() * 20 - 10),
              height: GAME_CONFIG.OBSTACLE_SIZE + (Math.random() * 20 - 10),
              active: true, type: 'METEOR'
            });
          }
        }

        for (let o of newObstacles) {
          o.y += currentObstacleSpeed;
          if (o.y > GAME_CONFIG.HEIGHT / 2) o.active = false;
        }
        for (let p of newPowerUps) {
          p.y += GAME_CONFIG.POWERUP_SPEED;
          if (p.y > GAME_CONFIG.HEIGHT / 2) p.active = false;
        }

        // Stars scrolling
        const newStars = current.stars.map(s => {
          let ny = s.y + s.speed * (1 + currentObstacleSpeed * 0.3);
          if (ny > GAME_CONFIG.HEIGHT / 2) ny = -GAME_CONFIG.HEIGHT / 2;
          return { ...s, y: ny };
        });

        // Collisions
        let scoreToAdd = 0;
        let isGameOver = false;
        let newFireRate = current.fireRate;
        const newParticles = [...current.particles];

        // Bullet vs meteor
        for (let b of newBullets) {
          if (!b.active) continue;
          for (let o of newObstacles) {
            if (!o.active) continue;
            if (b.x < o.x + o.width && b.x + b.width > o.x &&
              b.y < o.y + o.height && b.height + b.y > o.y) {
              b.active = false;
              o.active = false;
              scoreToAdd += GAME_CONFIG.SCORE_PER_HIT;
              // Spawn explosion particles
              const colors = ['#f97316', '#ef4444', '#fbbf24', '#fb923c', '#fff'];
              for (let i = 0; i < 12; i++) {
                const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
                const speed = Math.random() * 4 + 2;
                newParticles.push({
                  id: uuidv4(),
                  x: o.x, y: o.y,
                  vx: Math.cos(angle) * speed,
                  vy: Math.sin(angle) * speed,
                  life: 1,
                  color: colors[Math.floor(Math.random() * colors.length)]
                });
              }
            }
          }
        }

        // Player vs meteor
        const playerRect = { ...current.player, x: newPx, y: newPy };
        for (let o of newObstacles) {
          if (o.active &&
            playerRect.x < o.x + o.width && playerRect.x + playerRect.width > o.x &&
            playerRect.y < o.y + o.height && playerRect.height + playerRect.y > o.y) {
            isGameOver = true;
          }
        }

        // Player vs powerup
        for (let p of newPowerUps) {
          if (p.active &&
            playerRect.x < p.x + p.width && playerRect.x + playerRect.width > p.x &&
            playerRect.y < p.y + p.height && playerRect.height + playerRect.y > p.y) {
            p.active = false;
            scoreToAdd += 500;
            newFireRate = Math.max(GAME_CONFIG.MIN_FIRE_RATE, newFireRate * 0.9);
          }
        }

        // Age particles
        for (let p of newParticles) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.1; // gravity
          p.life -= 0.04;
        }

        setGameState(prev => ({
          ...prev,
          status: isGameOver ? 'GAME_OVER' : 'PLAYING',
          player: { ...prev.player, x: newPx, y: newPy, score: prev.player.score + scoreToAdd },
          bullets: newBullets.filter(b => b.active),
          obstacles: newObstacles.filter(o => o.active),
          powerUps: newPowerUps.filter(p => p.active),
          particles: newParticles.filter(p => p.life > 0),
          stars: newStars,
          fireRate: newFireRate
        }));
      }
      loopId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(loopId);
  }, [paused]);

  return { gameState, updateGyro, setFiring, startGame, resetGame };
}

// ==========================================
// 4. View
// ==========================================
interface Props {
  socket: Socket;
  roomId: string;
  onExit: () => void;
  paused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onScoreChange?: (score: number) => void;
  onStatusChange?: (status: any) => void;
  settings?: any;
}

export default function Game1({ socket, roomId, onExit, paused = false, onPause, onResume, onScoreChange, onStatusChange }: Props) {
  const { gameState, updateGyro, setFiring, startGame, resetGame } = useGameLogic(paused);
  const { player, bullets, obstacles, powerUps, particles, stars, status } = gameState;

  useEffect(() => { if (onScoreChange) onScoreChange(player.score); }, [player.score, onScoreChange]);
  useEffect(() => { if (onStatusChange) onStatusChange(status); }, [status, onStatusChange]);

  useEffect(() => {
    const handleGyro = (data: GyroData) => updateGyro(data);
    const handleAction = (payload: any) => {
      const action = typeof payload === 'string' ? payload : payload.action;
      if (action === 'fire-start') setFiring(true);
      if (action === 'fire-end') setFiring(false);
      if (action === 'shoot') setFiring(true);
      if (action === 'start-game') startGame();
      if (action === 'pause') onPause?.();
      if (action === 'resume') onResume?.();
      if (action === 'restart-game') resetGame();
    };
    socket.on('update-game-state', handleGyro);
    socket.on('controller-action', handleAction);
    socket.emit('sync-game-status', { roomId, status });
    return () => {
      socket.off('update-game-state');
      socket.off('controller-action');
    };
  }, [socket, updateGyro, setFiring, startGame, resetGame, status, onPause, onResume, roomId]);

  const gameTime = status === 'PLAYING' ? (Date.now() - gameState.startTime) / 1000 : 0;
  const difficultyLevel = Math.floor(gameTime / 10);

  return (
    <div className="relative w-full h-screen overflow-hidden flex items-center justify-center font-mono select-none"
      style={{ background: 'linear-gradient(180deg, #050815 0%, #0f0f2e 50%, #1a0a2e 100%)' }}>

      {/* Difficulty indicator */}
      {status === 'PLAYING' && difficultyLevel > 0 && (
        <div className="absolute top-4 right-4 z-20 text-xs font-bold text-purple-400 bg-purple-900/40 px-3 py-1 rounded-full border border-purple-500/30">
          LVL {difficultyLevel + 1}
        </div>
      )}

      <div className="relative w-full h-full">
        {/* Stars */}
        {stars.map(s => (
          <div key={s.id} className="absolute rounded-full bg-white"
            style={{
              width: s.size, height: s.size,
              left: '50%', top: '50%',
              transform: `translate(${s.x}px, ${s.y}px)`,
              opacity: s.opacity
            }} />
        ))}

        {/* Bullets */}
        {bullets.map(b => (
          <div key={b.id}
            className="absolute rounded-full"
            style={{
              width: b.width, height: b.height,
              left: '50%', top: '50%',
              transform: `translate(${b.x - b.width / 2}px, ${b.y - b.height / 2}px)`,
              background: 'linear-gradient(180deg, #fff 0%, #fde047 50%, #f97316 100%)',
              boxShadow: '0 0 12px rgba(253,224,71,0.9)'
            }} />
        ))}

        {/* Meteors */}
        {obstacles.map(o => (
          <div key={o.id}
            className="absolute rounded-full"
            style={{
              width: o.width, height: o.height,
              left: '50%', top: '50%',
              transform: `translate(${o.x - o.width / 2}px, ${o.y - o.height / 2}px) rotate(${o.y * 2}deg)`,
              background: 'radial-gradient(circle at 35% 35%, #f97316, #7c2d12)',
              boxShadow: '0 0 8px rgba(249,115,22,0.6), inset -4px -4px 8px rgba(0,0,0,0.5)'
            }}>
            <div className="absolute inset-0 rounded-full opacity-30"
              style={{ background: 'radial-gradient(circle at 70% 70%, rgba(255,255,255,0.3), transparent)' }} />
          </div>
        ))}

        {/* PowerUps */}
        {powerUps.map(p => (
          <div key={p.id}
            className="absolute rounded-full animate-pulse"
            style={{
              width: p.width, height: p.height,
              left: '50%', top: '50%',
              transform: `translate(${p.x - p.width / 2}px, ${p.y - p.height / 2}px)`,
              background: 'radial-gradient(circle, #4ade80, #16a34a)',
              boxShadow: '0 0 20px rgba(74,222,128,0.9)',
              border: '2px solid rgba(187,247,208,0.8)'
            }}>
            <div className="flex items-center justify-center w-full h-full text-white font-bold text-xs">⚡</div>
          </div>
        ))}

        {/* Explosion Particles */}
        {particles.map(p => (
          <div key={p.id}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 6, height: 6,
              left: '50%', top: '50%',
              transform: `translate(${p.x - 3}px, ${p.y - 3}px)`,
              backgroundColor: p.color,
              opacity: p.life,
              boxShadow: `0 0 4px ${p.color}`
            }} />
        ))}

        {/* Player Ship */}
        <div
          className="absolute z-10"
          style={{
            width: player.width, height: player.height,
            left: '50%', top: '50%',
            transform: `translate(${player.x - player.width / 2}px, ${player.y - player.height / 2}px)`,
          }}>
          {/* Engine glow */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3"
            style={{ height: 20, background: 'linear-gradient(180deg, #f97316, transparent)', filter: 'blur(4px)', bottom: -16 }} />
          {/* Ship body */}
          <div className="w-full h-full"
            style={{
              clipPath: 'polygon(50% 0%, 15% 100%, 50% 80%, 85% 100%)',
              background: 'linear-gradient(180deg, #67e8f9 0%, #0891b2 50%, #164e63 100%)',
              filter: 'drop-shadow(0 0 12px rgba(34,211,238,0.8))'
            }} />
        </div>
      </div>
    </div>
  );
}
