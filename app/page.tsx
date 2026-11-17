// app/page.tsx — 電腦端：大廳（QR code、選遊戲）和遊戲畫面
"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useHostLink } from '@/hooks/useHostLink';
import type { HostSnapshot } from '@/lib/peer/hostLink';
import Lobby from '@/components/Lobby';
import GameShell from '@/platform/GameShell';
import { isGameId } from '@/games/registry';
import { GameId, GameMode, PlayerNumber } from '@/types/game';
import { initAudio, startBgm, stopBgm } from '@/platform/audio';

function SignalBanner({ snapshot }: { snapshot: HostSnapshot }) {
  let text: string | null = null;
  if (snapshot.signal === 'connecting' || snapshot.signal === 'reconnecting') {
    text = 'Connecting to server… phones can join once connected.';
  } else if (snapshot.stopReason === 'daily-limit') {
    text = 'Daily connection limit reached. New phones can join again tomorrow.';
  } else if (snapshot.stopReason === 'replaced') {
    text = 'This room was opened somewhere else. Refresh the page to start a new room.';
  }
  if (!text) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500/90 text-black text-center text-sm font-bold py-1.5">
      {text}
    </div>
  );
}

export default function Home() {
  const { link, snapshot } = useHostLink();
  const [currentView, setCurrentView] = useState<GameId>('LOBBY');
  const [audioReady, setAudioReady] = useState(false);
  const [desktopTilt, setDesktopTilt] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<GameMode | null>(null);

  // 首次互動解鎖 AudioContext（瀏覽器政策需要 user gesture）
  useEffect(() => {
    const unlock = () => {
      initAudio();
      setAudioReady(true);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // BGM：大廳播放，進遊戲時停止
  useEffect(() => {
    if (!audioReady) return;
    if (currentView === 'LOBBY') startBgm();
    else stopBgm();
    return () => stopBgm();
  }, [currentView, audioReady]);

  useEffect(() => {
    link?.setMode(mode ?? 'solo');
  }, [link, mode]);

  const selectGame = useCallback(
    (gameId: GameId) => {
      setCurrentView(gameId);
      link?.broadcast({ type: 'game-changed', gameId });
    },
    [link],
  );

  // 大廳的光球跟著手機傾斜；進遊戲後不更新，避免每秒 20 次重繪整頁
  const inLobbyRef = useRef(true);
  useEffect(() => {
    inLobbyRef.current = currentView === 'LOBBY';
  }, [currentView]);

  useEffect(() => {
    if (!link) return;
    return link.onMessage(message => {
      if (message.type === 'select-game') {
        if (isGameId(message.gameId)) {
          selectGame(message.gameId);
        } else {
          console.warn('[host] phone asked for unknown game', message.gameId);
        }
      } else if (message.type === 'gyro' && inLobbyRef.current) {
        setDesktopTilt({
          x: Math.max(-1, Math.min(1, message.gamma / 30)),
          y: Math.max(-1, Math.min(1, message.beta / 30)),
        });
      }
    });
  }, [link, selectGame]);

  const players = snapshot?.players;
  const connectedPlayers = useMemo(
    () => new Map<string, PlayerNumber>((players ?? []).map(n => [`p${n}`, n])),
    [players],
  );

  if (!link || !snapshot) {
    return <div className="h-screen bg-black text-white flex items-center justify-center">Initializing System...</div>;
  }

  if (currentView !== 'LOBBY') {
    return (
      <>
        <SignalBanner snapshot={snapshot} />
        <GameShell gameId={currentView} link={link} mode={mode ?? 'solo'} onExit={() => selectGame('LOBBY')} />
      </>
    );
  }

  return (
    <>
      <SignalBanner snapshot={snapshot} />
      <Lobby
        joinLink={snapshot.joinLink}
        isControllerConnected={snapshot.players.length > 0}
        tilt={desktopTilt}
        onSelectGame={gameId => {
          if (isGameId(gameId)) selectGame(gameId);
        }}
        mode={mode}
        onModeSelect={setMode}
        connectedPlayers={connectedPlayers}
      />
    </>
  );
}
