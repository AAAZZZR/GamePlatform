// app/controller/page.tsx
"use client";

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMobileSocket } from '@/hooks/useMobileSocket';
import { useGyroController } from '@/states/Gyro_states';
import { GAME_REGISTRY } from '@/games/registry';
import { GameId } from '@/types/game';
import MobileLobby from '@/components/MobileLobby';
import MobileGameOverlay from '@/components/MobileGameOverlay';
import TiltBall from '@/components/TiltBall';

function ControllerContent() {
  // Lock body scroll on mobile controller page only
  useEffect(() => {
    document.documentElement.style.cssText = 'position:fixed;overflow:hidden;overscroll-behavior:none;touch-action:manipulation;width:100%;height:100%';
    document.body.style.cssText = 'position:fixed;overflow:hidden;overscroll-behavior:none;width:100%;height:100%';
    return () => {
      document.documentElement.style.cssText = '';
      document.body.style.cssText = '';
    };
  }, []);

  const searchParams = useSearchParams();
  const room = searchParams.get('room');
  const [currentView, setCurrentView] = useState<GameId>('LOBBY');
  const [gameStatus, setGameStatus] = useState<string>('READY'); // [NEW] Track Global Status

  const { socket, isConnected, sendGyro, sendAction } = useMobileSocket(room);

  const {
    permissionGranted,
    debug,
    tilt,
    gyroMode,
    requestPermission,
    handleCalibrate,
    switchGyroMode,
  } = useGyroController(socket, room, sendGyro);

  // --- 狀態同步 ---
  useEffect(() => {
    if (!socket) return;

    socket.on('game-changed', (gameId: GameId) => {
      setCurrentView(gameId);
      setGameStatus('READY'); // Default to ready on switch
    });

    // Listen for Host Game Status (Game1 sends 'sync-game-status')
    socket.on('sync-game-status', (status: string) => {
      setGameStatus(status);
    });

    return () => {
      socket.off('game-changed');
      socket.off('sync-game-status');
    };
  }, [socket]);

  // --- 動作：進入全螢幕並請求權限 ---
  const handleStart = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        await (document.documentElement as any).webkitRequestFullscreen();
      }
    } catch (e) { console.log(e); }
    requestPermission();
  };

  const handleGameSelect = (gameId: string) => {
    if (socket && room) {
      socket.emit('select-game', { roomId: room, gameId });
    }
  };

  const handleBackToLobby = () => {
    if (socket && room) {
      socket.emit('select-game', { roomId: room, gameId: 'LOBBY' });
    }
  };

  if (!room) return <div className="text-white flex items-center justify-center h-screen">Invalid Link</div>;

  // --- 動態取得當前遊戲的控制器組件 ---
  const CurrentMobileController = GAME_REGISTRY[currentView]?.mobile;

  return (
    <div className={`h-screen w-screen overflow-hidden transition-colors duration-500 ${permissionGranted ? 'bg-slate-900' : 'bg-gray-900'}`}>

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
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={handleStart}
              className="p-8 bg-green-500 rounded-2xl text-white font-bold text-2xl shadow-[0_0_20px_rgba(34,197,94,0.6)] active:scale-95 transition-transform"
            >
              TAP TO START
            </button>
          </div>
        ) : (
          <>
            {/* 上方：連線狀態 + 模式選擇（獨立行） */}
            <div className="flex flex-col items-center w-full shrink-0 gap-1 pt-1">
              {/* Row 1: Connection + debug */}
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-bold ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                  {isConnected ? 'CONNECTED' : 'OFF'}
                </div>
                {currentView !== 'LOBBY' && (
                  <button onClick={handleBackToLobby} className="text-[10px] text-gray-500 hover:text-white px-2 py-0.5 border border-white/10 rounded">
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
                    className={`flex-1 py-2 text-xs font-bold tracking-wide transition-colors ${gyroMode === 'natural' ? 'bg-cyan-500/30 text-cyan-300' : 'text-gray-500'}`}
                  >
                    🤲 Natural Hold
                  </button>
                  <div className="w-px bg-white/10" />
                  <button
                    onClick={() => switchGyroMode('flat')}
                    className={`flex-1 py-2 text-xs font-bold tracking-wide transition-colors ${gyroMode === 'flat' ? 'bg-cyan-500/30 text-cyan-300' : 'text-gray-500'}`}
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
                  {/* 左側遊戲列表 */}
                  <div className="flex-1 min-w-0">
                    <MobileLobby onSelectGame={handleGameSelect} />
                  </div>
                  {/* 右側光球指示器 */}
                  <div className="shrink-0 flex items-center justify-center px-2">
                    <TiltBall tiltX={tilt.x} tiltY={tilt.y} size={20} range={50} />
                  </div>
                </div>
              )}

              {/* 狀態 B: 遊戲控制器 */}
              {currentView !== 'LOBBY' && CurrentMobileController && (
                <>
                  {/* Shared Overlay (Menu, Ready, Game Over) */}
                  <MobileGameOverlay
                    socket={socket}
                    roomId={room}
                    status={gameStatus}
                    sendAction={sendAction}
                  />

                  {/* Specific Game Controller (Fire buttons etc) */}
                  <CurrentMobileController socket={socket} roomId={room} sendAction={sendAction} />
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