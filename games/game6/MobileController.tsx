// games/game6/MobileController.tsx — Labyrinth Mobile Controller
'use client';
import React, { useState } from 'react';
import { Socket } from 'socket.io-client';

interface Props {
  socket: Socket | null;
  roomId: string | null;
  sendAction?: (action: string) => void;
}

export default function LabyrinthMobileController({ socket, roomId, sendAction }: Props) {
  const [started, setStarted] = useState(false);

  const handleStart = () => {
    sendAction?.('start-game');
    setStarted(true);
    if (navigator.vibrate) navigator.vibrate(40);
  };

  const handleRestart = () => {
    sendAction?.('restart-game');
    setStarted(false);
    if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
  };

  return (
    <div
      className="w-full h-full relative overflow-hidden select-none touch-none flex flex-col items-center justify-center gap-6"
      style={{
        background: 'linear-gradient(160deg, #2d1a0e 0%, #1a0e07 50%, #2d1a0e 100%)',
      }}
    >
      {/* Tilt visualization */}
      <div className="flex flex-col items-center gap-3 mb-2">
        <div
          className="text-xs font-mono tracking-widest uppercase"
          style={{ color: 'rgba(255,200,130,0.5)' }}
        >
          Tilt to Guide the Ball
        </div>
        <div
          className="relative w-28 h-28 rounded-full flex items-center justify-center"
          style={{
            border: '2px solid rgba(210,160,80,0.25)',
            background: 'radial-gradient(circle, rgba(210,160,80,0.06), transparent)',
          }}
        >
          {/* Direction arrows */}
          <div className="absolute top-2" style={{ color: 'rgba(210,160,80,0.35)', fontSize: 18 }}>^</div>
          <div className="absolute bottom-2" style={{ color: 'rgba(210,160,80,0.35)', fontSize: 18, transform: 'rotate(180deg)' }}>^</div>
          <div className="absolute left-2" style={{ color: 'rgba(210,160,80,0.35)', fontSize: 18, transform: 'rotate(-90deg)' }}>^</div>
          <div className="absolute right-2" style={{ color: 'rgba(210,160,80,0.35)', fontSize: 18, transform: 'rotate(90deg)' }}>^</div>
          {/* Ball indicator */}
          <div
            className="w-6 h-6 rounded-full"
            style={{
              background: 'radial-gradient(circle at 35% 30%, #fff, #c0c0c0 40%, #808080)',
              boxShadow: '1px 2px 4px rgba(0,0,0,0.4)',
            }}
          />
        </div>
      </div>

      {/* Buttons */}
      <div className="flex flex-col items-center gap-4">
        {/* START button */}
        {!started && (
          <button
            className="relative rounded-full flex flex-col items-center justify-center transition-all duration-75 active:scale-95"
            style={{
              width: 160,
              height: 160,
              background: 'linear-gradient(135deg, #d4a017 0%, #b8860b 50%, #a07008 100%)',
              border: '5px solid rgba(255,215,100,0.35)',
              boxShadow: '0 0 30px rgba(255,200,50,0.25), inset 0 2px 4px rgba(255,255,255,0.15)',
            }}
            onTouchStart={(e) => { e.preventDefault(); handleStart(); }}
            onMouseDown={handleStart}
          >
            <div
              className="absolute rounded-full"
              style={{ inset: 10, border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <div className="text-white font-black text-2xl tracking-wider drop-shadow-md">
              START
            </div>
            <div className="text-white/50 text-xs mt-1">Tap to begin</div>
          </button>
        )}

        {/* RESTART button (shown after start) */}
        {started && (
          <button
            className="relative rounded-full flex flex-col items-center justify-center transition-all duration-75 active:scale-95"
            style={{
              width: 140,
              height: 140,
              background: 'linear-gradient(135deg, #8B4513 0%, #6b3410 50%, #5a2a0d 100%)',
              border: '4px solid rgba(180,120,60,0.3)',
              boxShadow: '0 0 20px rgba(140,80,30,0.2), inset 0 2px 4px rgba(255,255,255,0.08)',
            }}
            onTouchStart={(e) => { e.preventDefault(); handleRestart(); }}
            onMouseDown={handleRestart}
          >
            <div
              className="absolute rounded-full"
              style={{ inset: 8, border: '1px solid rgba(255,255,255,0.06)' }}
            />
            <div className="text-amber-100/90 font-black text-xl tracking-wider drop-shadow-md">
              RESTART
            </div>
            <div className="text-amber-100/40 text-xs mt-1">Level 1</div>
          </button>
        )}
      </div>

      {/* Hint */}
      <div
        className="text-xs font-mono text-center px-6 mt-2"
        style={{ color: 'rgba(255,200,130,0.2)' }}
      >
        TILT YOUR PHONE TO ROLL THE BALL<br />
        AVOID THE HOLES &middot; REACH THE GOLD
      </div>
    </div>
  );
}
