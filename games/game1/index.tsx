// games/game1/index.tsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { GyroData } from '@/types/game'; // 這是全域唯一的，不用改

// ==========================================
// 1. 遊戲參數設定 (Configuration)
// ==========================================
const GAME_CONFIG = {
  // --- 畫布設定 ---
  WIDTH: 800,         // 遊戲邏輯寬度
  HEIGHT: 600,        // 遊戲邏輯高度

  // --- 玩家 (飛機) ---
  PLAYER_SIZE: 50,    // 飛機大小 (px)
  PLAYER_SPEED: 15,   // 陀螺儀靈敏度 (數字越大動越快)

  // --- 子彈 & 開火設定 ---
  BULLET_W: 8,
  BULLET_H: 20,
  BULLET_SPEED: 18,
  INITIAL_FIRE_RATE: 800, // 初始開火間隔 (ms) - 慢
  MIN_FIRE_RATE: 150,     // 最快開火間隔 (ms) - 快

  // --- 障礙物 (隕石) ---
  OBSTACLE_SIZE: 40,
  INITIAL_OBSTACLE_SPEED: 1,  // 初始速度 (變慢)
  SPAWN_RATE: 300,

  // --- 道具 (PowerUp) ---
  POWERUP_SIZE: 30,
  POWERUP_SPEED: 4,
  POWERUP_CHANCE: 0.15, // 15% 機率生成

  // --- 分數 ---
  SCORE_PER_HIT: 100,
};

// ==========================================
// 2. 內部型別定義 (Types)
// ==========================================
interface Entity {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
  type?: 'METEOR' | 'POWERUP_RATE'; // 區分實體類型
}

interface Player extends Entity {
  score: number;
}

interface GameState {
  player: Player;
  bullets: Entity[];
  obstacles: Entity[]; // 包含隕石
  powerUps: Entity[];  // 獨立管理道具
  status: 'READY' | 'PLAYING' | 'GAME_OVER';
  fireRate: number;    // 當前開火間隔
  startTime: number;   // 遊戲開始時間 (用於難度計算)
}

// ==========================================
// 3. 遊戲邏輯 Hook (Logic)
// ==========================================
function useGameLogic(paused: boolean = false) {
  // 初始狀態
  const getInitialState = (): GameState => ({
    player: {
      id: 'p1',
      x: 0, y: 0,
      width: GAME_CONFIG.PLAYER_SIZE,
      height: GAME_CONFIG.PLAYER_SIZE,
      active: true,
      score: 0
    },
    bullets: [],
    obstacles: [],
    powerUps: [],
    status: 'READY',
    fireRate: GAME_CONFIG.INITIAL_FIRE_RATE,
    startTime: 0
  });

  const [gameState, setGameState] = useState<GameState>(getInitialState());

  const stateRef = useRef(gameState);
  stateRef.current = gameState;

  // 輸入狀態: moveX, moveY, isFiring (持續按壓)
  const inputRef = useRef({ moveX: 0, moveY: 0, isFiring: false });
  // 用於計算冷卻
  const lastFireTimeRef = useRef(0);

  // [Action] 更新陀螺儀輸入
  const updateGyro = useCallback((data: GyroData) => {
    if (data.beta !== null && data.gamma !== null) {
      inputRef.current.moveX = (data.gamma / 30) * GAME_CONFIG.PLAYER_SPEED;
      inputRef.current.moveY = (data.beta / 30) * GAME_CONFIG.PLAYER_SPEED;
    }
  }, []);

  // [Action] 處理開火 (Start/End)
  const setFiring = useCallback((firing: boolean) => {
    inputRef.current.isFiring = firing;
  }, []);

  // [Action] 開始遊戲
  const startGame = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      status: 'PLAYING',
      startTime: Date.now(),
      fireRate: GAME_CONFIG.INITIAL_FIRE_RATE
    }));
    lastFireTimeRef.current = 0;
  }, []);

  // [Action] 重置遊戲
  const resetGame = useCallback(() => {
    setGameState(getInitialState());
  }, []);

  // [Core] 物理運算主迴圈
  useEffect(() => {
    let loopId: number;
    let spawnTimer = 0;

    const loop = () => {
      // 只有在 PLAYING 狀態 且 沒有暫停 才計算物理
      if (stateRef.current.status === 'PLAYING' && !paused) {
        const current = stateRef.current;
        const input = inputRef.current;
        const now = Date.now();

        // 0. 計算難度係數 (每 10秒 + 0.5 速度, 這裡簡單用時間差)
        // 遊戲時間 (秒)
        const gameTime = (now - current.startTime) / 1000;
        const difficultyLevel = Math.floor(gameTime / 10); // 每10秒一級

        // 速度隨著難度增加: 初始 3, 每級 + 0.5
        const currentObstacleSpeed = GAME_CONFIG.INITIAL_OBSTACLE_SPEED + (difficultyLevel * 0.5);
        // 生成頻率隨著難度變快: 初始 800, 每級 - 30ms (最低 200)
        const currentSpawnRate = Math.max(200, GAME_CONFIG.SPAWN_RATE - (difficultyLevel * 30));

        // --- A. 計算玩家位置 ---
        let newPx = current.player.x + input.moveX;
        let newPy = current.player.y + input.moveY;

        const limitX = GAME_CONFIG.WIDTH / 2 - GAME_CONFIG.PLAYER_SIZE / 2;
        const limitY = GAME_CONFIG.HEIGHT / 2 - GAME_CONFIG.PLAYER_SIZE / 2;
        newPx = Math.max(-limitX, Math.min(limitX, newPx));
        newPy = Math.max(-limitY, Math.min(limitY, newPy));

        // --- B. 處理自動開火 ---
        const newBullets = [...current.bullets];
        if (input.isFiring) {
          if (now - lastFireTimeRef.current >= current.fireRate) {
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
        }

        // --- C. 移動子彈 ---
        for (let b of newBullets) {
          b.y -= GAME_CONFIG.BULLET_SPEED;
          if (b.y < -GAME_CONFIG.HEIGHT / 2) b.active = false;
        }

        // --- D. 生成物體 (隕石 或 道具) ---
        spawnTimer += 16;
        const newObstacles = [...current.obstacles];
        const newPowerUps = [...current.powerUps];

        if (spawnTimer > currentSpawnRate) {
          spawnTimer = 0;
          const randomX = (Math.random() * GAME_CONFIG.WIDTH) - (GAME_CONFIG.WIDTH / 2);

          // 判斷生成 道具 還是 隕石
          if (Math.random() < GAME_CONFIG.POWERUP_CHANCE) {
            // Spawn PowerUp
            newPowerUps.push({
              id: uuidv4(),
              x: randomX,
              y: -GAME_CONFIG.HEIGHT / 2 - 50,
              width: GAME_CONFIG.POWERUP_SIZE,
              height: GAME_CONFIG.POWERUP_SIZE,
              active: true,
              type: 'POWERUP_RATE'
            });
          } else {
            // Spawn Meteor
            newObstacles.push({
              id: uuidv4(),
              x: randomX,
              y: -GAME_CONFIG.HEIGHT / 2 - 50,
              width: GAME_CONFIG.OBSTACLE_SIZE,
              height: GAME_CONFIG.OBSTACLE_SIZE,
              active: true,
              type: 'METEOR'
            });
          }
        }

        // --- E. 移動物體 ---
        // 隕石移動
        for (let o of newObstacles) {
          o.y += currentObstacleSpeed;
          if (o.y > GAME_CONFIG.HEIGHT / 2) o.active = false;
        }
        // 道具移動 (稍微慢一點或是跟隕石一樣)
        for (let p of newPowerUps) {
          p.y += GAME_CONFIG.POWERUP_SPEED;
          if (p.y > GAME_CONFIG.HEIGHT / 2) p.active = false;
        }

        // --- F. 碰撞檢測 ---
        let scoreToAdd = 0;
        let isGameOver = false;
        let newFireRate = current.fireRate;

        // F1. 子彈 vs 隕石
        for (let b of newBullets) {
          if (!b.active) continue;
          for (let o of newObstacles) {
            if (!o.active) continue;
            // AABB
            if (
              b.x < o.x + o.width && b.x + b.width > o.x &&
              b.y < o.y + o.height && b.height + b.y > o.y
            ) {
              b.active = false;
              o.active = false;
              scoreToAdd += GAME_CONFIG.SCORE_PER_HIT;
            }
          }
        }

        // F2. 玩家 vs 隕石
        const playerRect = { ...current.player, x: newPx, y: newPy };
        for (let o of newObstacles) {
          if (o.active) {
            if (
              playerRect.x < o.x + o.width && playerRect.x + playerRect.width > o.x &&
              playerRect.y < o.y + o.height && playerRect.height + playerRect.y > o.y
            ) {
              isGameOver = true;
            }
          }
        }

        // F3. 玩家 vs 道具
        for (let p of newPowerUps) {
          if (p.active) {
            if (
              playerRect.x < p.x + p.width && playerRect.x + playerRect.width > p.x &&
              playerRect.y < p.y + p.height && playerRect.height + playerRect.y > p.y
            ) {
              p.active = false;
              scoreToAdd += 500; // 吃道具加分
              // 增加射速 (減少間隔)，設定上限
              newFireRate = Math.max(GAME_CONFIG.MIN_FIRE_RATE, newFireRate * 0.9); // 每次加快 10%
            }
          }
        }

        // --- G. 更新所有狀態 ---
        setGameState(prev => ({
          ...prev,
          status: isGameOver ? 'GAME_OVER' : 'PLAYING',
          player: { ...prev.player, x: newPx, y: newPy, score: prev.player.score + scoreToAdd },
          bullets: newBullets.filter(b => b.active),
          obstacles: newObstacles.filter(o => o.active),
          powerUps: newPowerUps.filter(p => p.active),
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
// 4. 主視圖組件 (View)
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

export default function Game1({
  socket,
  roomId,
  onExit,
  paused = false,
  onPause,
  onResume,
  onScoreChange,
  onStatusChange
}: Props) {
  // 引入邏輯
  const { gameState, updateGyro, setFiring, startGame, resetGame } = useGameLogic(paused);
  const { player, bullets, obstacles, powerUps, status } = gameState;

  // Sync Score Effect [NEW]
  useEffect(() => {
    if (onScoreChange) {
      onScoreChange(player.score);
    }
  }, [player.score, onScoreChange]);

  // Sync Status Effect [NEW] (Ideally useGameLogic calls this, but useEffect is fine for now)
  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(status);
    }
  }, [status, onStatusChange]);

  // 連接 Socket
  useEffect(() => {
    // 接收陀螺儀數據
    const handleGyro = (data: GyroData) => updateGyro(data);

    // 接收操作指令
    const handleAction = (payload: any) => {
      const action = typeof payload === 'string' ? payload : payload.action;

      if (action === 'fire-start') setFiring(true);
      if (action === 'fire-end') setFiring(false);
      if (action === 'shoot') setFiring(true);

      if (action === 'start-game') startGame();
      if (action === 'pause') if (onPause) onPause();
      if (action === 'resume') if (onResume) onResume();
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

  return (
    <div className="relative w-full h-screen bg-slate-900 overflow-hidden flex items-center justify-center font-mono select-none">

      {/* --- UI 層 (退出按鈕 - 仍保留在遊戲內還是移出? User said "game over ready mask", not exit button. Leave it for now or move it if instructed. User said "settings backtolobby" needs to move out. Exit button is redundant with Settings Panel probably.) 
          User said: "game1 中的 monilecontorller 中 除了 fire button 以外 其他設定 backtoobby 等等 也要移到最外面"
          For Desktop: "game over ready 遮罩 移到最外層"
          The exit button is kind of part of the "HUD". Keep it for now unless it conflicts. 
      */}
      {/* 
      <div className="absolute top-6 left-6 z-50">
        <button onClick={onExit} ... > EXIT GAME </button> 
      </div>
      Actually let's keep the visual only essentials.
      */}

      {/* --- 遊戲渲染層 --- */}
      <div className="relative w-full h-full">

        {/* 1. 玩家 (Cyan Triangle) */}
        <div
          className="absolute bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.8)] z-10"
          style={{
            width: player.width,
            height: player.height,
            left: '50%',
            top: '50%',
            transform: `translate(${player.x - player.width / 2}px, ${player.y - player.height / 2}px)`,
            clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)'
          }}
        />

        {/* 2. 子彈 (Yellow Pulse) */}
        {bullets.map(b => (
          <div
            key={b.id}
            className="absolute bg-yellow-300 rounded-full shadow-[0_0_10px_rgba(253,224,71,0.8)]"
            style={{
              width: b.width,
              height: b.height,
              left: '50%',
              top: '50%',
              transform: `translate(${b.x - b.width / 2}px, ${b.y - b.height / 2}px)`
            }}
          />
        ))}

        {/* 3. 隕石 (Red Block) */}
        {obstacles.map(o => (
          <div
            key={o.id}
            className="absolute bg-red-500 rounded-lg border-b-4 border-red-800 shadow-lg"
            style={{
              width: o.width,
              height: o.height,
              left: '50%',
              top: '50%',
              transform: `translate(${o.x - o.width / 2}px, ${o.y - o.height / 2}px)`
            }}
          >
            <div className="absolute top-2 right-2 w-2 h-2 bg-black/20 rounded-full" />
            <div className="absolute bottom-3 left-3 w-3 h-3 bg-black/20 rounded-full" />
          </div>
        ))}

        {/* 3.5 道具 (Green/Blue Orb) */}
        {powerUps.map(p => (
          <div
            key={p.id}
            className="absolute bg-green-400 rounded-full border-4 border-green-200 shadow-[0_0_15px_rgba(74,222,128,0.8)] animate-pulse"
            style={{
              width: p.width,
              height: p.height,
              left: '50%',
              top: '50%',
              transform: `translate(${p.x - p.width / 2}px, ${p.y - p.height / 2}px)`
            }}
          >
            <div className="flex items-center justify-center w-full h-full text-white font-bold text-xs">
              ⚡
            </div>
          </div>
        ))}

        {/* Overlays Removed from here */}
      </div>
    </div>
  );
}