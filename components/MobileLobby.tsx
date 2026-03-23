// components/MobileLobby.tsx — Grid-based game selector
'use client';
import React, { useState, useRef, useCallback } from 'react';
import { GAME_REGISTRY } from '@/games/registry';
import Logo from '@/components/Logo';

interface Props {
  onSelectGame: (gameId: string) => void;
}

// Accent colors per game slot
const CARD_COLORS = [
  { from: '#06b6d4', to: '#3b82f6' }, // cyan-blue
  { from: '#8b5cf6', to: '#6366f1' }, // violet-indigo
  { from: '#f59e0b', to: '#f97316' }, // amber-orange
  { from: '#10b981', to: '#14b8a6' }, // emerald-teal
  { from: '#ef4444', to: '#f43f5e' }, // red-rose
  { from: '#ec4899', to: '#d946ef' }, // pink-fuchsia
  { from: '#3b82f6', to: '#2563eb' }, // blue
  { from: '#22d3ee', to: '#06b6d4' }, // cyan
];

export default function MobileLobby({ onSelectGame }: Props) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handleTouchStart = useCallback((id: string) => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setPreviewId(id);
      if (navigator.vibrate) navigator.vibrate(20);
    }, 400);
  }, []);

  const handleTouchEnd = useCallback((id: string) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (didLongPress.current) {
      // Was a long press — dismiss preview after a moment
      setTimeout(() => setPreviewId(null), 1500);
    } else {
      // Short tap — select game
      onSelectGame(id);
    }
  }, [onSelectGame]);

  const handleTouchCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setPreviewId(null);
  }, []);

  const games = Object.entries(GAME_REGISTRY);

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto overscroll-contain pb-8">
      {/* Header — compact */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0">
        <Logo size={32} animate={false} />
        <div>
          <h2 className="text-lg font-black text-cyan-400 tracking-widest leading-tight">GYROPLAY</h2>
          <p className="text-[10px] text-gray-500 font-mono">HOLD TO PREVIEW · TAP TO PLAY</p>
        </div>
      </div>

      {/* Game Grid */}
      <div className="grid grid-cols-2 portrait:grid-cols-2 landscape:grid-cols-4 gap-3 px-4 auto-rows-min">
        {games.map(([id, game], i) => {
          const color = CARD_COLORS[i % CARD_COLORS.length];
          const isPreview = previewId === id;

          return (
            <button
              key={id}
              onTouchStart={(e) => { e.stopPropagation(); handleTouchStart(id); }}
              onTouchEnd={(e) => { e.stopPropagation(); handleTouchEnd(id); }}
              onTouchCancel={handleTouchCancel}
              onClick={() => onSelectGame(id)}
              className="group relative aspect-square rounded-2xl overflow-hidden border border-white/10 active:scale-95 transition-all duration-200 select-none touch-manipulation"
              style={{
                background: `linear-gradient(135deg, ${color.from}15, ${color.to}08)`,
              }}
            >
              {/* Top accent bar */}
              <div className="absolute top-0 inset-x-0 h-1 opacity-70"
                style={{ background: `linear-gradient(90deg, ${color.from}, ${color.to})` }}
              />

              {/* Hover/focus glow (desktop) */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{ background: `radial-gradient(circle at center, ${color.from}20, transparent 70%)` }}
              />

              {/* Main content: icon + name */}
              <div className="relative z-10 flex flex-col items-center justify-center h-full gap-2 px-2">
                <span className="text-4xl transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-6"
                  style={{ filter: `drop-shadow(0 0 8px ${color.from}80)` }}>
                  {game.icon}
                </span>
                <span className="text-white font-bold text-sm text-center leading-tight tracking-wide">
                  {game.name}
                </span>
              </div>

              {/* Description overlay — visible on long-press (mobile) or hover (desktop) */}
              <div className={`
                absolute inset-0 z-20 flex items-center justify-center p-4 rounded-2xl
                transition-all duration-300
                ${isPreview ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
              `}
                style={{ background: `linear-gradient(135deg, ${color.from}e6, ${color.to}cc)` }}
              >
                <div className="text-center">
                  <span className="text-2xl block mb-2">{game.icon}</span>
                  <span className="text-white font-black text-sm block mb-1">{game.name}</span>
                  <span className="text-white/80 text-xs leading-relaxed block">{game.description}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mx-4 mt-3 shrink-0 h-12 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-gray-600 text-[10px] font-mono">
        More games coming soon...
      </div>
    </div>
  );
}
