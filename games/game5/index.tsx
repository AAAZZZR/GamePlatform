// games/game5/index.tsx — Tilt to Live（電腦端）
// 傾斜手機控制箭頭，躲開追過來的紅點，撞道具球反擊。
// 遊戲狀態放在 effect 裡的 World（engine.ts），每幀畫到 canvas（render.ts）；
// React state 只放很少變的東西（READY / PLAYING / GAME_OVER、結算），不會每幀重繪元件。
'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { DesktopGameProps } from '@/platform/types';
import { POWERUP_ORDER, POWERUPS } from './config';
import { createWorld, resizeWorld, startRun, updateWorld, type Phase } from './engine';
import { createRenderCache, formatTime, renderWorld } from './render';
import { sounds } from './sounds';
import { PowerupBadge } from './PowerupIcon';

const BEST_KEY = 'gyroplay.game5.best';
const MAX_DT = 1 / 20; // 分頁切回來或卡頓時，一幀最多模擬 50ms，避免瞬移穿牆
const SCORE_REPORT_MS = 200; // 分數回報給平台的最短間隔（平台每次都會重繪）
const MAX_CANVAS_PIXELS = 4_200_000; // 4K 電視上限制畫布解析度，維持 60fps

type UiStatus = 'READY' | 'PLAYING' | 'GAME_OVER';

interface RunSummary {
  time: number;
  kills: number;
  maxCombo: number;
  best: number;
  newBest: boolean;
}

interface UiState {
  status: UiStatus;
  best: number;
  summary: RunSummary | null;
}

function loadBest(): number {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    if (raw === null) return 0;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch (err) {
    console.warn('[TiltToLive] 讀不到最佳紀錄（localStorage 無法使用），這次從 0 開始', err);
    return 0;
  }
}

function saveBest(score: number): void {
  try {
    window.localStorage.setItem(BEST_KEY, String(score));
  } catch (err) {
    console.warn('[TiltToLive] 最佳紀錄存不進 localStorage', err);
  }
}

function statusForPhase(phase: Phase): UiStatus {
  if (phase === 'ready') return 'READY';
  if (phase === 'over') return 'GAME_OVER';
  return 'PLAYING';
}

function padScore(score: number): string {
  return score.toString().padStart(6, '0');
}

export default function TiltToLive({ inputRef, paused, callbacks }: DesktopGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const callbacksRef = useRef(callbacks);
  const [ui, setUi] = useState<UiState>({ status: 'READY', best: 0, summary: null });

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    callbacksRef.current.onStatusChange(ui.status);
  }, [ui.status]);

  // 遊戲迴圈：只在掛載時建立一次
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      console.error('[TiltToLive] 找不到 canvas 或容器，遊戲無法啟動');
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('[TiltToLive] 這個瀏覽器無法使用 Canvas 2D，遊戲無法啟動');
      return;
    }

    const world = createWorld(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight), loadBest());
    const cache = createRenderCache();
    let dpr = 1;

    const resize = () => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      let ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (w * h * ratio * ratio > MAX_CANVAS_PIXELS) {
        ratio = Math.max(0.75, Math.sqrt(MAX_CANVAS_PIXELS / (w * h)));
      }
      dpr = ratio;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      resizeWorld(world, w, h);
      needsRender = true; // 改尺寸會清空畫布，暫停中也要補畫一次
    };
    let needsRender = true;
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    // 平台的一次性按鈕會維持 true 約 150ms（好幾幀），只在按下的那一刻處理一次
    const previousActions: Record<string, boolean> = {};
    const justPressed = (name: string): boolean => {
      const down = inputRef.current.actions[name] === true;
      const wasDown = previousActions[name] === true;
      previousActions[name] = down;
      return down && !wasDown;
    };

    let lastPhase: Phase = world.phase;
    let lastFrame = performance.now();
    let lastReportedScore = -1;
    let lastScoreReport = 0;
    let uiSynced = false;
    let frameId = 0;

    const reportScore = (now: number, force: boolean) => {
      if (world.score === lastReportedScore) return;
      if (!force && now - lastScoreReport < SCORE_REPORT_MS) return;
      lastReportedScore = world.score;
      lastScoreReport = now;
      callbacksRef.current.onScoreChange(world.score);
    };

    const handlePhaseChange = (phase: Phase) => {
      if (phase === 'over') {
        const previousBest = world.best;
        const newBest = world.score > previousBest;
        if (newBest) {
          world.best = world.score;
          saveBest(world.score);
        }
        setUi({
          status: 'GAME_OVER',
          best: world.best,
          summary: { time: world.clock, kills: world.kills, maxCombo: world.maxCombo, best: world.best, newBest },
        });
        return;
      }
      // dying 對平台來說還是 PLAYING（爆炸演出完才 GAME_OVER）
      if (phase !== 'dying') {
        setUi({ status: statusForPhase(phase), best: world.best, summary: null });
      }
    };

    const frame = (now: number) => {
      frameId = requestAnimationFrame(frame);
      const dt = Math.min(Math.max(0, (now - lastFrame) / 1000), MAX_DT);
      lastFrame = now;
      const isPaused = pausedRef.current;

      if (!uiSynced) {
        uiSynced = true;
        setUi(prev => ({ ...prev, best: world.best }));
      }

      const startPressed = justPressed('start-game');
      const restartPressed = justPressed('restart-game');
      const pausePressed = justPressed('pause');
      const resumePressed = justPressed('resume');

      if (restartPressed) {
        // 重來直接開新局（不用再回 READY 倒數一次）
        const fromReady = world.phase === 'ready';
        startRun(world, !fromReady);
        // 平台只在 READY → PLAYING 時播開場音；從結束畫面直接重來由這裡補播
        if (!fromReady) sounds.start();
      } else if (startPressed && world.phase === 'ready') {
        startRun(world, false);
      }
      if (pausePressed && !isPaused && world.phase === 'playing') {
        callbacksRef.current.onStatusChange('PAUSED');
      }
      if (resumePressed && isPaused) {
        callbacksRef.current.onStatusChange('PLAYING');
      }

      // 暫停時畫面停在最後一幀（不重畫，畫面震動也不會在暫停時一直抖）
      if (!isPaused) {
        updateWorld(world, dt, inputRef.current.move);
        needsRender = true;
      }
      if (needsRender) {
        renderWorld(ctx, world, cache, dpr);
        needsRender = false;
      }

      if (world.phase !== lastPhase) {
        lastPhase = world.phase;
        handlePhaseChange(world.phase);
        reportScore(now, true);
      } else {
        reportScore(now, false);
      }
    };
    frameId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [inputRef]);

  return (
    // h-screen + max-h-full：在平台（父層高度是 auto）時是整個螢幕，在 /dev 試玩框裡就貼齊框的高度。
    // 根元素不要加 z-index / transform：結算面板要用 z-50 疊在平台的 GAME OVER 遮罩上面。
    <div ref={containerRef} className="relative h-screen max-h-full w-full select-none overflow-hidden bg-[#050510] font-mono">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      {ui.status === 'READY' && <ReadyScreen best={ui.best} />}
      {ui.status === 'GAME_OVER' && ui.summary && <GameOverPanel summary={ui.summary} />}
    </div>
  );
}

// ─── READY 畫面 ───────────────────────────────────────────────────────
// 平台的 GameOverlay 會在正中央顯示「Start your game via phone」，所以標題放上方、道具說明放下方，不疊字。

function ReadyScreen({ best }: { best: number }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-[9%] z-30 flex flex-col items-center gap-3 px-4 text-center">
        <h1
          className="text-5xl font-black tracking-wider text-cyan-400 md:text-7xl"
          style={{ textShadow: '0 0 30px rgba(103,232,249,0.6)' }}
        >
          TILT TO LIVE
        </h1>
        <p className="text-sm tracking-[0.3em] text-white/60">TILT YOUR PHONE TO STEER · DODGE THE RED DOTS</p>
        <p className="animate-pulse text-xs tracking-[0.3em] text-cyan-300/70">TRY IT NOW — YOUR ARROW ALREADY MOVES</p>
        {best > 0 && <p className="text-xs tracking-[0.3em] text-yellow-300/80">BEST {padScore(best)}</p>}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-[6%] z-30 flex flex-wrap justify-center gap-x-5 gap-y-3 px-6">
        {POWERUP_ORDER.map(type => (
          <div key={type} className="flex w-24 flex-col items-center gap-1.5 text-center">
            <PowerupBadge type={type} size={36} />
            <div className="text-[11px] font-bold tracking-wider" style={{ color: POWERUPS[type].color }}>
              {POWERUPS[type].name}
            </div>
            <div className="text-[10px] leading-tight text-white/50">{POWERUPS[type].hint}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── 結算面板 ─────────────────────────────────────────────────────────
// 平台的 GameOverlay 已經在正中央顯示 GAME OVER 和分數，這裡只補它沒有的資訊，放在它下面。

function GameOverPanel({ summary }: { summary: RunSummary }) {
  const stats = [
    { label: 'TIME', value: formatTime(summary.time) },
    { label: 'KILLS', value: String(summary.kills) },
    { label: 'MAX COMBO', value: String(summary.maxCombo) },
    { label: 'BEST', value: padScore(summary.best) },
  ];
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-50 flex flex-col items-center gap-3 px-4"
      style={{ top: 'calc(50% + 92px)' }}
    >
      {summary.newBest && (
        <div className="animate-pulse rounded-full border border-yellow-300/60 bg-yellow-400/15 px-4 py-1 text-xs font-black tracking-[0.3em] text-yellow-300">
          NEW BEST!
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        {stats.map(stat => (
          <div key={stat.label} className="min-w-24 rounded-lg border border-white/10 bg-black/60 px-4 py-2 text-center">
            <div className="text-[10px] tracking-[0.25em] text-white/45">{stat.label}</div>
            <div className="text-lg font-black text-white">{stat.value}</div>
          </div>
        ))}
      </div>
      <div className="text-[11px] tracking-[0.3em] text-white/45">PRESS RESTART ON YOUR PHONE</div>
    </div>
  );
}
