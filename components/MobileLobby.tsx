// components/Lobby/MobileLobby.tsx
import React from 'react';
import { GAME_REGISTRY } from '@/games/registry'; // Import Registry

interface Props {
  onSelectGame: (gameId: string) => void;
}

export default function MobileLobby({ onSelectGame }: Props) {
  return (
    <div className="w-full h-full flex flex-col gap-4 px-6 animate-fade-in overflow-y-auto pb-20">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-black text-cyan-400 tracking-widest">ARCADE</h2>
        <p className="text-xs text-gray-500 font-mono">SELECT A GAME</p>
      </div>

      {/* Dynamic Rendering from Registry */}
      {Object.entries(GAME_REGISTRY).map(([id, game]) => (
        <button
          key={id}
          onClick={() => onSelectGame(id)}
          className="group relative w-full h-24 bg-slate-800 rounded-xl border border-white/10 overflow-hidden active:scale-95 transition-all text-left shadow-lg"
        >
          {/* Background Gradient Effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-cyan-400/20 opacity-0 group-hover:opacity-100 transition-opacity" />

          <div className="flex items-center justify-between px-6 h-full relative z-10">
            <div className="flex flex-col items-start flex-1 min-w-0 pr-4">
              {/* Game Name */}
              <span className="font-bold text-white text-lg tracking-wide truncate w-full">
                {game.name}
              </span>
              {/* Game Description (Truncated) */}
              <span className="text-xs text-gray-400 truncate w-full font-mono">
                {game.description}
              </span>
            </div>
            {/* Game Icon */}
            <span className="text-3xl shrink-0 filter drop-shadow-md">
              {game.icon}
            </span>
          </div>
        </button>
      ))}

      {/* Footer Placeholder */}
      <div className="w-full h-16 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-gray-600 text-xs font-mono mt-2">
        More games coming soon...
      </div>
    </div>
  );
}