import React from 'react';
import { Socket } from 'socket.io-client';

interface Props {
    socket: Socket | null;
    roomId: string | null;
}

export default function RacingMobileController({ socket, roomId }: Props) {

    // Helper to emit actions
    const sendAction = (action: string) => {
        if (socket && roomId) {
            socket.emit('controller-action', { action, roomId });
        }
    };

    return (
        <div className="w-full h-full relative overflow-hidden bg-zinc-900 select-none touch-none flex flex-col">

            {/* Top Section: Visual Steering Wheel / Start Button */}
            <div className="flex-1 flex items-center justify-center relative">
                {/* Start Button (Always visible for now as a restart/start trigger, or we can make it smaller) */}
                {/* Let's make a big 'START ENGINE' button that fades out or just exists? 
                     Actually, without state, maybe we just add a small 'START' button in the corner 
                     OR make the steering wheel 'Tap to Start'.
                 */}
                <button
                    className="absolute z-10 top-4 right-4 bg-green-600 px-4 py-2 rounded-lg font-bold text-white shadow-lg active:scale-95"
                    onClick={() => sendAction('start-game')}
                    onTouchStart={(e) => { e.stopPropagation(); sendAction('start-game'); }}
                >
                    START ENGINE
                </button>

                <div className="relative w-64 h-64 opacity-50 border-[8px] border-zinc-600 rounded-full flex items-center justify-center">
                    <div className="absolute w-full h-[2px] bg-zinc-600"></div>
                    <div className="absolute h-full w-[2px] bg-zinc-600"></div>
                    <span className="bg-zinc-900 px-2 text-zinc-400 font-mono tracking-widest">STEERING</span>
                </div>
            </div>

            {/* Bottom Section: Nitro Button */}
            <div className="h-1/3 w-full p-6 flex items-center justify-center">
                <button
                    className="
            w-full h-full rounded-2xl
            bg-gradient-to-t from-orange-600 to-yellow-500
            border-b-8 border-orange-800
            shadow-[0_0_30px_rgba(234,179,8,0.4)]
            active:border-b-0 active:translate-y-2
            transition-all
            flex items-center justify-center gap-2
          "
                    onTouchStart={(e) => { e.preventDefault(); sendAction('nitro-start'); if (navigator.vibrate) navigator.vibrate(50); }}
                    onTouchEnd={(e) => { e.preventDefault(); sendAction('nitro-end'); }}
                    onMouseDown={() => sendAction('nitro-start')}
                    onMouseUp={() => sendAction('nitro-end')}
                    onMouseLeave={() => sendAction('nitro-end')}
                >
                    <span className="text-4xl font-black text-white italic drop-shadow-md">NITRO 💨</span>
                </button>
            </div>

        </div>
    );
}