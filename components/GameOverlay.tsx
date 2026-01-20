import { GameStatus } from '@/types/game';

interface GameOverlayProps {
    status: GameStatus;
    score: number;
}

export default function GameOverlay({ status, score }: GameOverlayProps) {
    return (
        <div className="absolute inset-0 z-40 pointer-events-none flex flex-col items-center justify-center">
            {/* 1. Score Display (Always Visible or Conditional?) 
          Usually visible during play, but maybe centralized here? 
          For now, let's keep the score display logic from Game1 here if it's meant to be global.
          Actually, Game1 handles its own score display position. 
          But the requirement said "move game over ready mask to outer layer".
      */}

            {/* Game Over Overlay */}
            {status === 'GAME_OVER' && (
                <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center animate-fade-in pointer-events-auto">
                    <h1 className="text-6xl md:text-8xl font-black text-red-500 mb-4 tracking-tighter">GAME OVER</h1>
                    <p className="text-white text-xl mb-8">FINAL SCORE: <span className="text-yellow-400">{score.toString().padStart(6, '0')}</span></p>
                </div>
            )}

            {/* Ready Overlay */}
            {status === 'READY' && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center">
                    <div className="text-cyan-400 font-bold tracking-[0.5em] text-sm animate-pulse">
                        Reset your center & Start your game via phone...
                    </div>
                </div>
            )}

            {/* Paused Overlay (Optional addition since we have paused state) */}
            {status === 'PAUSED' && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
                    <h2 className="text-4xl font-bold text-white tracking-widest">PAUSED</h2>
                </div>
            )}
        </div>
    );
}
