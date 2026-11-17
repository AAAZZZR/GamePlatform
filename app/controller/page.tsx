// app/controller/page.tsx — 手機控制器：掃 QR code 進來，P2P 連上電腦後用陀螺儀 + 按鈕玩
"use client";

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePlayerLink } from '@/hooks/usePlayerLink';
import type { PlayerFailReason } from '@/lib/peer/playerLink';
import { useGyroController } from '@/states/Gyro_states';
import { GAME_REGISTRY, isGameId } from '@/games/registry';
import { GameId, GameMode, PlayerNumber } from '@/types/game';
import MobileLobby from '@/components/MobileLobby';
import MobileGameOverlay from '@/components/MobileGameOverlay';
import TiltBall from '@/components/TiltBall';

const FAIL_MESSAGES: Record<PlayerFailReason, string> = {
  unreachable: "Couldn't reach the game screen. Put your phone and the computer on the same Wi-Fi, then try again.",
  'room-full': 'This room is full.',
  'no-host': 'The game screen is closed. Scan the QR code on the computer again.',
  'rate-limited': 'Too many connection attempts. Wait a minute, then try again.',
  'daily-limit': "Today's connection limit is reached. Please come back tomorrow.",
  lost: 'Lost the connection to the game screen.',
  error: 'Something went wrong while connecting.',
};

function ConnectionFailed({ reason, onRetry }: { reason: PlayerFailReason; onRetry: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-black/90 px-8 text-center">
      <p className="text-white text-lg font-bold max-w-sm">{FAIL_MESSAGES[reason]}</p>
      <button
        onClick={onRetry}
        className="px-8 py-3 bg-cyan-500 text-white font-bold rounded-full active:scale-95 transition-transform"
      >
        Try again
      </button>
    </div>
  );
}

function ControllerContent() {
  // Lock body scroll on mobile controller page only
  useEffect(() => {
    document.documentElement.style.cssText = 'overflow:auto;overscroll-behavior:none;touch-action:manipulation;width:100%;height:100%';
    document.body.style.cssText = 'overflow:auto;overscroll-behavior:none;width:100%;height:100%';
    return () => {
      document.documentElement.style.cssText = '';
      document.body.style.cssText = '';
    };
  }, []);

  const searchParams = useSearchParams();
  const room = searchParams.get('room');
  const [currentView, setCurrentView] = useState<GameId>('LOBBY');
  const [gameStatus, setGameStatus] = useState<string>('READY');

  const { link, state } = usePlayerLink(room);
  const isConnected = state?.status === 'connected';
  const playerNumber: PlayerNumber = state?.status === 'connected' ? state.playerNumber : 1;
  const gameMode: GameMode = state?.status === 'connected' ? state.mode : 'solo';

  const sendGyro = useCallback((beta: number, gamma: number) => link?.sendGyro(beta, gamma), [link]);
  const sendAction = useCallback((action: string) => link?.sendAction(action), [link]);
  const selectGame = useCallback((gameId: GameId) => link?.selectGame(gameId), [link]);

  const {
    permissionGranted,
    tilt,
    gyroMode,
    requestPermission,
    handleCalibrate,
    switchGyroMode,
  } = useGyroController(isConnected ? sendGyro : null);

  // --- 電腦送來的畫面與狀態 ---
  useEffect(() => {
    if (!link) return;
    return link.onMessage(message => {
      if (message.type === 'game-changed') {
        setCurrentView(message.gameId);
        setGameStatus('READY');
      } else if (message.type === 'game-status') {
        setGameStatus(message.status);
      }
    });
  }, [link]);

  // --- 動作：請求陀螺儀權限並進入全螢幕 ---
  const handleStart = () => {
    // iPhone 規定陀螺儀權限要在點擊當下要，所以先要權限、全螢幕不等它
    void requestPermission();
    const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    const enterFullscreen = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root);
    enterFullscreen?.().catch(error => {
      // 有些瀏覽器（例如 iPhone Safari）不支援全螢幕，不影響遊戲
      console.warn('[controller] fullscreen not available', error);
    });
  };

  const handleGameSelect = (gameId: string) => {
    if (isGameId(gameId)) selectGame(gameId);
  };

  if (!room) return <div className="text-white flex items-center justify-center h-screen">Invalid Link</div>;

  // --- 動態取得當前遊戲的控制器組件 ---
  const CurrentMobileController = currentView === 'LOBBY' ? null : GAME_REGISTRY[currentView].mobile;
  const accent2P = gameMode === 'multi' && playerNumber === 2;

  return (
    <div className={`h-screen w-screen overflow-auto transition-colors duration-500 ${permissionGranted ? 'bg-slate-900' : 'bg-gray-900'}`}>

      {state?.status === 'failed' && link && (
        <ConnectionFailed reason={state.reason} onRetry={() => link.retry()} />
      )}

      {/* 1. 直屏提示遮罩 (Only show if NOT in Lobby) */}
      {currentView !== 'LOBBY' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center landscape:hidden bg-black/70 backdrop-blur-sm pointer-events-none">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <div className="text-5xl rotate-90">📱</div>
            <h2 className="text-cyan-400 font-black text-2xl uppercase tracking-widest text-center px-4 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]">
              PLEASE ROTATE PHONE
            </h2>
          </div>
        </div>
      )}

      {/* 2. 主內容 */}
      <div className="flex flex-col items-center justify-between h-full py-2">

        {!permissionGranted ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <button
              onClick={handleStart}
              className="p-8 bg-green-500 rounded-2xl text-white font-bold text-2xl shadow-[0_0_20px_rgba(34,197,94,0.6)] active:scale-95 transition-transform"
            >
              TAP TO START
            </button>
            <p className="text-xs text-gray-500 font-mono">
              {isConnected ? 'Connected to the game screen' : 'Connecting to the game screen…'}
            </p>
          </div>
        ) : (
          <>
            {/* 上方：連線狀態 + 模式選擇（獨立行） */}
            <div className="flex flex-col items-center w-full shrink-0 gap-1 pt-1">
              {/* Row 1: Connection + player badge */}
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-bold ${
                  isConnected
                    ? accent2P
                      ? 'bg-violet-500/20 text-violet-400'
                      : 'bg-green-500/20 text-green-400'
                    : 'bg-amber-500/20 text-amber-400'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    isConnected
                      ? accent2P
                        ? 'bg-violet-400 animate-pulse'
                        : 'bg-green-400 animate-pulse'
                      : 'bg-amber-400'
                  }`} />
                  {isConnected ? 'CONNECTED' : 'CONNECTING'}
                </div>

                {/* Player badge — only in multi mode */}
                {gameMode === 'multi' && isConnected && (
                  <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider ${
                    playerNumber === 1
                      ? 'bg-cyan-500/20 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                      : 'bg-violet-500/20 text-violet-300 shadow-[0_0_8px_rgba(139,92,246,0.3)]'
                  }`}>
                    P{playerNumber}
                  </div>
                )}

                {currentView !== 'LOBBY' && (
                  <button onClick={() => selectGame('LOBBY')} className="text-[10px] text-gray-500 hover:text-white px-2 py-0.5 border border-white/10 rounded">
                    ← Back
                  </button>
                )}
              </div>

              {/* Row 2: Gyro mode toggle — full width, prominent */}
              <div className="flex items-center gap-2 w-full px-6">
                <span className="text-[10px] text-gray-500 font-mono shrink-0">HOLD</span>
                <div className="flex flex-1 bg-black/40 rounded-xl border border-white/10 overflow-hidden">
                  <button
                    onClick={() => switchGyroMode('natural')}
                    className={`flex-1 py-2 text-xs font-bold tracking-wide transition-colors ${
                      gyroMode === 'natural'
                        ? accent2P
                          ? 'bg-violet-500/30 text-violet-300'
                          : 'bg-cyan-500/30 text-cyan-300'
                        : 'text-gray-500'
                    }`}
                  >
                    🤲 Natural Hold
                  </button>
                  <div className="w-px bg-white/10" />
                  <button
                    onClick={() => switchGyroMode('flat')}
                    className={`flex-1 py-2 text-xs font-bold tracking-wide transition-colors ${
                      gyroMode === 'flat'
                        ? accent2P
                          ? 'bg-violet-500/30 text-violet-300'
                          : 'bg-cyan-500/30 text-cyan-300'
                        : 'text-gray-500'
                    }`}
                  >
                    📱 Flat Table
                  </button>
                </div>
              </div>
            </div>

            {/* 中間動態區塊 */}
            <div className={`flex-1 min-h-0 flex w-full relative ${currentView === 'LOBBY' ? 'items-start overflow-y-auto' : 'items-center justify-center px-8'}`}>

              {/* 狀態 A: 大廳 — 遊戲選單 + 光球 */}
              {currentView === 'LOBBY' && (
                <div className="w-full h-full flex">
                  {/* 左側遊戲列表 (or waiting screen in multi mode) */}
                  <div className="flex-1 min-w-0">
                    <MobileLobby
                      onSelectGame={handleGameSelect}
                      mode={gameMode}
                      playerNumber={playerNumber}
                    />
                  </div>
                  {/* 右側光球指示器 */}
                  <div className="shrink-0 flex items-center justify-center px-2">
                    <TiltBall tiltX={tilt.x} tiltY={tilt.y} size={20} range={50} />
                  </div>
                </div>
              )}

              {/* 狀態 B: 遊戲控制器 */}
              {CurrentMobileController && (
                <>
                  {/* Shared Overlay (Menu, Ready, Game Over) */}
                  <MobileGameOverlay
                    status={gameStatus}
                    sendAction={sendAction}
                    onRecenter={handleCalibrate}
                    onBackToLobby={() => selectGame('LOBBY')}
                  />

                  {/* Specific Game Controller (Fire buttons etc) */}
                  <CurrentMobileController sendAction={sendAction} />
                </>
              )}

            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ControllerPage() {
  return (
    <Suspense fallback={<div className="text-white bg-black h-screen flex items-center justify-center">Loading...</div>}>
      <ControllerContent />
    </Suspense>
  );
}
