// games/game4/MobileController.tsx — Snake Mobile Controller
'use client';
import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';

interface Props {
  socket: Socket | null;
  roomId: string | null;
}

export default function SnakeMobileController({ socket, roomId }: Props) {
  const [currentDir, setCurrentDir] = useState('→');
  const [isBoosting, setIsBoosting] = useState(false);

  const sendAction = (action: string) => {
    if (socket && roomId) {
      socket.emit('controller-action', { action, roomId });
    }
  };

  // Listen for direction changes from gyro (reflected back from game logic via sync)
  // We just show the visual cue based on tilt; actual direction is set by gyro

  const handleBoostStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction('boost-start');
    setIsBoosting(true);
    if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
  };

  const handleBoostEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction('boost-end');
    setIsBoosting(false);
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-900 select-none touch-none flex flex-col items-center justify-center gap-8">

      {/* Tilt hint visualizer */}
      <div className="flex flex-col items-center gap-3">
        <div className="text-green-400/60 text-xs font-mono tracking-widest uppercase mb-1">Tilt to Steer</div>
        <div className="relative w-32 h-32 border-2 border-green-500/30 rounded-full flex items-center justify-center"
          style={{ background: 'radial-gradient(circle, rgba(74,222,128,0.05), transparent)' }}>
          <div className="absolute top-3 text-green-400/50 text-xl">↑</div>
          <div className="absolute bottom-3 text-green-400/50 text-xl">↓</div>
          <div className="absolute left-3 text-green-400/50 text-xl">←</div>
          <div className="absolute right-3 text-green-400/50 text-xl">→</div>
          <div className="text-green-400 text-3xl font-black">{currentDir}</div>
        </div>
      </div>

      {/* Boost Button */}
      <button
        className={`
          relative w-40 h-40 rounded-full
          border-[5px] transition-all duration-75
          flex flex-col items-center justify-center gap-1
          ${isBoosting
            ? 'bg-gradient-to-br from-yellow-400 to-orange-500 border-yellow-300/60 scale-95 shadow-[0_0_50px_rgba(251,191,36,0.8)]'
            : 'bg-gradient-to-br from-green-600 to-emerald-800 border-green-400/40 shadow-[0_0_30px_rgba(74,222,128,0.3)]'
          }
        `}
        onTouchStart={handleBoostStart}
        onTouchEnd={handleBoostEnd}
        onMouseDown={handleBoostStart}
        onMouseUp={handleBoostEnd}
        onMouseLeave={handleBoostEnd}
      >
        <div className="absolute inset-3 border border-white/10 rounded-full" />
        <div className="text-3xl">{isBoosting ? '⚡' : '🐍'}</div>
        <div className="text-white font-black text-lg tracking-wider">{isBoosting ? 'BOOST!' : 'BOOST'}</div>
        <div className="text-white/50 text-xs">Hold for speed</div>
      </button>

      {/* Hint */}
      <div className="text-white/20 text-xs font-mono text-center px-6">
        TILT PHONE TO CHANGE DIRECTION
      </div>
    </div>
  );
}
