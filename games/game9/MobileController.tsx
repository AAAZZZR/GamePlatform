// games/game9/MobileController.tsx — Sky Fighter Mobile Controller
'use client';
import React, { useState } from 'react';

interface Props {
  socket: any;
  roomId: string;
  sendAction?: (action: string) => void;
}

export default function SkyFighterMobileController({ sendAction }: Props) {
  const [isFiring, setIsFiring] = useState(false);
  const [isBoosting, setIsBoosting] = useState(false);

  /* ---------- FIRE handlers ---------- */
  const handleFireStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction?.('fire-start');
    setIsFiring(true);
    if (navigator.vibrate) navigator.vibrate(30);
  };

  const handleFireEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction?.('fire-end');
    setIsFiring(false);
  };

  /* ---------- BOOST handlers ---------- */
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
    <div className="w-full h-full relative overflow-hidden bg-slate-900 select-none touch-none flex items-center justify-between px-12">

      {/* ── FIRE button (LEFT) ── */}
      <button
        className={`
          relative w-36 h-36 rounded-full
          border-4 transition-all duration-75
          flex flex-col items-center justify-center gap-1
          ${isFiring
            ? 'bg-red-500/40 border-red-400/60 scale-95'
            : 'bg-red-500/20 border-red-400/40'
          }
        `}
        style={{
          boxShadow: isFiring
            ? '0 0 40px rgba(239,68,68,0.6)'
            : '0 0 20px rgba(239,68,68,0.25)',
        }}
        onTouchStart={handleFireStart}
        onTouchEnd={handleFireEnd}
        onMouseDown={handleFireStart}
        onMouseUp={handleFireEnd}
        onMouseLeave={handleFireEnd}
      >
        <div className="absolute inset-3 border border-white/10 rounded-full" />
        <div className={`text-2xl font-black tracking-wider ${isFiring ? 'text-red-300' : 'text-red-400'}`}>
          FIRE
        </div>
        <div className="text-white/40 text-xs">Hold</div>
      </button>

      {/* ── Center hint ── */}
      <p className="text-gray-600 text-[10px] font-mono tracking-wider">TILT TO FLY</p>

      {/* ── BOOST button (RIGHT) ── */}
      <button
        className={`
          relative w-36 h-36 rounded-full
          border-4 transition-all duration-75
          flex flex-col items-center justify-center gap-1
          ${isBoosting
            ? 'bg-orange-500/40 border-orange-400/60 scale-95'
            : 'bg-orange-500/20 border-orange-400/40'
          }
        `}
        style={{
          boxShadow: isBoosting
            ? '0 0 40px rgba(255,102,0,0.5)'
            : '0 0 20px rgba(249,115,22,0.25)',
        }}
        onTouchStart={handleBoostStart}
        onTouchEnd={handleBoostEnd}
        onMouseDown={handleBoostStart}
        onMouseUp={handleBoostEnd}
        onMouseLeave={handleBoostEnd}
      >
        <div className="absolute inset-3 border border-white/10 rounded-full" />
        <div className={`text-2xl font-black tracking-wider ${isBoosting ? 'text-orange-300' : 'text-orange-400'}`}>
          BOOST
        </div>
        <div className="text-white/40 text-xs">Hold</div>
      </button>

    </div>
  );
}
