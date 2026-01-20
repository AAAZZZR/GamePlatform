// components/Lobby/index.tsx
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { GAME_REGISTRY } from '@/games/registry'; // 引入註冊表

interface LobbyProps {
  joinLink: string;
  isControllerConnected: boolean;
  onSelectGame: (gameId: string) => void;
}

export default function Lobby({ joinLink, isControllerConnected, onSelectGame }: LobbyProps) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white relative overflow-hidden">
      {/* 背景裝飾 */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(#4b5563 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

      <h1 className="text-5xl font-black mb-12 tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
        Game Center
      </h1>

      {!isControllerConnected ? (
        // 狀態 A: 等待掃碼
        <div className="flex flex-col items-center animate-fade-in">
          <div className="p-4 bg-white rounded-2xl shadow-[0_0_30px_rgba(34,211,238,0.3)]">
            <QRCodeSVG value={joinLink} size={256} />
          </div>
          <div className="mt-8 flex items-center gap-3 text-cyan-400">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </span>
            <span className="font-mono tracking-wider">Waiting for controller...</span>
          </div>
          <p className="mt-2 text-xs text-gray-500 font-mono">{joinLink}</p>
        </div>
      ) : (
        // 狀態 B: 遊戲選單 (動態渲染)
        <div className="flex flex-col items-center gap-6 w-full max-w-md animate-fade-in-up">
          <div className="text-green-400 font-bold tracking-wider mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full"></span>
            CONTROLLER CONNECTED
          </div>
          
          <div className="w-full flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2 overflow-x-hidden">
            {/* 遍歷 Registry 生成按鈕 */}
            {Object.entries(GAME_REGISTRY).map(([id, game]) => (
              <button 
                key={id}
                onClick={() => onSelectGame(id)}
                className="w-full group relative overflow-hidden bg-slate-800 hover:bg-slate-700 border border-white/10 hover:border-cyan-400/50 p-6 rounded-xl transition-all duration-300 hover:scale-100 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] text-left"
              >
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-100 transition-opacity">
                  <span className="text-4xl">{game.icon}</span>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">{game.name}</h2>
                <p className="text-gray-400 text-sm">{game.description}</p>
              </button>
            ))}
          </div>

          <div className="w-full p-6 rounded-xl border border-white/5 bg-white/5 opacity-50 text-center">
             <p className="text-gray-500 text-sm">More games coming soon...</p>
          </div>
        </div>
      )}
    </div>
  );
}