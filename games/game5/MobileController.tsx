// games/game5/MobileController.tsx — Tilt to Live 手機端
// 這是純傾斜的遊戲，遊戲中手機不需要任何按鈕：
// 開始 / 重來 / 暫停都由平台的 MobileGameOverlay 負責（READY、倒數、GAME OVER 時它會蓋住這個畫面，
// 遊戲中左上角有它的齒輪鈕）。所以這裡只放「怎麼拿、道具是什麼」，整個畫面點了也不會誤觸。
// 平台會傳 { sendAction }（MobileControllerProps），這個控制器用不到，所以不接參數。
'use client';

import React from 'react';
import { POWERUP_ORDER, POWERUPS } from './config';
import { PowerupBadge } from './PowerupIcon';

export default function TiltToLiveMobileController() {
  return (
    <div
      className="relative flex h-full w-full touch-manipulation select-none overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at center, #0a0e1a 0%, #050510 70%, #020208 100%)' }}
    >
      {/* 淡淡的格線，和電視上的場地一樣 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(103,232,249,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* 左：拿法示意（左上角留給平台的齒輪鈕） */}
      <div className="relative flex w-[40%] min-w-0 flex-col items-center justify-center gap-2 px-2 pt-8">
        <TiltDemo />
        <div className="text-sm font-black tracking-[0.25em] text-cyan-300">TILT TO STEER</div>
        <div className="text-center text-[11px] leading-snug text-white/50">
          Tilt toward where you want to go.
          <br />
          Small tilt = slow &amp; precise.
        </div>
      </div>

      {/* 右：道具圖例 */}
      <div className="relative flex min-w-0 flex-1 flex-col justify-center gap-2.5 py-3 pr-4">
        <div className="text-[10px] font-bold tracking-[0.3em] text-white/45">FLY INTO ORBS TO USE THEM</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {POWERUP_ORDER.map(type => (
            <div key={type} className="flex min-w-0 items-center gap-2">
              <PowerupBadge type={type} size={30} />
              <div className="min-w-0">
                <div className="truncate text-[11px] font-black tracking-wider" style={{ color: POWERUPS[type].color }}>
                  {POWERUPS[type].name}
                </div>
                <div className="truncate text-[10px] text-white/50">{POWERUPS[type].hint}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/45">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
          <span className="truncate">Red dots chase you — one touch and it&apos;s over</span>
        </div>
      </div>

      <style>{`
        @keyframes ttl-phone-tilt {
          0%, 100% { transform: perspective(320px) rotateX(0deg) rotateY(0deg); }
          18%, 32% { transform: perspective(320px) rotateY(24deg); }
          50% { transform: perspective(320px) rotateX(0deg) rotateY(0deg); }
          68%, 82% { transform: perspective(320px) rotateX(22deg); }
        }
        @keyframes ttl-arrow-move {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          18%, 32% { transform: translate(22px, 0) rotate(90deg); }
          50% { transform: translate(0, 0) rotate(0deg); }
          68%, 82% { transform: translate(0, -12px) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}

/** 一支橫拿的手機在傾斜，螢幕裡的箭頭跟著往那個方向跑 */
function TiltDemo() {
  return (
    <div
      className="relative flex h-[64px] w-[110px] items-center justify-center rounded-[14px] border-2 border-cyan-400/50 bg-cyan-950/40"
      style={{ animation: 'ttl-phone-tilt 4s ease-in-out infinite', boxShadow: '0 0 18px rgba(34,211,238,0.25)' }}
    >
      <div className="absolute left-1.5 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-cyan-400/30" />
      <svg
        viewBox="0 0 36 36"
        className="h-6 w-6"
        style={{ animation: 'ttl-arrow-move 4s ease-in-out infinite', filter: 'drop-shadow(0 0 4px rgba(103,232,249,0.7))' }}
      >
        <polygon points="18,4 28,30 18,24 8,30" fill="#67e8f9" stroke="#a5f3fc" strokeWidth="1" />
      </svg>
    </div>
  );
}
