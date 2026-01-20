import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { GyroData } from '@/types/game';

// ==========================================
// 1. 遊戲參數設定 (Configuration)
// ==========================================
const GAME_CONFIG = {
    WIDTH: 800,
    HEIGHT: 600,

    // --- 擋板 (Paddle) ---
    PADDLE_WIDTH: 120,
    PADDLE_HEIGHT: 20,
    PADDLE_Y: 550, // 固定在底部
    PADDLE_SPEED: 18, // 靈敏度

    // --- 球 (Ball) ---
    BALL_SIZE: 16,
    BALL_SPEED: 1,

    // --- 磚塊 (Brick) ---
    BRICK_ROWS: 5,
    BRICK_COLS: 8,
    BRICK_HEIGHT: 30,
    BRICK_GAP: 10,
    // 寬度動態計算

    // --- 分數 ---
    SCORE_PER_BRICK: 50,
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
    type?: 'NORMAL' | 'HARD';
}

interface Ball {
    x: number;
    y: number;
    vx: number;
    vy: number;
    active: boolean;
}

interface GameState {
    paddleX: number; // 擋板中心點 X
    ball: Ball;
    bricks: Entity[];
    status: 'READY' | 'PLAYING' | 'GAME_OVER' | 'VICTORY';
    score: number;
    startTime: number;
}

// ==========================================
// 3. 遊戲邏輯 Hook (Logic)
// ==========================================
function useGameLogic(paused: boolean = false) {

    // 初始化磚塊
    const createBricks = (): Entity[] => {
        const bricks: Entity[] = [];
        const totalW = GAME_CONFIG.WIDTH;
        const brickW = (totalW - (GAME_CONFIG.BRICK_COLS + 1) * GAME_CONFIG.BRICK_GAP) / GAME_CONFIG.BRICK_COLS;

        for (let r = 0; r < GAME_CONFIG.BRICK_ROWS; r++) {
            for (let c = 0; c < GAME_CONFIG.BRICK_COLS; c++) {
                bricks.push({
                    id: uuidv4(),
                    x: GAME_CONFIG.BRICK_GAP + c * (brickW + GAME_CONFIG.BRICK_GAP),
                    y: GAME_CONFIG.BRICK_GAP + r * (GAME_CONFIG.BRICK_HEIGHT + GAME_CONFIG.BRICK_GAP) + 50, // Top offset
                    width: brickW,
                    height: GAME_CONFIG.BRICK_HEIGHT,
                    active: true,
                    type: 'NORMAL'
                });
            }
        }
        return bricks;
    };

    const getInitialState = (): GameState => ({
        paddleX: GAME_CONFIG.WIDTH / 2,
        ball: {
            x: GAME_CONFIG.WIDTH / 2,
            y: GAME_CONFIG.PADDLE_Y - 20,
            vx: 0,
            vy: 0,
            active: true
        },
        bricks: createBricks(),
        status: 'READY',
        score: 0,
        startTime: 0
    });

    const [gameState, setGameState] = useState<GameState>(getInitialState());
    const stateRef = useRef(gameState);
    stateRef.current = gameState;

    // 輸入緩存
    const inputRef = useRef({ moveX: 0 });

    // [Action] 更新陀螺儀
    const updateGyro = useCallback((data: GyroData) => {
        if (data.gamma !== null) {
            // Gamma 控制左右 (X軸)
            inputRef.current.moveX = (data.gamma / 30) * GAME_CONFIG.PADDLE_SPEED;
        }
    }, []);

    // [Action] 發射球 (開始遊戲/回合)
    const launchBall = useCallback(() => {
        if (stateRef.current.status === 'READY') {
            setGameState(prev => ({
                ...prev,
                status: 'PLAYING',
                startTime: Date.now(),
                ball: {
                    ...prev.ball,
                    vx: (Math.random() > 0.5 ? 1 : -1) * GAME_CONFIG.BALL_SPEED * 0.8, // 隨機左右
                    vy: -GAME_CONFIG.BALL_SPEED // 向上發射
                }
            }));
        }
    }, []);

    // [Action] 重置
    const resetGame = useCallback(() => {
        setGameState(getInitialState());
    }, []);

    // [Core] 物理迴圈
    useEffect(() => {
        let loopId: number;

        const loop = () => {
            if (stateRef.current.status === 'PLAYING' && !paused) {
                const current = stateRef.current;
                const input = inputRef.current;

                // --- A. 移動擋板 ---
                let newPaddleX = current.paddleX + input.moveX;
                const limit = GAME_CONFIG.WIDTH;
                // 邊界限制 (中心點)
                const halfP = GAME_CONFIG.PADDLE_WIDTH / 2;
                newPaddleX = Math.max(halfP, Math.min(limit - halfP, newPaddleX));

                // --- B. 移動球 ---
                let newBall = { ...current.ball };
                newBall.x += newBall.vx;
                newBall.y += newBall.vy;

                // --- C. 球與牆壁碰撞 ---
                // 左右牆
                if (newBall.x <= 0 || newBall.x >= GAME_CONFIG.WIDTH) {
                    newBall.vx *= -1;
                    newBall.x = newBall.x <= 0 ? 0 : GAME_CONFIG.WIDTH;
                }
                // 頂部
                if (newBall.y <= 0) {
                    newBall.vy *= -1;
                }
                // 底部 (Game Over)
                let newStatus = current.status;
                if (newBall.y > GAME_CONFIG.HEIGHT) {
                    newStatus = 'GAME_OVER';
                }

                // --- D. 球與擋板碰撞 ---
                // AABB (Paddle center -> rect)
                const pLeft = newPaddleX - GAME_CONFIG.PADDLE_WIDTH / 2;
                const pRight = newPaddleX + GAME_CONFIG.PADDLE_WIDTH / 2;
                const pTop = GAME_CONFIG.PADDLE_Y;
                const pBottom = GAME_CONFIG.PADDLE_Y + GAME_CONFIG.PADDLE_HEIGHT;

                if (
                    newBall.x >= pLeft && newBall.x <= pRight &&
                    newBall.y + GAME_CONFIG.BALL_SIZE >= pTop &&
                    newBall.y <= pBottom &&
                    newBall.vy > 0 // 只有往下掉時才判定
                ) {
                    // 反彈
                    newBall.vy *= -1;
                    // 根據擊中位置改變 X 速度 (物理趣味性)
                    const hitPoint = newBall.x - newPaddleX;
                    newBall.vx = hitPoint * 0.15;
                }

                // --- E. 球與磚塊碰撞 ---
                const newBricks = [...current.bricks];
                let scoreAdd = 0;

                for (let b of newBricks) {
                    if (!b.active) continue;

                    if (
                        newBall.x >= b.x && newBall.x <= b.x + b.width &&
                        newBall.y >= b.y && newBall.y <= b.y + b.height
                    ) {
                        b.active = false;
                        newBall.vy *= -1; // 簡單反彈
                        scoreAdd += GAME_CONFIG.SCORE_PER_BRICK;
                        break; // 一次只撞一個
                    }
                }

                // --- F. 勝利判定 ---
                if (newBricks.every(b => !b.active)) {
                    newStatus = 'VICTORY'; // 你可以在這裡重置磚塊並加速進入下一關
                }

                setGameState(prev => ({
                    ...prev,
                    paddleX: newPaddleX,
                    ball: newBall,
                    bricks: newBricks,
                    score: prev.score + scoreAdd,
                    status: newStatus
                }));
            }

            loopId = requestAnimationFrame(loop);
        };

        loop();
        return () => cancelAnimationFrame(loopId);
    }, [paused]);

    return { gameState, updateGyro, launchBall, resetGame };
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
}

export default function Game2({
    socket,
    roomId,
    paused = false,
    onPause,
    onResume,
    onScoreChange,
    onStatusChange
}: Props) {
    const { gameState, updateGyro, launchBall, resetGame } = useGameLogic(paused);
    const { paddleX, ball, bricks, status, score } = gameState;

    // Sync Score
    useEffect(() => {
        if (onScoreChange) onScoreChange(score);
    }, [score, onScoreChange]);

    // Sync Status
    useEffect(() => {
        if (onStatusChange) onStatusChange(status);
    }, [status, onStatusChange]);

    // Socket Setup
    useEffect(() => {
        const handleGyro = (data: GyroData) => updateGyro(data);
        const handleAction = (payload: any) => {
            const action = typeof payload === 'string' ? payload : payload.action;

            if (action === 'launch' || action === 'fire-start') launchBall();
            if (action === 'restart-game') resetGame();
            if (action === 'pause') if (onPause) onPause();
            if (action === 'resume') if (onResume) onResume();
        };

        socket.on('update-game-state', handleGyro);
        socket.on('controller-action', handleAction);
        socket.emit('sync-game-status', { roomId, status });

        return () => {
            socket.off('update-game-state');
            socket.off('controller-action');
        };
    }, [socket, roomId, updateGyro, launchBall, resetGame, status, onPause, onResume]);

    return (
        <div className="relative w-full h-screen bg-slate-900 overflow-hidden flex items-center justify-center font-mono select-none">

            {/* 遊戲區域 */}
            <div className="relative" style={{ width: GAME_CONFIG.WIDTH, height: GAME_CONFIG.HEIGHT }}>

                {/* 背景網格裝飾 */}
                <div className="absolute inset-0 opacity-20"
                    style={{ backgroundImage: 'radial-gradient(circle, #4f46e5 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
                </div>

                {/* 1. 磚塊 */}
                {bricks.map(b => b.active && (
                    <div
                        key={b.id}
                        className="absolute bg-indigo-500 border-2 border-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                        style={{
                            left: b.x,
                            top: b.y,
                            width: b.width,
                            height: b.height,
                        }}
                    />
                ))}

                {/* 2. 擋板 */}
                <div
                    className="absolute bg-cyan-400 rounded-full shadow-[0_0_20px_rgba(34,211,238,0.8)]"
                    style={{
                        left: paddleX - GAME_CONFIG.PADDLE_WIDTH / 2,
                        top: GAME_CONFIG.PADDLE_Y,
                        width: GAME_CONFIG.PADDLE_WIDTH,
                        height: GAME_CONFIG.PADDLE_HEIGHT
                    }}
                >
                    {/* 擋板細節 */}
                    <div className="absolute inset-x-0 top-1/2 h-1 bg-white/30 -translate-y-1/2"></div>
                </div>

                {/* 3. 球 */}
                <div
                    className="absolute bg-yellow-400 rounded-full shadow-[0_0_15px_rgba(250,204,21,0.9)]"
                    style={{
                        left: ball.x - GAME_CONFIG.BALL_SIZE / 2,
                        top: ball.y - GAME_CONFIG.BALL_SIZE / 2,
                        width: GAME_CONFIG.BALL_SIZE,
                        height: GAME_CONFIG.BALL_SIZE
                    }}
                />

            </div>
        </div>
    );
}