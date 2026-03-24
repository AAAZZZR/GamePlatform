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
  const [isBraking, setIsBraking] = useState(false);
  const [isThrottling, setIsThrottling] = useState(false);

  const fire = (on: boolean) => (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction?.(on ? 'fire-start' : 'fire-end');
    setIsFiring(on);
    if (on && navigator.vibrate) navigator.vibrate(30);
  };

  const brake = (on: boolean) => (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction?.(on ? 'brake-start' : 'brake-end');
    setIsBraking(on);
    if (on && navigator.vibrate) navigator.vibrate(15);
  };

  const throttle = (on: boolean) => (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction?.(on ? 'throttle-start' : 'throttle-end');
    setIsThrottling(on);
    if (on && navigator.vibrate) navigator.vibrate(20);
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-900 select-none touch-none flex items-center justify-between px-8">

      {/* ── LEFT: Fire + Brake ── */}
      <div className="flex flex-col items-center gap-4">
        {/* Fire */}
        <button
          className={`relative w-32 h-32 rounded-full border-4 transition-all duration-75 flex flex-col items-center justify-center gap-0.5
            ${isFiring ? 'bg-red-500/40 border-red-400/60 scale-95' : 'bg-red-500/20 border-red-400/40'}`}
          style={{ boxShadow: isFiring ? '0 0 35px rgba(239,68,68,0.6)' : '0 0 15px rgba(239,68,68,0.2)' }}
          onTouchStart={fire(true)} onTouchEnd={fire(false)} onTouchCancel={fire(false)}
          onMouseDown={fire(true)} onMouseUp={fire(false)} onMouseLeave={fire(false)}
        >
          <div className="absolute inset-2.5 border border-white/10 rounded-full" />
          <div className={`text-xl font-black tracking-wider ${isFiring ? 'text-red-300' : 'text-red-400'}`}>FIRE</div>
          <div className="text-white/30 text-[10px]">Hold</div>
        </button>

        {/* Brake */}
        <button
          className={`relative w-24 h-24 rounded-full border-3 transition-all duration-75 flex flex-col items-center justify-center gap-0.5
            ${isBraking ? 'bg-cyan-500/40 border-cyan-400/60 scale-95' : 'bg-cyan-500/15 border-cyan-400/30'}`}
          style={{ boxShadow: isBraking ? '0 0 25px rgba(34,211,238,0.5)' : '0 0 10px rgba(34,211,238,0.15)' }}
          onTouchStart={brake(true)} onTouchEnd={brake(false)} onTouchCancel={brake(false)}
          onMouseDown={brake(true)} onMouseUp={brake(false)} onMouseLeave={brake(false)}
        >
          <div className={`text-base font-black tracking-wider ${isBraking ? 'text-cyan-300' : 'text-cyan-400/80'}`}>BRAKE</div>
          <div className="text-white/25 text-[9px]">Hold</div>
        </button>
      </div>

      {/* ── Center hint ── */}
      <p className="text-gray-600 text-[10px] font-mono tracking-wider">TILT TO FLY</p>

      {/* ── RIGHT: Throttle ── */}
      <button
        className={`relative w-36 h-36 rounded-full border-4 transition-all duration-75 flex flex-col items-center justify-center gap-1
          ${isThrottling ? 'bg-emerald-500/40 border-emerald-400/60 scale-95' : 'bg-emerald-500/20 border-emerald-400/40'}`}
        style={{ boxShadow: isThrottling ? '0 0 40px rgba(52,211,153,0.5)' : '0 0 20px rgba(52,211,153,0.2)' }}
        onTouchStart={throttle(true)} onTouchEnd={throttle(false)} onTouchCancel={throttle(false)}
        onMouseDown={throttle(true)} onMouseUp={throttle(false)} onMouseLeave={throttle(false)}
      >
        <div className="absolute inset-3 border border-white/10 rounded-full" />
        <div className={`text-2xl font-black tracking-wider ${isThrottling ? 'text-emerald-300' : 'text-emerald-400'}`}>
          THROTTLE
        </div>
        <div className="text-white/40 text-xs">Hold</div>
      </button>

    </div>
  );
}
