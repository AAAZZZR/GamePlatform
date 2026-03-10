// games/game5/index.tsx — Asteroid Dodge 🌌
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { GyroData } from '@/types/game';

const GAME_CONFIG = {
  WIDTH: 800,
  HEIGHT: 600,
  SHIP_W: 44,
  SHIP_H: 54,
  PLAYER_SPEED: 12,
  INITIAL_ASTEROID_SPEED: 3,
  SCROLL_SPEED: 2,
  COIN_SIZE: 22,
  COIN_SCORE: 25,
  STAR_COUNT: 60,
  DASH_DISTANCE: 120,
  DASH_COOLDOWN: 1500,
};

interface Entity {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
  type?: string;
  speed?: number;
  rotation?: number;
  rotationSpeed?: number;
}

interface Star { id: string; x: number; y: number; size: number; speed: number; }
interface Particle { id: string; x: number; y: number; vx: number; vy: number; life: number; color: string; }

interface GameState {
  playerX: number;
  asteroids: Entity[];
  coins: Entity[];
  stars: Star[];
  particles: Particle[];
  shield: number;     // 0 = none, 1 = active
  slowmo: boolean;
  magnet: boolean;
  status: 'READY' | 'PLAYING' | 'GAME_OVER';
  score: number;
  coinsCollected: number;
  gameTime: number;
  dashCooldown: number;   // ms remaining
  lastDashTime: number;
}

function createStars(): Star[] {
  return Array.from({ length: GAME_CONFIG.STAR_COUNT }, () => ({
    id: uuidv4(),
    x: Math.random() * GAME_CONFIG.WIDTH,
    y: Math.random() * GAME_CONFIG.HEIGHT,
    size: Math.random() * 2 + 0.5,
    speed: Math.random() * 1.5 + 0.5
  }));
}

function useGameLogic(paused: boolean = false) {
  const getInitialState = (): GameState => ({
    playerX: GAME_CONFIG.WIDTH / 2,
    asteroids: [],
    coins: [],
    stars: createStars(),
    particles: [],
    shield: 0,
    slowmo: false,
    magnet: false,
    status: 'READY',
    score: 0,
    coinsCollected: 0,
    gameTime: 0,
    dashCooldown: 0,
    lastDashTime: 0
  });

  const [gameState, setGameState] = useState<GameState>(getInitialState());
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const inputRef = useRef({ moveX: 0, shield: false, dashDir: 0 });
  const frameTimeRef = useRef(Date.now());

  const updateGyro = useCallback((data: GyroData) => {
    if (data.gamma !== null)
      inputRef.current.moveX = (data.gamma / 30) * GAME_CONFIG.PLAYER_SPEED;
  }, []);

  const activateShield = useCallback(() => {
    setGameState(prev => {
      if (prev.shield > 0) return prev;
      return { ...prev, shield: 1 };
    });
    setTimeout(() => setGameState(prev => ({ ...prev, shield: 0 })), 4000);
  }, []);

  const triggerDash = useCallback((direction: number) => {
    setGameState(prev => {
      const now = Date.now();
      if (now - prev.lastDashTime < GAME_CONFIG.DASH_COOLDOWN) return prev;
      const newX = Math.max(GAME_CONFIG.SHIP_W / 2, Math.min(
        GAME_CONFIG.WIDTH - GAME_CONFIG.SHIP_W / 2,
        prev.playerX + direction * GAME_CONFIG.DASH_DISTANCE
      ));
      return { ...prev, playerX: newX, lastDashTime: now, dashCooldown: GAME_CONFIG.DASH_COOLDOWN };
    });
    if (navigator.vibrate) navigator.vibrate(40);
  }, []);

  const startGame = useCallback(() => {
    setGameState(prev => ({ ...prev, status: 'PLAYING' }));
  }, []);

  const resetGame = useCallback(() => {
    setGameState(getInitialState());
    frameTimeRef.current = Date.now();
  }, []);

  useEffect(() => {
    let loopId: number;
    let spawnCounter = 0;

    const loop = () => {
      if (stateRef.current.status === 'PLAYING' && !paused) {
        const current = stateRef.current;
        const input = inputRef.current;
        const now = Date.now();
        const dt = Math.min(now - frameTimeRef.current, 33);
        frameTimeRef.current = now;

        const difficultyLevel = Math.floor(current.gameTime / 15);
        const asteroidSpeed = GAME_CONFIG.INITIAL_ASTEROID_SPEED + difficultyLevel * 0.4;
        const slowFactor = current.slowmo ? 0.5 : 1;

        // Player movement
        let newX = current.playerX + input.moveX * slowFactor;
        newX = Math.max(GAME_CONFIG.SHIP_W / 2, Math.min(GAME_CONFIG.WIDTH - GAME_CONFIG.SHIP_W / 2, newX));

        // Stars
        const newStars = current.stars.map(s => {
          let ny = s.y + s.speed * slowFactor;
          if (ny > GAME_CONFIG.HEIGHT) ny = -10;
          return { ...s, y: ny };
        });

        // Spawn asteroids & coins
        spawnCounter += dt;
        const newAsteroids = [...current.asteroids];
        const newCoins = [...current.coins];
        const spawnInterval = Math.max(800 - difficultyLevel * 60, 300);

        if (spawnCounter > spawnInterval) {
          spawnCounter = 0;
          const numToSpawn = 1 + Math.floor(difficultyLevel / 3);
          for (let i = 0; i < numToSpawn; i++) {
            const x = Math.random() * (GAME_CONFIG.WIDTH - 60) + 30;
            const size = Math.random() * 30 + 30;
            newAsteroids.push({
              id: uuidv4(), x, y: -size,
              width: size, height: size, active: true,
              speed: (Math.random() * 2 + asteroidSpeed) * slowFactor,
              rotation: 0,
              rotationSpeed: (Math.random() - 0.5) * 4
            });
          }
          if (Math.random() < 0.4) {
            newCoins.push({
              id: uuidv4(),
              x: Math.random() * (GAME_CONFIG.WIDTH - 40) + 20,
              y: -GAME_CONFIG.COIN_SIZE,
              width: GAME_CONFIG.COIN_SIZE, height: GAME_CONFIG.COIN_SIZE,
              active: true,
              speed: 3 * slowFactor
            });
          }
        }

        // Move asteroids
        for (const a of newAsteroids) {
          a.y += (a.speed || asteroidSpeed) * slowFactor;
          a.rotation = (a.rotation || 0) + (a.rotationSpeed || 0);
          if (a.y > GAME_CONFIG.HEIGHT + 60) a.active = false;
        }

        // Move coins (magnet attraction)
        for (const c of newCoins) {
          if (current.magnet) {
            const dx = newX - c.x;
            c.x += dx * 0.1;
            c.y += (c.speed || 3);
          } else {
            c.y += (c.speed || 3) * slowFactor;
          }
          if (c.y > GAME_CONFIG.HEIGHT + 30) c.active = false;
        }

        // Collisions
        let isGameOver = false;
        let coinsAdd = 0;
        const newParticles = [...current.particles];
        const playerLeft = newX - GAME_CONFIG.SHIP_W / 2;
        const playerRight = newX + GAME_CONFIG.SHIP_W / 2;
        const playerTop = GAME_CONFIG.HEIGHT - 80 - GAME_CONFIG.SHIP_H / 2;
        const playerBot = GAME_CONFIG.HEIGHT - 80 + GAME_CONFIG.SHIP_H / 2;

        for (const a of newAsteroids) {
          if (!a.active) continue;
          if (a.x + a.width / 2 > playerLeft && a.x - a.width / 2 < playerRight &&
            a.y + a.height / 2 > playerTop && a.y - a.height / 2 < playerBot) {
            a.active = false;
            if (current.shield > 0) {
              // Shield absorbs hit
              setGameState(prev => ({ ...prev, shield: 0 }));
              // Shockwave particles
              for (let i = 0; i < 16; i++) {
                const angle = (Math.PI * 2 * i) / 16;
                const spd = Math.random() * 5 + 2;
                newParticles.push({ id: uuidv4(), x: newX, y: GAME_CONFIG.HEIGHT - 80, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, life: 1, color: '#67e8f9' });
              }
            } else {
              // Explosion
              for (let i = 0; i < 14; i++) {
                const angle = (Math.PI * 2 * i) / 14;
                const spd = Math.random() * 4 + 2;
                newParticles.push({ id: uuidv4(), x: newX, y: GAME_CONFIG.HEIGHT - 80, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, life: 1, color: ['#f97316', '#ef4444', '#fbbf24', '#fff'][Math.floor(Math.random() * 4)] });
              }
              isGameOver = true;
            }
          }
        }

        // Coin collection
        for (const c of newCoins) {
          if (!c.active) continue;
          if (c.x + c.width / 2 > playerLeft && c.x - c.width / 2 < playerRight &&
            c.y + c.height / 2 > playerTop && c.y - c.height / 2 < playerBot) {
            c.active = false;
            coinsAdd++;
            // Sparkle
            for (let i = 0; i < 6; i++) {
              const angle = (Math.PI * 2 * i) / 6;
              newParticles.push({ id: uuidv4(), x: c.x, y: c.y, vx: Math.cos(angle) * 2, vy: Math.sin(angle) * 2, life: 1, color: '#fde047' });
            }
          }
        }

        // Age particles
        for (const p of newParticles) { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.04; }

        const newDashCooldown = Math.max(0, current.dashCooldown - dt);

        setGameState(prev => ({
          ...prev,
          playerX: newX,
          asteroids: newAsteroids.filter(a => a.active),
          coins: newCoins.filter(c => c.active),
          stars: newStars,
          particles: newParticles.filter(p => p.life > 0),
          status: isGameOver ? 'GAME_OVER' : 'PLAYING',
          score: Math.floor(prev.gameTime * 10) + (prev.coinsCollected + coinsAdd) * GAME_CONFIG.COIN_SCORE,
          coinsCollected: prev.coinsCollected + coinsAdd,
          gameTime: prev.gameTime + dt / 1000,
          dashCooldown: newDashCooldown
        }));
      }
      loopId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(loopId);
  }, [paused]);

  return { gameState, updateGyro, activateShield, triggerDash, startGame, resetGame };
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

export default function Game5({ socket, roomId, paused = false, onPause, onResume, onScoreChange, onStatusChange }: Props) {
  const { gameState, updateGyro, activateShield, triggerDash, startGame, resetGame } = useGameLogic(paused);
  const { playerX, asteroids, coins, stars, particles, shield, status, score, coinsCollected, dashCooldown, gameTime } = gameState;

  useEffect(() => { if (onScoreChange) onScoreChange(score); }, [score, onScoreChange]);
  useEffect(() => { if (onStatusChange) onStatusChange(status); }, [status, onStatusChange]);

  useEffect(() => {
    const handleGyro = (data: GyroData) => updateGyro(data);
    const handleAction = (payload: any) => {
      const action = typeof payload === 'string' ? payload : payload.action;
      if (action === 'shield') activateShield();
      if (action === 'dash-left') triggerDash(-1);
      if (action === 'dash-right') triggerDash(1);
      if (action === 'start-game') startGame();
      if (action === 'restart-game') resetGame();
      if (action === 'pause') onPause?.();
      if (action === 'resume') onResume?.();
    };
    socket.on('update-game-state', handleGyro);
    socket.on('controller-action', handleAction);
    socket.emit('sync-game-status', { roomId, status });
    return () => {
      socket.off('update-game-state');
      socket.off('controller-action');
    };
  }, [socket, updateGyro, activateShield, triggerDash, startGame, resetGame, status, onPause, onResume, roomId]);

  const difficultyLevel = Math.floor(gameTime / 15);

  return (
    <div className="relative w-full h-screen overflow-hidden flex items-center justify-center font-mono select-none"
      style={{ background: '#000814' }}>

      {/* HUD */}
      {status === 'PLAYING' && (
        <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-1">
          <div className="text-yellow-400 text-sm font-bold bg-yellow-900/30 px-3 py-1 rounded-full border border-yellow-500/30">
            🪙 {coinsCollected}
          </div>
          {difficultyLevel > 0 && (
            <div className="text-purple-400 text-xs font-bold bg-purple-900/30 px-2 py-1 rounded-full border border-purple-500/30">
              LVL {difficultyLevel + 1}
            </div>
          )}
        </div>
      )}

      <div className="relative overflow-hidden"
        style={{ width: GAME_CONFIG.WIDTH, height: GAME_CONFIG.HEIGHT, background: '#000814' }}>

        {/* Stars */}
        {stars.map(s => (
          <div key={s.id} className="absolute rounded-full bg-white"
            style={{ width: s.size, height: s.size, left: s.x, top: s.y, opacity: 0.6 }} />
        ))}

        {/* Nebula background glow */}
        <div className="absolute pointer-events-none"
          style={{
            left: playerX - 200, top: GAME_CONFIG.HEIGHT - 300,
            width: 400, height: 300,
            background: 'radial-gradient(circle, rgba(99,102,241,0.05), transparent)',
            transition: 'left 0.1s ease'
          }} />

        {/* Coins */}
        {coins.map(c => (
          <div key={c.id}
            className="absolute rounded-full flex items-center justify-center font-bold text-xs"
            style={{
              left: c.x - c.width / 2, top: c.y,
              width: c.width, height: c.height,
              background: 'radial-gradient(circle, #fde047, #f59e0b)',
              boxShadow: '0 0 12px rgba(245,158,11,0.8)',
              border: '2px solid rgba(253,224,71,0.8)'
            }}>
            $
          </div>
        ))}

        {/* Asteroids */}
        {asteroids.map(a => (
          <div key={a.id}
            className="absolute rounded-full"
            style={{
              left: a.x - a.width / 2, top: a.y - a.height / 2,
              width: a.width, height: a.height,
              background: 'radial-gradient(circle at 35% 35%, #78716c, #292524)',
              boxShadow: '0 0 8px rgba(120,113,108,0.5), inset -4px -4px 8px rgba(0,0,0,0.6)',
              transform: `rotate(${a.rotation}deg)`
            }}>
            <div className="absolute inset-0 rounded-full opacity-20"
              style={{ background: 'radial-gradient(circle at 70% 70%, rgba(255,255,255,0.3), transparent)' }} />
          </div>
        ))}

        {/* Particles */}
        {particles.map(p => (
          <div key={p.id} className="absolute rounded-full pointer-events-none"
            style={{
              width: 5, height: 5,
              left: p.x - 2.5, top: p.y - 2.5,
              backgroundColor: p.color,
              opacity: p.life,
              boxShadow: `0 0 4px ${p.color}`
            }} />
        ))}

        {/* Player Spaceship */}
        <div className="absolute z-10"
          style={{
            left: playerX - GAME_CONFIG.SHIP_W / 2,
            top: GAME_CONFIG.HEIGHT - 80 - GAME_CONFIG.SHIP_H / 2,
            width: GAME_CONFIG.SHIP_W,
            height: GAME_CONFIG.SHIP_H,
            transition: 'left 0.03s linear'
          }}>
          {/* Shield ring */}
          {shield > 0 && (
            <div className="absolute rounded-full animate-ping"
              style={{
                inset: -14,
                border: '3px solid rgba(103,232,249,0.7)',
                boxShadow: '0 0 20px rgba(103,232,249,0.5)'
              }} />
          )}
          {/* Engine glow */}
          <div className="absolute"
            style={{
              bottom: -18, left: '50%', transform: 'translateX(-50%)',
              width: 16, height: 24,
              background: 'linear-gradient(180deg, #f97316, transparent)',
              filter: 'blur(5px)'
            }} />
          {/* Ship body */}
          <div className="w-full h-full"
            style={{
              clipPath: 'polygon(50% 0%, 5% 100%, 30% 80%, 50% 90%, 70% 80%, 95% 100%)',
              background: shield > 0
                ? 'linear-gradient(180deg, #67e8f9 0%, #0891b2 60%, #164e63 100%)'
                : 'linear-gradient(180deg, #a5f3fc 0%, #0284c7 60%, #1e3a5f 100%)',
              filter: `drop-shadow(0 0 ${shield > 0 ? 16 : 8}px rgba(34,211,238,${shield > 0 ? 1 : 0.7}))`
            }} />
          {/* Cockpit */}
          <div className="absolute"
            style={{
              top: '15%', left: '30%', width: '40%', height: '25%',
              background: 'rgba(186,230,253,0.6)',
              clipPath: 'ellipse(50% 50% at 50% 50%)'
            }} />
        </div>
      </div>
    </div>
  );
}
