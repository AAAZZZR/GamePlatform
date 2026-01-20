import React from 'react';
import { Socket } from 'socket.io-client';

interface Props {
    socket: Socket | null;
    roomId: string | null;
}

export default function BrickMobileController({ socket, roomId }: Props) {

    const handleLaunch = (e: any) => {
        e.preventDefault();
        if (socket && roomId) {
            socket.emit('controller-action', { action: 'launch', roomId });
            if (navigator.vibrate) navigator.vibrate(50); // 震動回饋
        }
    };

    return (
        <div className="w-full h-full relative overflow-hidden bg-slate-900 select-none touch-none">

            {/* 大按鈕區域 */}
            <div className="absolute inset-0 flex items-center justify-center">
                <button
                    className="
            relative w-48 h-48 rounded-full 
            bg-gradient-to-br from-indigo-500 to-purple-700
            border-[6px] border-indigo-400/50 
            shadow-[0_0_50px_rgba(99,102,241,0.6)] 
            active:scale-95 active:brightness-110
            transition-all duration-100
            flex flex-col items-center justify-center gap-2
          "
                    onTouchStart={handleLaunch}
                    onMouseDown={handleLaunch}
                >
                    <div className="text-4xl">🚀</div>
                    <div className="text-2xl font-black text-white tracking-widest">LAUNCH</div>
                </button>
            </div>

            {/* 指引文字 */}
            <div className="absolute bottom-10 w-full text-center">
                <div className="text-white/40 text-sm font-mono mb-2">CONTROLS</div>
                <div className="flex items-center justify-center gap-8 text-white/80 font-bold text-xl">
                    <span>⟵ TILT LEFT</span>
                    <span className="w-[1px] h-6 bg-white/20"></span>
                    <span>TILT RIGHT ⟶</span>
                </div>
            </div>

        </div>
    );
}