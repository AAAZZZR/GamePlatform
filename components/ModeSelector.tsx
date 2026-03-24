// components/ModeSelector.tsx — Mode Selection (Solo / Multiplayer)
'use client';
import React from 'react';
import { GameMode } from '@/types/game';

interface ModeSelectorProps {
  onSelect: (mode: GameMode) => void;
}

export default function ModeSelector({ onSelect }: ModeSelectorProps) {
  return (
    <div className="flex flex-col items-center gap-10 w-full max-w-2xl mx-auto px-6">
      {/* Section header */}
      <div className="text-center">
        <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">
          Choose Your Mode
        </h2>
        <p className="text-gray-500 text-sm">
          How do you want to play?
        </p>
      </div>

      {/* Cards container */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full">
        {/* ── Solo Card ── */}
        <button
          onClick={() => onSelect('solo')}
          className="group relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-white/[0.03] backdrop-blur-sm
                     text-left transition-all duration-300
                     hover:border-cyan-400/50 hover:bg-white/[0.07] hover:scale-[1.03]
                     hover:shadow-[0_0_40px_rgba(6,182,212,0.2)] cursor-pointer"
        >
          {/* Top accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-cyan-500 to-cyan-400/0" />

          {/* Hover glow overlay */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
               style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.08) 0%, transparent 70%)' }} />

          <div className="relative p-8 flex flex-col items-center text-center gap-4">
            {/* Icon */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10
                            border border-cyan-500/30 flex items-center justify-center
                            group-hover:scale-110 group-hover:border-cyan-400/50 transition-all duration-300">
              <span className="text-4xl">📱</span>
            </div>

            {/* Title */}
            <h3 className="text-2xl font-bold text-white group-hover:text-cyan-300 transition-colors">
              Solo
            </h3>

            {/* Subtitle */}
            <p className="text-gray-400 text-sm">
              1 Phone &middot; 10 Games
            </p>

            {/* CTA hint */}
            <div className="mt-2 flex items-center gap-1.5 text-cyan-400 text-xs font-semibold
                            opacity-0 group-hover:opacity-100 transition-opacity">
              <span>SELECT</span>
              <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
            </div>
          </div>
        </button>

        {/* ── Multiplayer Card ── */}
        <button
          onClick={() => onSelect('multi')}
          className="group relative overflow-hidden rounded-2xl border border-violet-500/20 bg-white/[0.03] backdrop-blur-sm
                     text-left transition-all duration-300
                     hover:border-violet-400/50 hover:bg-white/[0.07] hover:scale-[1.03]
                     hover:shadow-[0_0_40px_rgba(139,92,246,0.2)] cursor-pointer"
        >
          {/* Top accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-violet-400/0" />

          {/* Hover glow overlay */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
               style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.08) 0%, transparent 70%)' }} />

          <div className="relative p-8 flex flex-col items-center text-center gap-4">
            {/* Icon */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-600/10
                            border border-violet-500/30 flex items-center justify-center
                            group-hover:scale-110 group-hover:border-violet-400/50 transition-all duration-300">
              <span className="text-4xl">📱📱</span>
            </div>

            {/* Title */}
            <h3 className="text-2xl font-bold text-white group-hover:text-violet-300 transition-colors">
              Multiplayer
            </h3>

            {/* Subtitle */}
            <p className="text-gray-400 text-sm">
              2 Phones &middot; Coming Soon
            </p>

            {/* CTA hint */}
            <div className="mt-2 flex items-center gap-1.5 text-violet-400 text-xs font-semibold
                            opacity-0 group-hover:opacity-100 transition-opacity">
              <span>SELECT</span>
              <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
