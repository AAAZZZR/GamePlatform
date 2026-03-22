// games/game8/MobileController.tsx — Paper Plane Mobile Controller
'use client';
import React, { useState } from 'react';
import { Socket } from 'socket.io-client';

interface Props {
  socket: Socket | null;
  roomId: string | null;
  sendAction?: (action: string) => void;
}

export default function PaperPlaneMobileController({ socket, roomId, sendAction }: Props) {
  const [isBoosting, setIsBoosting] = useState(false);
  const [started, setStarted] = useState(false);

  const handleStart = () => {
    sendAction?.('start-game');
    setStarted(true);
  };

  const handleRestart = () => {
    sendAction?.('restart-game');
    setStarted(false);
  };

  const handleBoostStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction?.('boost-start');
    setIsBoosting(true);
    if (navigator.vibrate) navigator.vibrate(20);
  };

  const handleBoostEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction?.('boost-end');
    setIsBoosting(false);
  };

  return (
    <div
      className="w-full h-full relative overflow-hidden select-none touch-none flex flex-col items-center justify-between py-8"
      style={{
        background: 'linear-gradient(180deg, #E8F4FD 0%, #B8D8F0 50%, #A0C4E0 100%)',
      }}
    >
      {/* Top: Title + Buttons */}
      <div className="flex flex-col items-center gap-3 z-10">
        <div
          className="text-sm font-bold tracking-widest uppercase"
          style={{ color: '#6B8FC4' }}
        >
          Paper Plane
        </div>

        {/* Start / Restart Buttons */}
        <div className="flex gap-3">
          {!started ? (
            <button
              className="
                px-8 py-3 rounded-full font-bold text-lg
                active:scale-95 transition-transform
              "
              style={{
                background: 'linear-gradient(135deg, #5B9BD5, #4A86C8)',
                color: 'white',
                boxShadow: '0 4px 15px rgba(74,134,200,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                border: '2px solid rgba(255,255,255,0.3)',
              }}
              onClick={handleStart}
              onTouchStart={(e) => { e.stopPropagation(); handleStart(); }}
            >
              START
            </button>
          ) : (
            <button
              className="
                px-6 py-2 rounded-full font-bold text-sm
                active:scale-95 transition-transform
              "
              style={{
                background: 'linear-gradient(135deg, #8BA8CC, #7A98BC)',
                color: 'white',
                boxShadow: '0 3px 10px rgba(120,150,188,0.3)',
                border: '2px solid rgba(255,255,255,0.2)',
              }}
              onClick={handleRestart}
              onTouchStart={(e) => { e.stopPropagation(); handleRestart(); }}
            >
              RESTART
            </button>
          )}
        </div>
      </div>

      {/* Center: Tilt Hint */}
      <div className="flex flex-col items-center gap-4 z-10">
        <div
          className="relative w-40 h-40 rounded-full flex items-center justify-center"
          style={{
            border: '3px solid rgba(74,134,200,0.25)',
            background: 'radial-gradient(circle, rgba(255,255,255,0.3), transparent)',
          }}
        >
          {/* Tilt arrows */}
          <div className="absolute top-4 text-xl" style={{ color: 'rgba(74,134,200,0.4)' }}>
            <svg width="24" height="16" viewBox="0 0 24 16">
              <polygon points="12,0 24,16 0,16" fill="rgba(74,134,200,0.4)" />
            </svg>
          </div>
          <div className="absolute bottom-4 text-xl" style={{ color: 'rgba(74,134,200,0.4)' }}>
            <svg width="24" height="16" viewBox="0 0 24 16">
              <polygon points="12,16 24,0 0,0" fill="rgba(74,134,200,0.4)" />
            </svg>
          </div>
          {/* Plane icon */}
          <svg viewBox="0 0 40 24" width="48" height="28" style={{ opacity: 0.5 }}>
            <polygon points="0,12 38,2 38,12" fill="#5B9BD5" />
            <polygon points="0,12 38,12 38,22" fill="#4A86C8" />
            <line x1="4" y1="12" x2="38" y2="12" stroke="#3A76B8" strokeWidth="0.8" />
          </svg>
        </div>
        <div
          className="text-xs font-mono tracking-widest"
          style={{ color: 'rgba(74,134,200,0.6)' }}
        >
          TILT TO FLY
        </div>
      </div>

      {/* Bottom: Boost Button */}
      <div className="z-10 flex flex-col items-center gap-2">
        <button
          className={`
            relative w-36 h-36 rounded-full
            border-[4px] transition-all duration-75
            flex flex-col items-center justify-center gap-1
            active:scale-95
          `}
          style={{
            background: isBoosting
              ? 'linear-gradient(135deg, #87CEEB, #5BA8D5)'
              : 'linear-gradient(135deg, #5B9BD5, #3A76B8)',
            borderColor: isBoosting
              ? 'rgba(135,206,235,0.6)'
              : 'rgba(74,134,200,0.4)',
            boxShadow: isBoosting
              ? '0 0 30px rgba(135,206,235,0.6), inset 0 0 20px rgba(255,255,255,0.2)'
              : '0 0 20px rgba(74,134,200,0.3), inset 0 0 10px rgba(255,255,255,0.1)',
          }}
          onTouchStart={handleBoostStart}
          onTouchEnd={handleBoostEnd}
          onMouseDown={handleBoostStart}
          onMouseUp={handleBoostEnd}
          onMouseLeave={(e) => { if (isBoosting) handleBoostEnd(e); }}
        >
          <div
            className="absolute inset-3 rounded-full"
            style={{ border: '1px solid rgba(255,255,255,0.15)' }}
          />
          {/* Up arrow icon */}
          <svg width="28" height="28" viewBox="0 0 28 28" style={{ opacity: isBoosting ? 1 : 0.8 }}>
            <polygon points="14,2 26,20 2,20" fill="white" />
          </svg>
          <div className="text-white font-black text-sm tracking-wider">
            {isBoosting ? 'LIFTING!' : 'BOOST'}
          </div>
          <div className="text-white/50 text-[10px]">Hold to climb</div>
        </button>
      </div>

      {/* Decorative clouds */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full"
          style={{
            left: '10%', top: '15%',
            width: 100, height: 35,
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.4), transparent)',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            right: '5%', top: '60%',
            width: 80, height: 30,
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.3), transparent)',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            left: '30%', bottom: '20%',
            width: 120, height: 40,
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.25), transparent)',
          }}
        />
      </div>
    </div>
  );
}
