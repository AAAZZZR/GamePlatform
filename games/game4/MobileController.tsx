// games/game4/MobileController.tsx — Tunnel Runner Controller
'use client';
import React, { useState } from 'react';

interface Props {
  socket: any;
  roomId: string;
  sendAction?: (action: string) => void;
}

export default function TunnelRunnerMobileController({ sendAction }: Props) {
  const [isBoosting, setIsBoosting] = useState(false);

  const handleBoostStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction?.('boost-start');
    setIsBoosting(true);
    if (navigator.vibrate) navigator.vibrate(30);
  };

  const handleBoostEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction?.('boost-end');
    setIsBoosting(false);
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-900 select-none touch-none flex flex-col items-center justify-center gap-6">
      {/* Boost Button */}
      <button
        className={`
          relative w-36 h-36 rounded-full
          border-4 transition-all duration-75
          flex flex-col items-center justify-center gap-1
          ${isBoosting
            ? 'bg-orange-500/30 border-orange-400/60 scale-95'
            : 'bg-cyan-500/10 border-cyan-400/30'
          }
        `}
        style={{
          boxShadow: isBoosting
            ? '0 0 40px rgba(255,102,0,0.5)'
            : '0 0 20px rgba(0,204,255,0.2)',
        }}
        onTouchStart={handleBoostStart}
        onTouchEnd={handleBoostEnd}
        onMouseDown={handleBoostStart}
        onMouseUp={handleBoostEnd}
        onMouseLeave={handleBoostEnd}
      >
        <div className="absolute inset-3 border border-white/10 rounded-full" />
        <div className={`text-2xl font-black tracking-wider ${isBoosting ? 'text-orange-400' : 'text-cyan-400'}`}>
          {isBoosting ? 'BOOST!' : 'BOOST'}
        </div>
        <div className="text-white/40 text-xs">Hold</div>
      </button>

      <p className="text-gray-600 text-[10px] font-mono tracking-wider">TILT TO DODGE WALLS</p>
    </div>
  );
}
