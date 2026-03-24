// games/game10/MobileController.tsx — Skeet Shooter Mobile Controller
'use client';
import React from 'react';

interface Props {
  socket: any;
  roomId: string;
  sendAction?: (action: string) => void;
}

export default function SkeetShooterMobileController({ sendAction }: Props) {

  /* ---------- PULL handler (single tap) ---------- */
  const handlePull = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction?.('pull');
    if (navigator.vibrate) navigator.vibrate(30);
  };

  /* ---------- SHOOT handler (single tap) ---------- */
  const handleShoot = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction?.('shoot');
    if (navigator.vibrate) navigator.vibrate(40);
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-900 select-none touch-manipulation flex items-center justify-between px-12" style={{ paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}>

      {/* ── PULL button (LEFT) ── */}
      <button
        className={`
          relative w-36 h-36 rounded-full
          border-4 transition-all duration-75
          flex flex-col items-center justify-center gap-1
          bg-cyan-500/20 border-cyan-400/40
          active:bg-cyan-500/40 active:border-cyan-400/60 active:scale-95
          touch-none
        `}
        style={{
          boxShadow: '0 0 20px rgba(6,182,212,0.25)',
        }}
        onTouchStart={handlePull}
        onClick={handlePull}
      >
        <div className="absolute inset-3 border border-white/10 rounded-full" />
        <div className="text-2xl font-black tracking-wider text-cyan-400">
          PULL
        </div>
        <div className="text-white/40 text-xs">Tap</div>
      </button>

      {/* ── Center hint ── */}
      <p className="text-gray-600 text-[10px] font-mono tracking-wider">TILT TO AIM</p>

      {/* ── SHOOT button (RIGHT) ── */}
      <button
        className={`
          relative w-36 h-36 rounded-full
          border-4 transition-all duration-75
          flex flex-col items-center justify-center gap-1
          bg-red-500/20 border-red-400/40
          active:bg-red-500/40 active:border-red-400/60 active:scale-95
          touch-none
        `}
        style={{
          boxShadow: '0 0 20px rgba(239,68,68,0.25)',
        }}
        onTouchStart={handleShoot}
        onClick={handleShoot}
      >
        <div className="absolute inset-3 border border-white/10 rounded-full" />
        <div className="text-2xl font-black tracking-wider text-red-400">
          SHOOT
        </div>
        <div className="text-white/40 text-xs">Tap</div>
      </button>

    </div>
  );
}
