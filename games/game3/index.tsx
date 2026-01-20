import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { GyroData } from '@/types/game';

// ==========================================
// 1. Configuration
// ==========================================
const GAME_CONFIG = {
    WIDTH: 800,
    HEIGHT: 600,

    // --- Car ---
    CAR_WIDTH: 40,
    CAR_HEIGHT: 70,
    BASE_SPEED: 1,
    NITRO_SPEED: 16,
    ROTATION_SENSITIVITY: 2.5, // Steering sensitivity

    // --- Track ---
    ROAD_WIDTH: 300,
    SEGMENT_HEIGHT: 20, // Height of each road visual slice
    VISIBLE_SEGMENTS: 40, // How many slices to draw (cover screen)

    // --- Difficulty ---
    OBSTACLE_CHANCE: 0.05, // Chance to spawn per segment
};

// ==========================================
// 2. Types
// ==========================================
interface Entity {
    id: string;
    trackY: number; // Y position relative to total distance (not screen)
    offsetX: number; // X offset relative to road center
    width: number;
    height: number;
    active: boolean;
}

interface GameState {
    // Player State
    distance: number; // Total distance traveled (World Y)
    carX: number;     // Car X position relative to screen center (0 is center)
    carAngle: number; // Car rotation in degrees
    isNitro: boolean;

    // Environment
    obstacles: Entity[];

    // Meta
    status: 'READY' | 'PLAYING' | 'GAME_OVER';
    score: number;
}

// ==========================================
// 3. Logic Hook
// ==========================================
function useGameLogic(paused: boolean = false) {

    // --- Track Math Function (The "Fixed" Curves) ---
    // Returns the X offset of the road center at a specific Y distance
    const getRoadCurve = useCallback((y: number) => {
        // Combine sine waves for a more natural road path
        return (Math.sin(y * 0.002) * 150) + (Math.sin(y * 0.005) * 50);
    }, []);

    const getInitialState = (): GameState => ({
        distance: 0,
        carX: 0,
        carAngle: 0,
        isNitro: false,
        obstacles: [],
        status: 'READY',
        score: 0
    });

    const [gameState, setGameState] = useState<GameState>(getInitialState());
    const stateRef = useRef(gameState);
    stateRef.current = gameState;

    // Input Buffer
    const inputRef = useRef({ steer: 0, nitro: false });

    // [Action] Gyro Input
    const updateGyro = useCallback((data: GyroData) => {
        if (data.gamma !== null) {
            // Gamma (-90 to 90) controls steering angle
            // We smooth it slightly or map it directly
            inputRef.current.steer = data.gamma * GAME_CONFIG.ROTATION_SENSITIVITY;
        }
    }, []);

    // [Action] Nitro Input
    const setNitro = useCallback((active: boolean) => {
        inputRef.current.nitro = active;
    }, []);

    // [Action] Start / Reset
    const startGame = useCallback(() => {
        setGameState(prev => ({ ...prev, status: 'PLAYING' }));
    }, []);

    const resetGame = useCallback(() => {
        setGameState(getInitialState());
        inputRef.current = { steer: 0, nitro: false };
    }, []);

    // [Core] Physics Loop
    useEffect(() => {
        let loopId: number;
        let obstacleSpawnCounter = 0;

        const loop = () => {
            if (stateRef.current.status === 'PLAYING' && !paused) {
                const current = stateRef.current;
                const input = inputRef.current;

                // 1. Calculate Speed
                const speed = input.nitro ? GAME_CONFIG.NITRO_SPEED : GAME_CONFIG.BASE_SPEED;

                // 2. Update Car Position based on Angle
                // Angle 0 = Straight up.
                // Positive Angle = Right, Negative = Left
                const rad = (input.steer * Math.PI) / 180;

                // carX change (Horizontal movement)
                const dx = Math.sin(rad) * speed;
                let newCarX = current.carX + dx;

                // distance change (Vertical movement - moving forward)
                const dy = Math.cos(rad) * speed;
                const newDistance = current.distance + dy;

                // 3. Update Obstacles & Spawning
                let newObstacles = [...current.obstacles];

                // Remove passed obstacles (performance)
                newObstacles = newObstacles.filter(o => o.trackY > newDistance - 100);

                // Spawn new obstacles ahead
                // We check every 100px of distance roughly
                if (Math.floor(newDistance / 100) > obstacleSpawnCounter) {
                    obstacleSpawnCounter = Math.floor(newDistance / 100);

                    if (Math.random() < GAME_CONFIG.OBSTACLE_CHANCE) {
                        // Spawn randomly on the road width
                        const offset = (Math.random() * GAME_CONFIG.ROAD_WIDTH) - (GAME_CONFIG.ROAD_WIDTH / 2);
                        newObstacles.push({
                            id: uuidv4(),
                            trackY: newDistance + GAME_CONFIG.HEIGHT + 200, // Spawn off-screen top
                            offsetX: offset,
                            width: 40,
                            height: 40,
                            active: true
                        });
                    }
                }

                // 4. Collision Detection
                let isGameOver = false;

                // A. Road Boundaries
                // Get the road center at the car's current virtual Y (which is distance + offset)
                // Actually, strictly speaking, the car is fixed at screen bottom, 
                // but we are simulating the world moving.
                // The road center at the car's position is getRoadCurve(newDistance)
                const currentRoadCenterX = getRoadCurve(newDistance);

                // Calculate Car's deviation from road center
                // carX is 0 at center of screen. Road moves. 
                // Relative Pos = (Car Screen X) - (Road Screen X)
                // Actually simpler: 
                // We treat newCarX as "World X".
                // Distance is "World Y".
                // Road Center is "World X at World Y".

                if (
                    newCarX < currentRoadCenterX - GAME_CONFIG.ROAD_WIDTH / 2 + 20 ||
                    newCarX > currentRoadCenterX + GAME_CONFIG.ROAD_WIDTH / 2 - 20
                ) {
                    isGameOver = true; // Off-road
                }

                // B. Obstacles
                // We project obstacles to screen coordinates to check collision
                // Car is fixed at bottom: ScreenY = GAME_CONFIG.HEIGHT - 100
                const carScreenY = GAME_CONFIG.HEIGHT - 100;

                for (const obs of newObstacles) {
                    // Obstacle Screen Y = (Obstacle World Y - Current Distance) + CarScreenY ??
                    // No, usually in scroll: ScreenY =  HEIGHT - (ObsY - Distance) ... wait.
                    // Let's standardise:
                    // Distance increases. Objects at higher distance are "ahead" (Top of screen).
                    // Screen Y = CarScreenY - (Distance - Obs.trackY) ... No.

                    // Let's say Car is at Y=0 relative to camera.
                    // Obs is at `obs.trackY`. Camera is at `newDistance`.
                    // Relative Y = obs.trackY - newDistance.
                    // If Relative Y is 400, it's 400px ahead of car.

                    const relY = obs.trackY - newDistance;

                    // Box Collision
                    // Car is at (newCarX, 0)
                    // Obs is at (getRoadCurve(obs.trackY) + obs.offsetX, relY)

                    const obsWorldX = getRoadCurve(obs.trackY) + obs.offsetX;

                    if (
                        Math.abs(newCarX - obsWorldX) < (GAME_CONFIG.CAR_WIDTH / 2 + obs.width / 2) &&
                        Math.abs(0 - relY) < (GAME_CONFIG.CAR_HEIGHT / 2 + obs.height / 2)
                    ) {
                        isGameOver = true;
                    }
                }

                setGameState(prev => ({
                    ...prev,
                    distance: newDistance,
                    carX: newCarX,
                    carAngle: input.steer,
                    isNitro: input.nitro,
                    obstacles: newObstacles,
                    status: isGameOver ? 'GAME_OVER' : 'PLAYING',
                    score: Math.floor(newDistance / 10)
                }));
            }

            loopId = requestAnimationFrame(loop);
        };

        loop();
        return () => cancelAnimationFrame(loopId);
    }, [paused, getRoadCurve]);

    return { gameState, updateGyro, setNitro, startGame, resetGame, getRoadCurve };
}

// ==========================================
// 4. View Component
// ==========================================
interface Props {
    socket: Socket;
    roomId: string;
    onExit?: () => void;
    paused?: boolean;
    onPause?: () => void;
    onResume?: () => void;
    onScoreChange?: (score: number) => void;
    onStatusChange?: (status: any) => void;
}

export default function Game3({
    socket,
    roomId,
    paused = false,
    onPause,
    onResume,
    onScoreChange,
    onStatusChange
}: Props) {

    const { gameState, updateGyro, setNitro, startGame, resetGame, getRoadCurve } = useGameLogic(paused);
    const { distance, carX, carAngle, obstacles, status, score, isNitro } = gameState;

    // Effects for Sync
    useEffect(() => { if (onScoreChange) onScoreChange(score); }, [score, onScoreChange]);
    useEffect(() => { if (onStatusChange) onStatusChange(status); }, [status, onStatusChange]);

    // Socket
    useEffect(() => {
        const handleGyro = (data: GyroData) => updateGyro(data);
        const handleAction = (payload: any) => {
            const action = typeof payload === 'string' ? payload : payload.action;
            if (action === 'nitro-start') setNitro(true);
            if (action === 'nitro-end') setNitro(false);
            if (action === 'start-game') startGame();
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
    }, [socket, roomId, updateGyro, setNitro, resetGame, status, onPause, onResume]);

    // --- Rendering Helpers ---

    // We generate visual segments of the road ahead
    const roadSegments = useMemo(() => {
        const segments = [];
        // Draw from car position (0) to top of screen (+HEIGHT)
        // We draw slightly more to avoid popping
        for (let i = 0; i < GAME_CONFIG.VISIBLE_SEGMENTS; i++) {
            const yOffset = i * GAME_CONFIG.SEGMENT_HEIGHT;
            // World Y for this segment
            const worldY = distance + yOffset;
            // Road Center X at this world Y
            const roadCX = getRoadCurve(worldY);

            segments.push({
                key: i,
                bottom: yOffset, // Screen Y (from bottom up)
                centerX: roadCX
            });
        }
        return segments;
    }, [distance, getRoadCurve]);

    // Calculate Camera Offset: 
    // We want the Car (at carX) to be roughly in the center of the screen horizontally?
    // Or do we keep the screen fixed and the car moves?
    // Let's keep Screen Center = World X 0. Car moves left/right.
    const screenCenterX = GAME_CONFIG.WIDTH / 2;

    return (
        <div className="relative w-full h-screen bg-emerald-800 overflow-hidden flex items-center justify-center font-mono select-none">

            {/* Game Viewport */}
            <div
                className="relative bg-emerald-700 overflow-hidden shadow-2xl border-x-4 border-emerald-900"
                style={{ width: GAME_CONFIG.WIDTH, height: GAME_CONFIG.HEIGHT }}
            >

                {/* 1. Road Rendering (Segments) */}
                {roadSegments.map(seg => (
                    <div
                        key={seg.key}
                        className="absolute bg-slate-500 border-x-8 border-white"
                        style={{
                            bottom: seg.bottom, // Render from bottom up
                            left: screenCenterX + seg.centerX - GAME_CONFIG.ROAD_WIDTH / 2, // Map World X to Screen
                            width: GAME_CONFIG.ROAD_WIDTH,
                            height: GAME_CONFIG.SEGMENT_HEIGHT + 1, // +1 to prevent gaps
                            // Simple checkerboard pattern for speed sensation
                            backgroundColor: Math.floor((distance + seg.bottom) / 100) % 2 === 0 ? '#64748b' : '#475569'
                        }}
                    />
                ))}

                {/* 2. Obstacles */}
                {obstacles.map(obs => {
                    const relY = obs.trackY - distance; // Distance ahead of car
                    const obsWorldX = getRoadCurve(obs.trackY) + obs.offsetX;

                    // Only render if on screen
                    if (relY < -50 || relY > GAME_CONFIG.HEIGHT + 50) return null;

                    return (
                        <div
                            key={obs.id}
                            className="absolute bg-red-600 rounded-sm shadow-lg border-2 border-red-800"
                            style={{
                                bottom: relY,
                                left: screenCenterX + obsWorldX - obs.width / 2,
                                width: obs.width,
                                height: obs.height,
                            }}
                        >
                            <div className="w-full h-full opacity-30 bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,#000_5px,#000_10px)]" />
                        </div>
                    );
                })}

                {/* 3. Player Car */}
                <div
                    className="absolute z-20 shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition-transform duration-75"
                    style={{
                        bottom: 50, // Fixed near bottom
                        left: screenCenterX + carX - GAME_CONFIG.CAR_WIDTH / 2,
                        width: GAME_CONFIG.CAR_WIDTH,
                        height: GAME_CONFIG.CAR_HEIGHT,
                        transform: `rotate(${carAngle}deg)`
                    }}
                >
                    {/* Car Body */}
                    <div className={`w-full h-full rounded-lg border-2 border-black ${isNitro ? 'bg-orange-500 animate-pulse' : 'bg-blue-500'}`}>
                        {/* Hood (Front) */}
                        <div className="absolute top-0 inset-x-0 h-[30%] bg-black/20 rounded-t-md"></div>
                        {/* Roof */}
                        <div className="absolute top-[35%] inset-x-1 h-[25%] bg-sky-900 rounded-sm"></div>
                        {/* Trunk (Rear) */}
                        <div className="absolute bottom-0 inset-x-0 h-[20%] bg-black/10 rounded-b-md flex justify-around items-center px-1">
                            {/* Tail lights */}
                            <div className="w-3 h-2 bg-red-500 shadow-[0_0_5px_red]"></div>
                            <div className="w-3 h-2 bg-red-500 shadow-[0_0_5px_red]"></div>
                        </div>

                        {/* Nitro Flame FX */}
                        {isNitro && (
                            <div className="absolute top-full inset-x-2 h-8 bg-gradient-to-b from-yellow-400 to-transparent blur-sm"></div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}