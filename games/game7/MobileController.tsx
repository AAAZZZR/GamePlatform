// games/game7/MobileController.tsx — Doodle Jump Mobile Controller
'use client';

import React, { useState } from 'react';
import { Socket } from 'socket.io-client';

interface Props {
  socket: Socket | null;
  roomId: string | null;
  sendAction?: (action: string) => void;
}

export default function DoodleJumpMobileController({ socket, roomId, sendAction }: Props) {
  const [isFiring, setIsFiring] = useState(false);

  const handleFireStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction?.('fire-start');
    setIsFiring(true);
    if (navigator.vibrate) navigator.vibrate(20);
  };

  const handleFireEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    sendAction?.('fire-end');
    setIsFiring(false);
  };

  return (
    <div
      className="w-full h-full relative overflow-hidden select-none touch-none flex flex-col items-center justify-between"
      style={{
        background: 'linear-gradient(180deg, #faf8ef 0%, #f0ead6 100%)',
        fontFamily: "'Patrick Hand', 'Comic Sans MS', cursive, sans-serif",
      }}
    >
      {/* Top: Tilt hint + doodler icon */}
      <div className="flex flex-col items-center pt-10 gap-4">
        <div
          style={{
            width: 60,
            height: 60,
            backgroundColor: '#5cb85c',
            borderRadius: 14,
            border: '3px solid #4a9a4a',
            position: 'relative',
            boxShadow: '0 3px 10px rgba(0,0,0,0.12)',
          }}
        >
          {/* Eyes */}
          <div
            className="absolute"
            style={{ width: 12, height: 13, backgroundColor: 'white', borderRadius: '50%', top: 10, left: 9, border: '1.5px solid #333' }}
          >
            <div className="absolute" style={{ width: 6, height: 6, backgroundColor: '#1a1a2e', borderRadius: '50%', bottom: 1, right: 0 }} />
          </div>
          <div
            className="absolute"
            style={{ width: 12, height: 13, backgroundColor: 'white', borderRadius: '50%', top: 10, right: 9, border: '1.5px solid #333' }}
          >
            <div className="absolute" style={{ width: 6, height: 6, backgroundColor: '#1a1a2e', borderRadius: '50%', bottom: 1, right: 0 }} />
          </div>
          {/* Beak */}
          <div
            className="absolute"
            style={{ width: 8, height: 6, backgroundColor: '#e8a838', borderRadius: '0 50% 50% 0', top: 18, right: -4 }}
          />
        </div>

        <div style={{ color: '#8a8570', fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
          Tilt to Move
        </div>

        {/* Tilt indicator */}
        <div
          style={{
            width: 100,
            height: 40,
            border: '2px dashed rgba(140,135,120,0.3)',
            borderRadius: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            color: 'rgba(140,135,120,0.4)',
            fontSize: 18,
          }}
        >
          <span>&larr;</span>
          <span style={{ fontSize: 10, letterSpacing: 1, fontWeight: 600 }}>TILT</span>
          <span>&rarr;</span>
        </div>
      </div>

      {/* Center: Fire button */}
      <div className="flex items-center justify-center flex-1">
        <button
          className="relative flex items-center justify-center"
          style={{
            width: 140,
            height: 140,
            borderRadius: '50%',
            background: isFiring
              ? 'radial-gradient(circle, #e74c3c, #c0392b)'
              : 'radial-gradient(circle, #f39c12, #e67e22)',
            border: `6px solid ${isFiring ? 'rgba(231,76,60,0.4)' : 'rgba(243,156,18,0.4)'}`,
            boxShadow: isFiring
              ? '0 0 40px rgba(231,76,60,0.5), inset 0 0 20px rgba(0,0,0,0.1)'
              : '0 0 30px rgba(243,156,18,0.3), inset 0 0 20px rgba(0,0,0,0.05)',
            transform: isFiring ? 'scale(0.92)' : 'scale(1)',
            transition: 'transform 75ms, background 75ms, box-shadow 75ms',
          }}
          onTouchStart={handleFireStart}
          onTouchEnd={handleFireEnd}
          onTouchCancel={handleFireEnd}
          onMouseDown={handleFireStart}
          onMouseUp={handleFireEnd}
          onMouseLeave={handleFireEnd}
        >
          {/* Inner ring */}
          <div
            className="absolute"
            style={{
              inset: 8,
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.2)',
            }}
          />
          <div
            className="flex flex-col items-center pointer-events-none"
            style={{ color: 'white', textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
          >
            <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: 2 }}>
              {isFiring ? 'PEW!' : 'FIRE'}
            </span>
            <span style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
              TAP TO SHOOT
            </span>
          </div>
        </button>
      </div>

      {/* Bottom: Start / Restart buttons */}
      <div className="flex gap-6 pb-10">
        <button
          style={{
            padding: '12px 28px',
            borderRadius: 24,
            backgroundColor: '#5cb85c',
            border: '3px solid #4a9a4a',
            color: 'white',
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: 1,
            boxShadow: '0 3px 8px rgba(92,184,92,0.3)',
          }}
          onTouchStart={(e) => {
            e.preventDefault();
            sendAction?.('start-game');
            if (navigator.vibrate) navigator.vibrate(30);
          }}
          onMouseDown={() => sendAction?.('start-game')}
        >
          START
        </button>
        <button
          style={{
            padding: '12px 28px',
            borderRadius: 24,
            backgroundColor: '#e8e4d9',
            border: '3px solid #c8c4b8',
            color: '#6a6558',
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: 1,
            boxShadow: '0 3px 8px rgba(0,0,0,0.08)',
          }}
          onTouchStart={(e) => {
            e.preventDefault();
            sendAction?.('restart-game');
            if (navigator.vibrate) navigator.vibrate([20, 10, 20]);
          }}
          onMouseDown={() => sendAction?.('restart-game')}
        >
          RESTART
        </button>
      </div>
    </div>
  );
}
