import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';

interface MobileGameOverlayProps {
    socket: Socket | null;
    roomId: string | null;
    status: string; // 'READY', 'PLAYING', 'GAME_OVER', ...
    onRestart?: () => void;
    onExit?: () => void;
}

export default function MobileGameOverlay({ socket, roomId, status, onRestart, onExit }: MobileGameOverlayProps) {
    const [showSettings, setShowSettings] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);

    // Sync internal Ready state when status changes to GAME_OVER or READY from server
    useEffect(() => {
        if (status === 'GAME_OVER' || status === 'READY') {
            setIsReady(false);
            setCountdown(null);
        }
    }, [status]);

    // --- Actions ---

    const handleReady = () => {
        // Permission check for IOS 13+
        if (typeof DeviceOrientationEvent !== 'undefined' && (DeviceOrientationEvent as any).requestPermission) {
            (DeviceOrientationEvent as any).requestPermission()
                .then((response: string) => {
                    if (response === 'granted') {
                        startCountdown();
                    } else {
                        alert('Gyroscope permission required!');
                    }
                })
                .catch(console.error);
        } else {
            startCountdown();
        }
    };

    const startCountdown = () => {
        setIsReady(true);
        setCountdown(3);
    };

    const handleResetCenter = () => {
        if (socket && roomId) {
            socket.emit('reset-position', { roomId });
            if (navigator.vibrate) navigator.vibrate(50);
        }
    };

    // Countdown Logic
    useEffect(() => {
        if (countdown === null) return;
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(c => (c as number) - 1), 1000);
            return () => clearTimeout(timer);
        } else {
            setCountdown(null);
            if (socket && roomId) {
                socket.emit('controller-action', { action: 'start-game', roomId });
            }
        }
    }, [countdown, socket, roomId]);


    // --- Render ---

    // 1. Game Over Overlay
    if (status === 'GAME_OVER') {
        return (
            <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-black/90 backdrop-blur z-50">
                <h2 className="text-4xl font-black text-red-500 mb-8 tracking-tighter">GAME OVER</h2>
                <div className="flex flex-col gap-4 w-64">
                    <button
                        onClick={() => {
                            if (socket && roomId) socket.emit('controller-action', { action: 'restart-game', roomId });
                            // Local ready state reset handled by useEffect
                        }}
                        className="w-full py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold rounded-lg uppercase tracking-widest transition-all active:scale-95"
                    >
                        Restart
                    </button>
                    <button
                        onClick={() => {
                            if (socket && roomId) socket.emit('select-game', { roomId, gameId: 'LOBBY' });
                        }}
                        className="w-full py-4 bg-red-600/80 hover:bg-red-600 text-white font-bold rounded-lg uppercase tracking-widest transition-all active:scale-95"
                    >
                        Back to Lobby
                    </button>
                </div>
            </div>
        );
    }

    // 2. Ready Overlay (Before Start)
    // Only show if not playing and not counting down (Wait, if status is READY from server)
    // Implementation note: The server status might be READY, but we also have local `isReady` (user pressed button).
    // If server is READY and local `!isReady`, show button.
    if (status === 'READY' && !isReady) {
        return (
            <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur pb-12 gap-6 z-40">
                <button
                    onClick={handleReady}
                    className="px-8 py-4 bg-cyan-500 hover:bg-cyan-400 text-white text-xl font-bold rounded-full shadow-[0_0_30px_rgba(34,211,238,0.6)] animate-pulse transition-all active:scale-95"
                >
                    READY TO START
                </button>

                <button
                    onClick={handleResetCenter}
                    className="px-6 py-2 bg-white/5 border border-white/10 text-gray-400 text-sm font-bold rounded-full hover:bg-white/10 active:scale-95 transition-all"
                >
                    RESET CENTER
                </button>

                <p className="mt-8 text-white/30 text-xs font-mono">Tap Ready then hold phone flat</p>
            </div>
        );
    }

    // 3. Countdown Overlay
    if (countdown !== null && countdown > 0) {
        return (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
                <div className="text-9xl font-black text-white animate-bounce">
                    {countdown}
                </div>
            </div>
        );
    }

    // 4. Settings Menu (Overlay)
    // Always available during play via gear icon
    return (
        <>
            {/* Settings Button */}
            <button
                onClick={() => {
                    const newShow = !showSettings;
                    setShowSettings(newShow);
                    if (newShow) {
                        if (socket && roomId) socket.emit('controller-action', { action: 'pause', roomId });
                    } else {
                        if (socket && roomId) socket.emit('controller-action', { action: 'resume', roomId });
                    }
                }}
                className="absolute top-6 left-6 p-4 bg-white/10 rounded-full text-white/70 hover:bg-white/20 active:scale-95 backdrop-blur-sm z-30"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
            </button>

            {/* Settings Modal */}
            {showSettings && (
                <div className="absolute top-20 left-6 bg-black/90 border border-white/20 p-4 rounded-xl backdrop-blur w-64 z-50 text-white flex flex-col gap-2 max-h-[80vh] overflow-y-auto">
                    <h3 className="text-sm font-bold text-gray-400 mb-2 uppercase">Menu</h3>

                    <button
                        onClick={() => {
                            handleResetCenter();
                            setShowSettings(false);
                            // Note: Assuming we want to close and resume or stay paused? 
                            // Current logic mostly resumes on close unless we explicitly just close. 
                            // Original code: closed implies resume.
                            if (socket && roomId) socket.emit('controller-action', { action: 'resume', roomId });
                        }}
                        className="w-full py-3 bg-cyan-600/30 border border-cyan-500/50 rounded text-xs font-bold text-cyan-300 hover:bg-cyan-600/50 uppercase"
                    >
                        RESET CENTER
                    </button>

                    <div className="h-px bg-white/10 my-1" />

                    <button
                        onClick={() => {
                            if (socket && roomId) socket.emit('controller-action', { action: 'resume', roomId });
                            setShowSettings(false);
                        }}
                        className="w-full py-3 bg-green-600/30 border border-green-500/50 rounded text-xs font-bold text-green-300 hover:bg-green-600/50 uppercase"
                    >
                        RESUME GAME
                    </button>

                    <button
                        onClick={() => {
                            if (socket && roomId) socket.emit('select-game', { roomId, gameId: 'LOBBY' });
                        }}
                        className="w-full py-3 bg-red-600/20 border border-red-500/50 rounded text-xs font-bold text-red-400 hover:bg-red-600/50 uppercase"
                    >
                        EXIT TO LOBBY
                    </button>

                    <button
                        onClick={() => {
                            if (socket && roomId) socket.emit('controller-action', { action: 'resume', roomId });
                            setShowSettings(false);
                        }}
                        className="w-full py-3 bg-white/10 rounded text-xs font-bold uppercase hover:bg-white/20"
                    >
                        CLOSE
                    </button>
                </div>
            )}
        </>
    );
}
