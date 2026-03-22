// components/Lobby.tsx — Landing Page
'use client';
import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { GAME_REGISTRY } from '@/games/registry';

interface LobbyProps {
  joinLink: string;
  isControllerConnected: boolean;
  onSelectGame: (gameId: string) => void;
}

// ─── 遊戲分類標籤 ──────────────────────────────────
const CATEGORIES: Record<string, string[]> = {
  'Action':  ['game1', 'game5'],
  'Arcade':  ['game2', 'game7'],
  'Racing':  ['game3'],
  'Classic': ['game4', 'game6'],
  'Flight':  ['game8'],
};

function getCategoryFor(id: string) {
  for (const [cat, ids] of Object.entries(CATEGORIES)) {
    if (ids.includes(id)) return cat;
  }
  return 'Game';
}

// ─── 浮動粒子背景 ──────────────────────────────────
function FloatingParticles() {
  const particles = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 20 + 15,
    delay: Math.random() * -20,
    opacity: Math.random() * 0.3 + 0.1,
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            background: `hsl(${190 + Math.random() * 40}, 80%, 65%)`,
            opacity: p.opacity,
            animation: `floatParticle ${p.duration}s ${p.delay}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ─── 步驟卡片 ──────────────────────────────────────
function StepCard({ num, icon, title, desc }: { num: number; icon: string; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 px-4 py-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm">
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-2xl">
        {icon}
      </div>
      <div className="text-xs font-bold text-cyan-400/60 tracking-widest">STEP {num}</div>
      <div className="text-white font-bold text-sm">{title}</div>
      <div className="text-gray-400 text-xs leading-relaxed">{desc}</div>
    </div>
  );
}

// ─── 主元件 ────────────────────────────────────────
export default function Lobby({ joinLink, isControllerConnected, onSelectGame }: LobbyProps) {
  const [mounted, setMounted] = useState(false);
  const games = Object.entries(GAME_REGISTRY);

  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="min-h-screen bg-[#060918] text-white relative overflow-x-hidden overflow-y-auto">
      {/* 背景 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(56,189,248,0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 100%, rgba(139,92,246,0.06) 0%, transparent 50%)',
        }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />
        <FloatingParticles />
      </div>

      <div className="relative z-10">
        {/* ════════ Hero ════════ */}
        <section className="flex flex-col items-center justify-center min-h-screen px-6 py-16">
          {/* 標題 */}
          <div className={`text-center transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/[0.06] text-cyan-400 text-xs font-bold tracking-widest mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              GYROSCOPE POWERED
            </div>

            <h1 className="text-5xl sm:text-7xl font-black tracking-tight leading-none mb-4">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-500">
                Game Center
              </span>
            </h1>

            <p className="text-gray-400 text-lg sm:text-xl max-w-lg mx-auto leading-relaxed">
              Turn your phone into a controller.
              <br />
              <span className="text-gray-500">Tilt, shake, and tap to play {games.length} games.</span>
            </p>
          </div>

          {/* QR code 區塊 */}
          <div className={`mt-12 transition-all duration-1000 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {!isControllerConnected ? (
              <div className="flex flex-col items-center">
                <div className="relative group">
                  {/* 外圈光暈 */}
                  <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-violet-500/20 blur-xl opacity-60 group-hover:opacity-100 transition-opacity" />

                  <div className="relative p-5 bg-white rounded-2xl shadow-2xl shadow-cyan-500/10">
                    <QRCodeSVG value={joinLink} size={220} level="M" />
                  </div>
                </div>

                <div className="mt-8 flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute h-full w-full rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative rounded-full h-3 w-3 bg-cyan-500" />
                  </span>
                  <span className="text-cyan-400 font-semibold tracking-wide">Scan with your phone to join</span>
                </div>

                <p className="mt-2 text-xs text-gray-600 font-mono select-all">{joinLink}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-400 font-bold tracking-wider text-sm">CONTROLLER CONNECTED</span>
                </div>
                <p className="text-gray-500 text-sm animate-bounce">↓ Choose a game below ↓</p>
              </div>
            )}
          </div>

          {/* 步驟說明 */}
          {!isControllerConnected && (
            <div className={`mt-16 grid grid-cols-3 gap-4 max-w-xl w-full transition-all duration-1000 delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <StepCard num={1} icon="📱" title="Scan QR Code" desc="Open camera on your phone and scan" />
              <StepCard num={2} icon="🎮" title="Tilt to Play" desc="Your phone becomes the controller" />
              <StepCard num={3} icon="🏆" title="Have Fun" desc="8 games, zero installs needed" />
            </div>
          )}
        </section>

        {/* ════════ 遊戲展示 ════════ */}
        <section className="px-6 pb-24">
          <div className="max-w-5xl mx-auto">
            <div className={`text-center mb-12 transition-all duration-1000 delay-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">
                {isControllerConnected ? 'Select a Game' : 'Game Library'}
              </h2>
              <p className="text-gray-500 text-sm">
                {isControllerConnected
                  ? 'Tap any game to start playing'
                  : 'All playable with just your phone\'s gyroscope'}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {games.map(([id, game], i) => {
                const category = getCategoryFor(id);
                const playable = isControllerConnected;

                return (
                  <button
                    key={id}
                    disabled={!playable}
                    onClick={() => playable && onSelectGame(id)}
                    className={`
                      group relative overflow-hidden rounded-2xl border text-left
                      transition-all duration-500
                      ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}
                      ${playable
                        ? 'bg-white/[0.04] border-white/10 hover:border-cyan-400/50 hover:bg-white/[0.07] hover:scale-[1.03] hover:shadow-[0_0_30px_rgba(6,182,212,0.15)] cursor-pointer'
                        : 'bg-white/[0.02] border-white/[0.05] cursor-default'}
                    `}
                    style={{ transitionDelay: `${800 + i * 80}ms` }}
                  >
                    {/* 頂部色帶 */}
                    <div className={`h-1 w-full transition-opacity ${playable ? 'opacity-100' : 'opacity-30'}`} style={{
                      background: `linear-gradient(90deg, ${
                        ['#06b6d4','#8b5cf6','#f59e0b','#10b981','#ef4444','#f97316','#ec4899','#3b82f6'][i % 8]
                      }, transparent)`,
                    }} />

                    <div className="p-5">
                      {/* 圖示 + 分類 */}
                      <div className="flex items-start justify-between mb-3">
                        <span className={`text-4xl transition-all duration-300 ${playable ? 'group-hover:scale-125 group-hover:-rotate-6' : ''}`}>
                          {game.icon}
                        </span>
                        <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full border ${
                          playable
                            ? 'text-cyan-400/80 border-cyan-500/20 bg-cyan-500/[0.06]'
                            : 'text-gray-600 border-gray-700/30 bg-gray-800/30'
                        }`}>
                          {category.toUpperCase()}
                        </span>
                      </div>

                      {/* 名稱 */}
                      <h3 className={`font-bold text-lg mb-1.5 transition-colors ${
                        playable ? 'text-white group-hover:text-cyan-300' : 'text-gray-400'
                      }`}>
                        {game.name}
                      </h3>

                      {/* 說明 */}
                      <p className={`text-xs leading-relaxed ${playable ? 'text-gray-400' : 'text-gray-600'}`}>
                        {game.description}
                      </p>

                      {/* 可遊玩指示 */}
                      {playable && (
                        <div className="mt-4 flex items-center gap-1.5 text-cyan-400 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                          <span>PLAY</span>
                          <span className="group-hover:translate-x-1 transition-transform">→</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ════════ QR 小浮窗（連線後始終可見） ════════ */}
        {isControllerConnected && (
          <div className="fixed bottom-6 right-6 z-50 group">
            <div className="p-2 bg-white rounded-xl shadow-lg shadow-black/20 opacity-60 hover:opacity-100 transition-opacity cursor-help">
              <QRCodeSVG value={joinLink} size={64} />
            </div>
            <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-gray-800 text-xs text-gray-300 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Scan to connect another controller
            </div>
          </div>
        )}

        {/* ════════ Footer ════════ */}
        <footer className="border-t border-white/[0.04] py-8 text-center text-gray-600 text-xs">
          <p>No downloads needed — just a phone with a gyroscope + this screen</p>
        </footer>
      </div>

      {/* ════════ Keyframes ════════ */}
      <style>{`
        @keyframes floatParticle {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: var(--tw-opacity, 0.2); }
          25% { transform: translate(10px, -20px) scale(1.3); }
          50% { transform: translate(-5px, -40px) scale(0.8); opacity: calc(var(--tw-opacity, 0.2) * 0.5); }
          75% { transform: translate(15px, -20px) scale(1.1); }
        }
      `}</style>
    </div>
  );
}
