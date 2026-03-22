// games/game3/index.tsx — Neon Racing (Enhanced)
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { GyroData } from '@/types/game';
import { sfx } from '@/platform/audio';

const GAME_CONFIG = {
  WIDTH: 800,
  HEIGHT: 600,
  CAR_WIDTH: 40,
  CAR_HEIGHT: 70,
  BASE_SPEED: 3,
  NITRO_SPEED: 14,
  ROTATION_SENSITIVITY: 1.0,
  ROAD_WIDTH: 360,
  SEGMENT_HEIGHT: 20,
  VISIBLE_SEGMENTS: 42,
  INITIAL_OBSTACLE_CHANCE: 0.08,
  MAX_OBSTACLE_CHANCE: 0.35,
  COIN_CHANCE: 0.25,
  COIN_SIZE: 20,
  COIN_SCORE: 50,
};

interface Entity {
  id: string;
  trackY: number;
  offsetX: number;
  width: number;
  height: number;
  active: boolean;
  type?: 'obstacle' | 'coin';
}

interface SpeedLine { id: string; x: number; y: number; len: number; opacity: number; }

interface GameState {
  distance: number;
  carX: number;
  carAngle: number;
  isNitro: boolean;
  obstacles: Entity[];
  coins: Entity[];
  speedLines: SpeedLine[];
  status: 'READY' | 'PLAYING' | 'GAME_OVER';
  score: number;
  coinsCollected: number;
}

function useGameLogic(paused: boolean = false) {
  const getRoadCurve = useCallback((y: number) => {
    // Curves get more intense the further you go
    const intensity = Math.min(1, y / 8000); // ramp up over distance
    return (Math.sin(y * 0.0015) * 80 * (0.3 + intensity * 0.7)) + (Math.sin(y * 0.004) * 30 * intensity);
  }, []);

  const createSpeedLines = (): SpeedLine[] =>
    Array.from({ length: 20 }, () => ({
      id: uuidv4(),
      x: Math.random() * GAME_CONFIG.WIDTH,
      y: Math.random() * GAME_CONFIG.HEIGHT,
      len: Math.random() * 40 + 20,
      opacity: 0
    }));

  const getInitialState = (): GameState => ({
    distance: 0, carX: 0, carAngle: 0, isNitro: false,
    obstacles: [], coins: [], speedLines: createSpeedLines(),
    status: 'READY', score: 0, coinsCollected: 0
  });

  const [gameState, setGameState] = useState<GameState>(getInitialState());
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const inputRef = useRef({ steer: 0, nitro: false });
  let obstacleSpawnCounter = useRef(0);

  const updateGyro = useCallback((data: GyroData) => {
    if (data.gamma !== null)
      inputRef.current.steer = data.gamma * GAME_CONFIG.ROTATION_SENSITIVITY;
  }, []);

  const setNitro = useCallback((active: boolean) => {
    inputRef.current.nitro = active;
  }, []);

  const startGame = useCallback(() => {
    setGameState(prev => ({ ...prev, status: 'PLAYING' }));
  }, []);

  const resetGame = useCallback(() => {
    setGameState(getInitialState());
    inputRef.current = { steer: 0, nitro: false };
    obstacleSpawnCounter.current = 0;
  }, []);

  useEffect(() => {
    let loopId: number;

    const loop = () => {
      if (stateRef.current.status === 'PLAYING' && !paused) {
        const current = stateRef.current;
        const input = inputRef.current;

        // Speed with difficulty progression
        const gameTime = current.distance / 500; // difficulty ramps with distance
        const speedBonus = Math.min(gameTime * 0.15, 6);
        const speed = (input.nitro ? GAME_CONFIG.NITRO_SPEED : GAME_CONFIG.BASE_SPEED) + speedBonus;
        const obstacleChance = Math.min(GAME_CONFIG.INITIAL_OBSTACLE_CHANCE + gameTime * 0.008, GAME_CONFIG.MAX_OBSTACLE_CHANCE);

        const rad = (input.steer * Math.PI) / 180;
        const dx = Math.sin(rad) * speed;
        const dy = Math.cos(rad) * speed;
        let newCarX = current.carX + dx;
        const newDistance = current.distance + dy;

        // Spawn obstacles + coins
        let newObstacles = current.obstacles.filter(o => o.trackY > newDistance - 100);
        let newCoins = current.coins.filter(c => c.trackY > newDistance - 100);

        if (Math.floor(newDistance / 80) > obstacleSpawnCounter.current) {
          obstacleSpawnCounter.current = Math.floor(newDistance / 80);
          const spawnY = newDistance + GAME_CONFIG.HEIGHT + 200;

          if (Math.random() < obstacleChance) {
            const offset = (Math.random() * (GAME_CONFIG.ROAD_WIDTH - 60)) - (GAME_CONFIG.ROAD_WIDTH / 2 - 30);
            newObstacles.push({
              id: uuidv4(), trackY: spawnY, offsetX: offset,
              width: 44, height: 44, active: true, type: 'obstacle'
            });
          }
          if (Math.random() < GAME_CONFIG.COIN_CHANCE) {
            const coinOffset = (Math.random() * (GAME_CONFIG.ROAD_WIDTH - 40)) - (GAME_CONFIG.ROAD_WIDTH / 2 - 20);
            newCoins.push({
              id: uuidv4(), trackY: spawnY, offsetX: coinOffset,
              width: GAME_CONFIG.COIN_SIZE, height: GAME_CONFIG.COIN_SIZE,
              active: true, type: 'coin'
            });
          }
        }

        // Collision
        let isGameOver = false;
        const currentRoadCenterX = getRoadCurve(newDistance);

        if (newCarX < currentRoadCenterX - GAME_CONFIG.ROAD_WIDTH / 2 + 20 ||
          newCarX > currentRoadCenterX + GAME_CONFIG.ROAD_WIDTH / 2 - 20) {
          isGameOver = true;
        }

        // Obstacle collisions
        for (const obs of newObstacles) {
          if (!obs.active) continue;
          const obsWorldX = getRoadCurve(obs.trackY) + obs.offsetX;
          const relY = obs.trackY - newDistance;
          if (Math.abs(newCarX - obsWorldX) < (GAME_CONFIG.CAR_WIDTH / 2 + obs.width / 2) &&
            Math.abs(0 - relY) < (GAME_CONFIG.CAR_HEIGHT / 2 + obs.height / 2)) {
            isGameOver = true;
          }
        }

        // Coin collisions
        let coinsAdd = 0;
        for (const coin of newCoins) {
          if (!coin.active) continue;
          const coinWorldX = getRoadCurve(coin.trackY) + coin.offsetX;
          const relY = coin.trackY - newDistance;
          if (Math.abs(newCarX - coinWorldX) < (GAME_CONFIG.CAR_WIDTH / 2 + coin.width / 2) &&
            Math.abs(0 - relY) < (GAME_CONFIG.CAR_HEIGHT / 2 + coin.height / 2)) {
            coin.active = false;
            coinsAdd++;
            sfx.coin();
          }
        }

        // Speed lines (when nitro)
        const newSpeedLines = current.speedLines.map(sl => ({
          ...sl,
          y: sl.y + speed * 2,
          opacity: input.nitro ? Math.min(sl.opacity + 0.1, 0.7) : Math.max(sl.opacity - 0.05, 0),
          ...(sl.y > GAME_CONFIG.HEIGHT ? { y: 0, x: Math.random() * GAME_CONFIG.WIDTH } : {})
        }));

        if (isGameOver) sfx.crash();

        setGameState(prev => ({
          ...prev,
          distance: newDistance,
          carX: newCarX,
          carAngle: Math.max(-25, Math.min(25, input.steer * 0.3)),
          isNitro: input.nitro,
          obstacles: newObstacles,
          coins: newCoins.filter(c => c.active),
          speedLines: newSpeedLines,
          status: isGameOver ? 'GAME_OVER' : 'PLAYING',
          score: Math.floor(newDistance / 10) + prev.coinsCollected * GAME_CONFIG.COIN_SCORE,
          coinsCollected: prev.coinsCollected + coinsAdd
        }));
      }
      loopId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(loopId);
  }, [paused, getRoadCurve]);

  return { gameState, updateGyro, setNitro, startGame, resetGame, getRoadCurve };
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

export default function Game3({ socket, roomId, paused = false, onPause, onResume, onScoreChange, onStatusChange }: Props) {
  const { gameState, updateGyro, setNitro, startGame, resetGame, getRoadCurve } = useGameLogic(paused);
  const { distance, carX, carAngle, obstacles, coins, speedLines, status, score, isNitro, coinsCollected } = gameState;

  useEffect(() => { if (onScoreChange) onScoreChange(score); }, [score, onScoreChange]);
  useEffect(() => { if (onStatusChange) onStatusChange(status); }, [status, onStatusChange]);

  useEffect(() => {
    const handleGyro = (data: GyroData) => updateGyro(data);
    const handleAction = (payload: any) => {
      const action = typeof payload === 'string' ? payload : payload.action;
      if (action === 'nitro-start') { setNitro(true); sfx.nitroOn(); }
      if (action === 'nitro-end') { setNitro(false); sfx.nitroOff(); }
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
  }, [socket, roomId, updateGyro, setNitro, resetGame, status, onPause, onResume]);

  const roadSegments = useMemo(() => {
    const segments = [];
    for (let i = 0; i < GAME_CONFIG.VISIBLE_SEGMENTS; i++) {
      const yOffset = i * GAME_CONFIG.SEGMENT_HEIGHT;
      const worldY = distance + yOffset;
      const roadCX = getRoadCurve(worldY);
      const isMarking = Math.floor((distance + yOffset) / 60) % 2 === 0;
      segments.push({ key: i, bottom: yOffset, centerX: roadCX, isMarking });
    }
    return segments;
  }, [distance, getRoadCurve]);

  const screenCenterX = GAME_CONFIG.WIDTH / 2;

  return (
    <div className="relative w-full h-screen overflow-hidden flex items-center justify-center font-mono select-none"
      style={{ background: 'linear-gradient(180deg, #111827 0%, #1f2937 100%)' }}>

      {/* Coins counter */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 text-sm font-bold text-yellow-400 bg-yellow-900/30 px-3 py-1 rounded-full border border-yellow-500/30">
        🪙 {coinsCollected}
      </div>

      <div className="relative overflow-hidden shadow-2xl"
        style={{ width: GAME_CONFIG.WIDTH, height: GAME_CONFIG.HEIGHT,
          background: 'linear-gradient(180deg, #1e3a5f 0%, #2d4a6b 100%)' }}>

        {/* Road segments */}
        {roadSegments.map(seg => (
          <React.Fragment key={seg.key}>
            {/* Grass sides */}
            <div className="absolute"
              style={{
                bottom: seg.bottom, left: 0,
                width: screenCenterX + seg.centerX - GAME_CONFIG.ROAD_WIDTH / 2,
                height: GAME_CONFIG.SEGMENT_HEIGHT + 1,
                backgroundColor: Math.floor((distance + seg.bottom) / 200) % 2 === 0 ? '#166534' : '#15803d'
              }} />
            <div className="absolute"
              style={{
                bottom: seg.bottom,
                left: screenCenterX + seg.centerX + GAME_CONFIG.ROAD_WIDTH / 2,
                right: 0,
                height: GAME_CONFIG.SEGMENT_HEIGHT + 1,
                backgroundColor: Math.floor((distance + seg.bottom) / 200) % 2 === 0 ? '#166534' : '#15803d'
              }} />
            {/* Road */}
            <div className="absolute"
              style={{
                bottom: seg.bottom,
                left: screenCenterX + seg.centerX - GAME_CONFIG.ROAD_WIDTH / 2,
                width: GAME_CONFIG.ROAD_WIDTH,
                height: GAME_CONFIG.SEGMENT_HEIGHT + 1,
                backgroundColor: Math.floor((distance + seg.bottom) / 100) % 2 === 0 ? '#374151' : '#4b5563'
              }} />
            {/* Center dashes */}
            {seg.isMarking && (
              <div className="absolute"
                style={{
                  bottom: seg.bottom + GAME_CONFIG.SEGMENT_HEIGHT / 2 - 2,
                  left: screenCenterX + seg.centerX - 20,
                  width: 40, height: 4,
                  backgroundColor: 'rgba(255,255,255,0.5)'
                }} />
            )}
            {/* Road edge markings */}
            <div className="absolute"
              style={{
                bottom: seg.bottom,
                left: screenCenterX + seg.centerX - GAME_CONFIG.ROAD_WIDTH / 2,
                width: 8, height: GAME_CONFIG.SEGMENT_HEIGHT + 1,
                backgroundColor: 'rgba(255,255,255,0.6)'
              }} />
            <div className="absolute"
              style={{
                bottom: seg.bottom,
                left: screenCenterX + seg.centerX + GAME_CONFIG.ROAD_WIDTH / 2 - 8,
                width: 8, height: GAME_CONFIG.SEGMENT_HEIGHT + 1,
                backgroundColor: 'rgba(255,255,255,0.6)'
              }} />
          </React.Fragment>
        ))}

        {/* Speed lines (nitro) */}
        {speedLines.map(sl => (
          <div key={sl.id} className="absolute pointer-events-none"
            style={{
              left: sl.x, top: sl.y,
              width: 2, height: sl.len,
              background: 'linear-gradient(180deg, transparent, rgba(251,191,36,0.8), transparent)',
              opacity: sl.opacity
            }} />
        ))}

        {/* Coins */}
        {coins.map(coin => {
          const relY = coin.trackY - distance;
          const coinWorldX = getRoadCurve(coin.trackY) + coin.offsetX;
          if (relY < -50 || relY > GAME_CONFIG.HEIGHT + 50) return null;
          return (
            <div key={coin.id}
              className="absolute flex items-center justify-center rounded-full font-bold text-sm"
              style={{
                bottom: relY,
                left: screenCenterX + coinWorldX - GAME_CONFIG.COIN_SIZE / 2,
                width: GAME_CONFIG.COIN_SIZE, height: GAME_CONFIG.COIN_SIZE,
                background: 'radial-gradient(circle, #fde047, #f59e0b)',
                boxShadow: '0 0 12px rgba(245,158,11,0.8)',
                border: '2px solid rgba(253,224,71,0.8)'
              }}>
              $
            </div>
          );
        })}

        {/* Obstacles */}
        {obstacles.map(obs => {
          const relY = obs.trackY - distance;
          const obsWorldX = getRoadCurve(obs.trackY) + obs.offsetX;
          if (relY < -50 || relY > GAME_CONFIG.HEIGHT + 50) return null;
          return (
            <div key={obs.id}
              className="absolute rounded-sm"
              style={{
                bottom: relY,
                left: screenCenterX + obsWorldX - obs.width / 2,
                width: obs.width, height: obs.height,
                background: 'linear-gradient(135deg, #ef4444, #7f1d1d)',
                boxShadow: '0 0 10px rgba(239,68,68,0.6), inset 0 2px 4px rgba(255,255,255,0.2)',
                border: '2px solid rgba(239,68,68,0.8)'
              }}>
              <div className="w-full h-full opacity-40"
                style={{ background: 'repeating-linear-gradient(45deg, transparent, transparent 5px, #000 5px, #000 10px)' }} />
            </div>
          );
        })}

        {/* Car */}
        <div className="absolute z-20"
          style={{
            bottom: 50,
            left: screenCenterX + carX - GAME_CONFIG.CAR_WIDTH / 2,
            width: GAME_CONFIG.CAR_WIDTH,
            height: GAME_CONFIG.CAR_HEIGHT,
            transform: `rotate(${carAngle}deg)`,
            transition: 'transform 0.05s linear'
          }}>
          <div className={`w-full h-full rounded-lg border-2 border-black ${isNitro ? 'bg-gradient-to-b from-orange-400 to-orange-600' : 'bg-gradient-to-b from-blue-400 to-blue-700'}`}
            style={{ boxShadow: isNitro ? '0 0 20px rgba(251,146,60,0.8)' : '0 0 10px rgba(59,130,246,0.5)' }}>
            <div className="absolute top-0 inset-x-0 h-[30%] bg-black/20 rounded-t-md" />
            <div className="absolute top-[35%] inset-x-1 h-[25%]"
              style={{ background: 'linear-gradient(180deg, rgba(186,230,253,0.8), rgba(147,197,253,0.4))' }} />
            <div className="absolute bottom-0 inset-x-0 h-[20%] bg-black/10 rounded-b-md flex justify-around items-center px-1">
              <div className="w-3 h-2 bg-red-500 rounded-sm" style={{ boxShadow: '0 0 5px red' }} />
              <div className="w-3 h-2 bg-red-500 rounded-sm" style={{ boxShadow: '0 0 5px red' }} />
            </div>
          </div>
          {isNitro && (
            <div className="absolute inset-x-2"
              style={{ top: '100%', height: 32, background: 'linear-gradient(180deg, rgba(251,191,36,0.8), transparent)', filter: 'blur(4px)' }} />
          )}
        </div>
      </div>
    </div>
  );
}
