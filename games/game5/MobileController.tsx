// games/game5/MobileController.tsx — Tilt to Live Mobile Controller
'use client';
import React, { useState } from 'react';
import { Socket } from 'socket.io-client';

interface Props {
  socket: Socket | null;
  roomId: string | null;
  sendAction?: (action: string) => void;
}

export default function TiltToLiveMobileController({ socket, roomId, sendAction }: Props) {
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction?.('start-game');
    setGameStarted(true);
    setGameOver(false);
    if (navigator.vibrate) navigator.vibrate(40);
  };

  const handleRestart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction?.('restart-game');
    setGameStarted(true);
    setGameOver(false);
    if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
  };

  return (
    <div
      className="w-full h-full relative overflow-hidden select-none touch-manipulation flex flex-col items-center justify-center gap-8"
      style={{ background: 'radial-gradient(ellipse at center, #0a0e1a 0%, #050510 70%, #020208 100%)', paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}
    >
      {/* Subtle grid overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(103,232,249,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      {/* Title / Logo area */}
      <div className="flex flex-col items-center gap-2 z-10">
        <div className="text-cyan-400 text-2xl font-black tracking-widest"
          style={{ textShadow: '0 0 20px rgba(103,232,249,0.4)' }}>
          TILT TO LIVE
        </div>
        <div className="text-white/20 text-xs tracking-[0.2em]">ARENA SURVIVAL</div>
      </div>

      {/* Tilt indicator */}
      <div className="relative z-10 flex flex-col items-center gap-3">
        <div className="relative w-28 h-28 border-2 border-cyan-500/20 rounded-full flex items-center justify-center"
          style={{ background: 'radial-gradient(circle, rgba(103,232,249,0.05), transparent)' }}>
          {/* Directional arrows */}
          <div className="absolute top-2 text-cyan-400/40 text-lg">&#9650;</div>
          <div className="absolute bottom-2 text-cyan-400/40 text-lg">&#9660;</div>
          <div className="absolute left-2 text-cyan-400/40 text-lg">&#9664;</div>
          <div className="absolute right-2 text-cyan-400/40 text-lg">&#9654;</div>
          {/* Center arrow */}
          <svg viewBox="0 0 36 36" className="w-10 h-10"
            style={{ filter: 'drop-shadow(0 0 4px rgba(103,232,249,0.6))' }}>
            <polygon
              points="18,6 27,28 18,22 9,28"
              fill="#67e8f9"
              stroke="#a5f3fc"
              strokeWidth="1"
            />
          </svg>
        </div>
        <div className="text-cyan-400/50 text-xs font-mono tracking-widest">TILT TO MOVE</div>
      </div>

      {/* Main action button */}
      <div className="z-10">
        {!gameStarted ? (
          <button
            className="
              relative w-44 h-44 rounded-full
              bg-gradient-to-br from-cyan-500 to-cyan-700
              border-[5px] border-cyan-400/40
              shadow-[0_0_40px_rgba(103,232,249,0.4)]
              active:scale-90 active:brightness-125
              transition-all duration-75
              flex flex-col items-center justify-center gap-1
              touch-none
            "
            onTouchStart={handleStart}
            onMouseDown={handleStart}
          >
            <div className="absolute inset-3 border border-white/10 rounded-full" />
            <div className="text-white font-black text-2xl tracking-widest drop-shadow-md">
              START
            </div>
            <div className="text-white/50 text-xs tracking-wider">TAP TO BEGIN</div>
          </button>
        ) : (
          <button
            className="
              relative w-44 h-44 rounded-full
              bg-gradient-to-br from-red-500 to-red-700
              border-[5px] border-red-400/40
              shadow-[0_0_40px_rgba(239,68,68,0.4)]
              active:scale-90 active:brightness-125
              transition-all duration-75
              flex flex-col items-center justify-center gap-1
              touch-none
            "
            onTouchStart={handleRestart}
            onMouseDown={handleRestart}
          >
            <div className="absolute inset-3 border border-white/10 rounded-full" />
            <div className="text-white font-black text-2xl tracking-widest drop-shadow-md">
              RESTART
            </div>
            <div className="text-white/50 text-xs tracking-wider">NEW GAME</div>
          </button>
        )}
      </div>

      {/* Powerup legend */}
      <div className="z-10 flex gap-5">
        {[
          { label: 'M', color: '#3b82f6', name: 'MISSILE' },
          { label: 'N', color: '#eab308', name: 'NUKE' },
          { label: 'F', color: '#22c55e', name: 'FREEZE' },
          { label: 'V', color: '#a855f7', name: 'VORTEX' },
        ].map(pw => (
          <div key={pw.label} className="flex flex-col items-center gap-1">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
              style={{
                background: pw.color,
                boxShadow: `0 0 8px ${pw.color}44`,
              }}>
              {pw.label}
            </div>
            <div className="text-white/20 text-[9px] tracking-wider">{pw.name}</div>
          </div>
        ))}
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center z-10">
        <div className="text-white/15 text-[10px] font-mono tracking-widest">
          PURE TILT CONTROLS &bull; COLLECT ORBS TO ATTACK
        </div>
      </div>
    </div>
  );
}
