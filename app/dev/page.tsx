// app/dev/page.tsx — 開發用試玩頁：不用手機，鍵盤模擬傾斜，直接跑單一遊戲和它的手機控制器
// 用法：npm run dev 後開 /dev?game=game9
'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { GAME_REGISTRY, isGameId } from '@/games/registry';
import { applyAction, DEFAULT_GAME_SETTINGS, emptyInput, gyroToMove } from '@/platform/input';
import type { NormalizedInput } from '@/platform/types';
import type { GameStatus } from '@/types/game';
import { initAudio } from '@/platform/audio';

// 鍵盤 → 模擬傾斜角度（度）。方向鍵或 WASD；按住 Alt 只傾一半
const TILT_KEYS: Record<string, { axis: 'x' | 'y'; dir: 1 | -1 }> = {
  ArrowLeft: { axis: 'x', dir: -1 }, KeyA: { axis: 'x', dir: -1 },
  ArrowRight: { axis: 'x', dir: 1 }, KeyD: { axis: 'x', dir: 1 },
  ArrowUp: { axis: 'y', dir: -1 }, KeyW: { axis: 'y', dir: -1 },
  ArrowDown: { axis: 'y', dir: 1 }, KeyS: { axis: 'y', dir: 1 },
};

// 鍵盤 → 按住型按鈕（送 xxx-start / xxx-end）
const HOLD_KEYS: Record<string, string> = {
  Space: 'fire',
  ShiftLeft: 'throttle',
  ShiftRight: 'throttle',
  KeyB: 'brake',
};

// 傾斜跟手的速度：每秒最多轉幾度（模擬手機不會瞬間轉到底）
const TILT_DEG_PER_SEC = 240;

function DevPlay() {
  const gameId = useSearchParams().get('game') ?? '';
  const game = isGameId(gameId) && gameId !== 'LOBBY' ? GAME_REGISTRY[gameId] : undefined;

  const inputRef = useRef<NormalizedInput>(emptyInput());
  const [status, setStatus] = useState<GameStatus>('READY');
  const [score, setScore] = useState(0);
  const [paused, setPaused] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const [hud, setHud] = useState({ x: 0, y: 0, actions: '' });

  const sendAction = (action: string) => applyAction(inputRef.current, action);

  // 鍵盤 → 傾斜 + 按鈕
  useEffect(() => {
    const pressed = new Set<string>();
    const tilt = { x: 0, y: 0 };
    let last = performance.now();
    let frame = 0;

    const onDown = (e: KeyboardEvent) => {
      initAudio();
      if (e.repeat) return;
      if (TILT_KEYS[e.code] || HOLD_KEYS[e.code]) e.preventDefault();
      pressed.add(e.code);
      if (HOLD_KEYS[e.code]) applyAction(inputRef.current, `${HOLD_KEYS[e.code]}-start`);
      if (e.code === 'Enter') applyAction(inputRef.current, 'start-game');
      if (e.code === 'KeyR') {
        setMountKey(k => k + 1);
        setScore(0);
        setPaused(false);
      }
      if (e.code === 'KeyP') setPaused(p => !p);
    };
    const onUp = (e: KeyboardEvent) => {
      pressed.delete(e.code);
      if (HOLD_KEYS[e.code]) applyAction(inputRef.current, `${HOLD_KEYS[e.code]}-end`);
    };

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const maxDeg = DEFAULT_GAME_SETTINGS.maxAngle * (pressed.has('AltLeft') ? 0.5 : 1);
      for (const axis of ['x', 'y'] as const) {
        let target = 0;
        for (const code of pressed) {
          const k = TILT_KEYS[code];
          if (k && k.axis === axis) target += k.dir * maxDeg;
        }
        const step = TILT_DEG_PER_SEC * dt;
        tilt[axis] += Math.max(-step, Math.min(step, target - tilt[axis]));
      }
      // 跟平台一樣：gamma → move.x，beta → move.y
      inputRef.current.move = gyroToMove(tilt.y, tilt.x, DEFAULT_GAME_SETTINGS);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // HUD 每 100ms 更新一次就好
    const hudTimer = setInterval(() => {
      const { move, actions } = inputRef.current;
      setHud({
        x: move.x,
        y: move.y,
        actions: Object.entries(actions).filter(([, v]) => v).map(([k]) => k).join(', '),
      });
    }, 100);

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(hudTimer);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  if (!game) {
    return (
      <div className="p-8 text-white bg-black min-h-screen">
        <p className="mb-4">用 <code>/dev?game=遊戲ID</code> 開啟：</p>
        <ul className="list-disc pl-6">
          {Object.entries(GAME_REGISTRY).map(([id, g]) => (
            <li key={id}><a className="underline" href={`/dev?game=${id}`}>{id} — {g.name}</a></li>
          ))}
        </ul>
      </div>
    );
  }

  const Desktop = game.desktop;
  const Mobile = game.mobile;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="flex flex-wrap gap-x-6 gap-y-1 px-3 py-2 text-xs font-mono bg-zinc-900 border-b border-white/10">
        <span>{game.name}</span>
        <span>status={status}{paused ? ' (paused)' : ''}</span>
        <span>score={score}</span>
        <span>move.x={hud.x.toFixed(1)} move.y={hud.y.toFixed(1)}</span>
        <span>actions=[{hud.actions}]</span>
        <span className="text-white/50">方向鍵/WASD 傾斜（Alt 半傾）· Space 開火 · Shift 油門 · B 煞車 · Enter start-game · P 暫停 · R 重開</span>
      </div>

      {/* transform 讓遊戲裡 position:fixed 的元素以這個框為準，不會蓋到下面的控制器 */}
      <div className="relative w-full overflow-hidden" style={{ height: '62vh', transform: 'translateZ(0)' }}>
        <Desktop
          key={mountKey}
          inputRef={inputRef}
          paused={paused}
          callbacks={{
            onScoreChange: setScore,
            onStatusChange: setStatus,
            onExit: () => setMountKey(k => k + 1),
          }}
        />
      </div>

      {/* 手機控制器（橫放），可以直接用滑鼠點 */}
      <div className="flex justify-center py-3 bg-zinc-950 border-t border-white/10">
        <div className="relative overflow-hidden rounded-2xl border border-white/20" style={{ width: 640, height: 300 }}>
          <Mobile sendAction={sendAction} />
        </div>
      </div>
    </div>
  );
}

export default function DevPage() {
  if (process.env.NODE_ENV === 'production') {
    return <div className="p-8 text-white bg-black min-h-screen">Not available.</div>;
  }
  return (
    <Suspense fallback={null}>
      <DevPlay />
    </Suspense>
  );
}
