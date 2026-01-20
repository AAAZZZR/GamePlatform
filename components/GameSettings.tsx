// components/GameSettings.tsx
import React, { useState } from 'react';
import { GameSettings, GameStatus } from '@/types/game';

interface Props {
  status: GameStatus;
  settings: GameSettings;
  onStatusChange: (s: GameStatus) => void;
  onSettingsChange: (s: GameSettings) => void;
  onRestart: () => void;
  onBackToLobby: () => void;
}

export default function GameSettingsPanel({
  status,
  settings,
  onStatusChange,
  onSettingsChange,

  onRestart,
  onBackToLobby
}: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-50">
      {/* 1. 控制按鈕群 */}
      <div className="flex gap-2 bg-black/40 backdrop-blur-md p-2 rounded-lg border border-white/10">
        {status === 'PLAYING' ? (
          <button
            onClick={() => onStatusChange('PAUSED')}
            className="px-3 py-1 bg-yellow-600/80 hover:bg-yellow-500 text-white text-xs rounded font-bold uppercase"
          >
            Pause
          </button>
        ) : (
          <button
            onClick={() => onStatusChange('PLAYING')}
            className="px-3 py-1 bg-green-600/80 hover:bg-green-500 text-white text-xs rounded font-bold uppercase"
          >
            Start
          </button>
        )}

        <button
          onClick={onRestart}
          className="px-3 py-1 bg-red-600/80 hover:bg-red-500 text-white text-xs rounded font-bold uppercase"
        >
          Restart
        </button>

        <button
          onClick={onBackToLobby}
          className="px-3 py-1 bg-gray-600/80 hover:bg-gray-500 text-white text-xs rounded font-bold uppercase"
        >
          Lobby
        </button>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`px-3 py-1 text-xs rounded font-bold uppercase transition-colors ${isOpen ? 'bg-cyan-600 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
        >
          Settings
        </button>
      </div>

      {/* 2. 設定面板 (折疊式) */}
      {isOpen && (
        <div className="bg-slate-900/90 backdrop-blur-xl p-4 rounded-xl border border-white/10 w-64 shadow-2xl text-white">
          <h3 className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider">Physics Config</h3>

          {/* Speed Control */}
          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
              <span>Speed Factor</span>
              <span className="text-cyan-400">{settings.speed}</span>
            </div>
            <input
              type="range"
              min="10" max="50"
              value={settings.speed}
              onChange={(e) => onSettingsChange({ ...settings, speed: Number(e.target.value) })}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>

          {/* Max Angle Control */}
          <div className="mb-2">
            <div className="flex justify-between text-xs mb-1">
              <span>Max Angle (Sensitivity)</span>
              <span className="text-yellow-400">{settings.maxAngle}°</span>
            </div>
            <input
              type="range"
              min="20" max="60"
              value={settings.maxAngle}
              onChange={(e) => onSettingsChange({ ...settings, maxAngle: Number(e.target.value) })}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-400"
            />
            <p className="text-[10px] text-gray-500 mt-2">
              Lower angle = More sensitive.<br />
              (30° means tilt 30° to reach max speed)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}