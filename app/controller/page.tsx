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

function ControllerContent() {
  const searchParams = useSearchParams();
  const room = searchParams.get('room');
  const [currentView, setCurrentView] = useState<GameId>('LOBBY');
  const [gameStatus, setGameStatus] = useState<string>('READY'); // [NEW] Track Global Status

  const { socket, isConnected } = useMobileSocket(room);

  const {
    permissionGranted,
    debug,
    requestPermission,
    handleCalibrate
  } = useGyroController(socket, room);

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
      <div className="flex flex-col items-center justify-between h-full py-4">

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
            {/* 上方狀態列 */}
            <div className="flex flex-col items-center w-full px-4 gap-2 relative">
              <div className={`flex items-center gap-2 px-4 py-1 rounded-full text-xs font-bold ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
              </div>

              {currentView !== 'LOBBY' && (
                // Use centralized overlay for settings/back, but this top-left back button is specific to "Controller Page".
                // Actually, MobileGameOverlay handles "Exit to Lobby" inside its menu. 
                // So we can probably remove this explicit Back button if the design intends the overlay to handle it.
                // But let's keep it as a fallback or remove it if redundant?
                // User request: "settings backtolobby move out".
                // MobileGameOverlay has settings which has exit.
                // Let's keep this simple header back button as is for now or remove if overlap.
                // The header back button is clean.
                <button onClick={handleBackToLobby} className="absolute left-10 top-1 text-xs text-gray-500 hover:text-white px-2 py-1 border border-white/10 rounded">
                  ← Back
                </button>
              )}

              <div className="bg-black/30 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 font-mono text-[10px] text-cyan-300">
                {debug}
              </div>
            </div>

            {/* 中間動態區塊 */}
            <div className="flex-1 flex items-center justify-center w-full relative px-8">

              {/* 狀態 A: 大廳 */}
              {currentView === 'LOBBY' && (
                <MobileLobby onSelectGame={handleGameSelect} />
              )}

              {/* 狀態 B: 遊戲控制器 */}
              {currentView !== 'LOBBY' && CurrentMobileController && (
                <>
                  {/* Shared Overlay (Menu, Ready, Game Over) */}
                  <MobileGameOverlay
                    socket={socket}
                    roomId={room}
                    status={gameStatus}
                  />

                  {/* Specific Game Controller (Fire buttons etc) */}
                  <CurrentMobileController socket={socket} roomId={room} />
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