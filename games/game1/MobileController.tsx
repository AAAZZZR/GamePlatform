// games/game1/MobileController.tsx
import React from 'react';
import { Socket } from 'socket.io-client';

interface Props {
  socket: Socket | null;
  roomId: string | null;
}

export default function ShooterMobileController({ socket, roomId }: Props) {
  // Only minimal controls here (Fire Button + Hints)

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-900 select-none touch-none">

      {/* 3. Fire Button */}
      <div className="absolute right-12 top-1/2 -translate-y-1/2 flex items-center justify-center">
        <button
          className="
            group relative w-32 h-32 md:w-48 md:h-48 rounded-full 
            bg-gradient-to-br from-red-500 to-red-700
            border-[6px] border-red-400/50 
            shadow-[0_0_40px_rgba(239,68,68,0.5)] 
            active:scale-90 active:brightness-125
            transition-all duration-75
            flex items-center justify-center
          "
          // Hold to Fire Logic
          onTouchStart={(e) => {
            e.preventDefault();
            if (socket && roomId) {
              socket.emit('controller-action', { action: 'fire-start', roomId });
              if (navigator.vibrate) navigator.vibrate(30);
            }
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            if (socket && roomId) {
              socket.emit('controller-action', { action: 'fire-end', roomId });
            }
          }}
          onMouseDown={(e) => {
            if (socket && roomId) socket.emit('controller-action', { action: 'fire-start', roomId });
          }}
          onMouseUp={() => {
            if (socket && roomId) socket.emit('controller-action', { action: 'fire-end', roomId });
          }}
          onMouseLeave={() => {
            if (socket && roomId) socket.emit('controller-action', { action: 'fire-end', roomId });
          }}
        >
          <div className="absolute inset-2 border-[2px] border-white/20 rounded-full" />
          <div className="w-full text-center font-black text-white/90 text-2xl tracking-widest drop-shadow-md pointer-events-none">
            HOLD<br />FIRE
          </div>
        </button>
      </div>

      {/* 4. Background Hint */}
      <div className="absolute bottom-6 left-6 text-white/20 text-xs font-mono">
        <div className="flex items-center gap-2">
          <div className="w-8 h-[1px] bg-white/20"></div>
          <span>TILT TO MOVE</span>
        </div>
      </div>

    </div>
  );
}