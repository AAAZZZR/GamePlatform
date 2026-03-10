// games/game5/MobileController.tsx — Asteroid Dodge Mobile Controller
'use client';
import React, { useState } from 'react';
import { Socket } from 'socket.io-client';

interface Props {
  socket: Socket | null;
  roomId: string | null;
}

export default function AsteroidMobileController({ socket, roomId }: Props) {
  const [shieldActive, setShieldActive] = useState(false);
  const [dashCooldown, setDashCooldown] = useState(false);

  const sendAction = (action: string) => {
    if (socket && roomId) {
      socket.emit('controller-action', { action, roomId });
    }
  };

  const handleShield = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (shieldActive) return;
    sendAction('shield');
    setShieldActive(true);
    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
    setTimeout(() => setShieldActive(false), 4500);
  };

  const handleDash = (dir: 'left' | 'right') => (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (dashCooldown) return;
    sendAction(`dash-${dir}`);
    setDashCooldown(true);
    if (navigator.vibrate) navigator.vibrate(30);
    setTimeout(() => setDashCooldown(false), 1600);
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-950 select-none touch-none flex flex-col">

      {/* Top: Score display hint */}
      <div className="flex justify-center pt-4 pb-2">
        <div className="text-indigo-400/60 text-xs font-mono tracking-widest uppercase">
          ← TILT TO DODGE →
        </div>
      </div>

      {/* Middle: Dash Buttons */}
      <div className="flex-1 flex items-center justify-between px-4 gap-4">
        {/* Dash Left */}
        <button
          className={`
            flex-1 h-28 rounded-2xl flex flex-col items-center justify-center gap-1
            border-2 transition-all duration-100
            ${dashCooldown
              ? 'bg-slate-800 border-slate-700 opacity-40'
              : 'bg-gradient-to-br from-blue-600 to-indigo-800 border-blue-400/40 shadow-[0_0_20px_rgba(99,102,241,0.3)] active:scale-95'
            }
          `}
          onTouchStart={handleDash('left')}
          onMouseDown={handleDash('left')}
          disabled={dashCooldown}
        >
          <div className="text-3xl">◀◀</div>
          <div className="text-white font-bold text-sm tracking-wider">DASH LEFT</div>
        </button>

        {/* Dash Right */}
        <button
          className={`
            flex-1 h-28 rounded-2xl flex flex-col items-center justify-center gap-1
            border-2 transition-all duration-100
            ${dashCooldown
              ? 'bg-slate-800 border-slate-700 opacity-40'
              : 'bg-gradient-to-bl from-blue-600 to-indigo-800 border-blue-400/40 shadow-[0_0_20px_rgba(99,102,241,0.3)] active:scale-95'
            }
          `}
          onTouchStart={handleDash('right')}
          onMouseDown={handleDash('right')}
          disabled={dashCooldown}
        >
          <div className="text-3xl">▶▶</div>
          <div className="text-white font-bold text-sm tracking-wider">DASH RIGHT</div>
        </button>
      </div>

      {/* Bottom: Shield Button */}
      <div className="px-6 pb-6">
        <button
          className={`
            w-full h-24 rounded-2xl border-[3px] flex items-center justify-center gap-3
            font-black text-2xl tracking-wider transition-all duration-150
            ${shieldActive
              ? 'bg-gradient-to-r from-cyan-500 to-blue-500 border-cyan-300/80 shadow-[0_0_40px_rgba(34,211,238,0.8)] animate-pulse text-white'
              : 'bg-gradient-to-r from-cyan-900 to-blue-900 border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.2)] text-cyan-300 active:scale-95'
            }
          `}
          onTouchStart={handleShield}
          onMouseDown={handleShield}
          disabled={shieldActive}
        >
          <span className="text-3xl">{shieldActive ? '🛡️' : '🛡'}</span>
          <span>{shieldActive ? 'SHIELDED!' : 'SHIELD'}</span>
        </button>
      </div>
    </div>
  );
}
