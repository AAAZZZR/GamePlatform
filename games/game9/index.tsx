// games/game9/index.tsx — Sky Fighter（R3F 3D 空戰）
// 結構：
//   sim.ts    遊戲邏輯（可變狀態物件，每幀原地更新）
//   scene.tsx 3D 畫面（各元件在 useFrame 讀狀態）
//   hud.tsx   HUD（DOM 畫一次，之後每幀直接改 style）
//   sound.ts  音效
// 這個檔案：接平台合約、每幀驅動（輸入 → 模擬 → 事件 → 鏡頭 → HUD）、標題與結算畫面。
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DesktopGameProps, GameStatus, NormalizedInput } from '@/platform/types';
import { COLORS, FLIGHT, VIEW } from './config';
import { GameState, clamp, clearEvents, createGameState, resetGame, startGame, stepGame } from './sim';
import { SkyScene } from './scene';
import { HudController, Hud, ViewSize, speedRatio } from './hud';
import { WindLoop, skySfx } from './sound';

// ==========================================
// 鏡頭
// ==========================================
const UP = new THREE.Vector3(0, 1, 0);
const _desiredOffset = new THREE.Vector3();
const _desiredLook = new THREE.Vector3();
const _look = new THREE.Vector3();
const _shake = new THREE.Vector3();
const ZERO = new THREE.Vector3();

class CameraRig {
  /** 鏡頭相對飛機的位置（平滑的是「相對位置」，高速時才不會被甩到後面） */
  offset = new THREE.Vector3(0, 4, 16);
  lookOffset = new THREE.Vector3();
  roll = 0;
  fov = VIEW.FOV_BASE;
  /** 震動量 0~1，震幅 = trauma²，會自己衰減 */
  trauma = 0;
  snap = true;
  time = 0;
  /** 墜落鏡頭的目標相對位置（玩家死掉那一刻才決定） */
  deathOffset: THREE.Vector3 | null = null;

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** 下一幀直接跳到目標位置（開局、重來時用，不要從標題畫面的位置滑過去） */
  requestSnap(): void {
    this.snap = true;
    this.deathOffset = null;
  }
}

function smoothFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** 平滑的偽亂數震動（比純亂數不暈） */
function shakeNoise(t: number, seed: number): number {
  return Math.sin(t * 31.7 + seed * 12.3) * 0.6 + Math.sin(t * 17.3 + seed * 4.1) * 0.4;
}

function fovForSpeed(ratio: number): number {
  const cruise = speedRatio(FLIGHT.CRUISE_SPEED);
  if (ratio < cruise) return VIEW.FOV_BASE - VIEW.FOV_BRAKE * ((cruise - ratio) / cruise);
  return VIEW.FOV_BASE + VIEW.FOV_BOOST * Math.min(1.3, (ratio - cruise) / (1 - cruise));
}

function updateCamera(rig: CameraRig, camera: THREE.PerspectiveCamera, game: GameState, dt: number): void {
  const p = game.player;
  rig.time += dt;
  let base = p.pos;
  let fovTarget = VIEW.FOV_BASE;

  if (game.phase === 'READY') {
    // 標題畫面：繞著飛機慢慢轉
    const t = game.time * 0.25;
    rig.offset.set(Math.sin(t) * 15, 3.5 + Math.sin(t * 0.7) * 1.5, Math.cos(t) * 15);
    rig.lookOffset.set(0, 0, 0);
    rig.roll = 0;
    rig.snap = true;
  } else if (game.phase === 'PLAYING') {
    const ratio = clamp(speedRatio(p.speed), 0, 1.3);
    const dist = VIEW.CAMERA_DIST * (0.9 + ratio * 0.35);
    _desiredOffset.copy(p.forward).multiplyScalar(-dist).addScaledVector(UP, VIEW.CAMERA_HEIGHT);
    _desiredLook.copy(p.forward).multiplyScalar(VIEW.CAMERA_LOOK_AHEAD);
    if (rig.snap) {
      rig.offset.copy(_desiredOffset);
      rig.lookOffset.copy(_desiredLook);
      rig.snap = false;
    }
    rig.offset.lerp(_desiredOffset, smoothFactor(6, dt));
    rig.lookOffset.lerp(_desiredLook, smoothFactor(9, dt));
    // 鏡頭只跟一點點機身傾斜：有轉彎感，但地平線不會大幅晃
    rig.roll += (p.bank * 0.2 - rig.roll) * smoothFactor(5, dt);
    fovTarget = fovForSpeed(ratio);
  } else {
    // 墜落鏡頭：轉成水平視角看著墜落點（看得到爆炸、海面和天空），慢慢拉遠
    base = game.deathPos;
    if (!rig.deathOffset) {
      const horizontal = new THREE.Vector3(rig.offset.x, 0, rig.offset.z);
      if (horizontal.lengthSq() < 1) horizontal.set(0, 0, 1);
      rig.deathOffset = horizontal.normalize().multiplyScalar(26).addScaledVector(UP, 7);
    }
    rig.deathOffset.multiplyScalar(1 + dt * 0.08);
    rig.offset.lerp(rig.deathOffset, smoothFactor(1.8, dt));
    rig.lookOffset.lerp(ZERO, smoothFactor(3, dt));
    rig.roll += (0 - rig.roll) * smoothFactor(2, dt);
  }

  rig.fov += (fovTarget - rig.fov) * smoothFactor(4, dt);
  rig.trauma = Math.max(0, rig.trauma - dt * 1.4);
  const shake = rig.trauma * rig.trauma;

  camera.position.copy(base).add(rig.offset);
  if (shake > 0) {
    _shake.set(shakeNoise(rig.time, 1), shakeNoise(rig.time, 2), shakeNoise(rig.time, 3));
    camera.position.addScaledVector(_shake, shake * 1.6);
  }
  camera.position.y = Math.max(camera.position.y, 1.5);
  _look.copy(base).add(rig.lookOffset);
  camera.up.copy(UP);
  camera.lookAt(_look);
  camera.rotateZ(rig.roll + shake * 0.06 * shakeNoise(rig.time, 4));
  if (Math.abs(camera.fov - rig.fov) > 0.05) {
    camera.fov = rig.fov;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();
}

// ==========================================
// 每幀驅動
// ==========================================
export interface Debrief {
  score: number;
  kills: number;
  wave: number;
  accuracy: number;
  bestStreak: number;
}

/** 單次型按鈕（start-game 等）會維持 true 約 150ms，只取「剛按下」那一幀 */
class ActionEdges {
  private previous: Record<string, boolean> = {};

  pressed(actions: NormalizedInput['actions'], name: string): boolean {
    const now = !!actions[name];
    const before = !!this.previous[name];
    this.previous[name] = now;
    return now && !before;
  }
}

interface DriverProps {
  game: GameState;
  inputRef: DesktopGameProps['inputRef'];
  pausedRef: React.RefObject<boolean>;
  hudRootRef: React.RefObject<HTMLDivElement | null>;
  onStatus: (status: GameStatus) => void;
  onScore: (score: number) => void;
  onGameOver: (debrief: Debrief) => void;
}

function GameDriver({ game, inputRef, pausedRef, hudRootRef, onStatus, onScore, onGameOver }: DriverProps) {
  const [rig] = useState(() => new CameraRig());
  const [hud] = useState(() => new HudController());
  const [wind] = useState(() => new WindLoop());
  const [edges] = useState(() => new ActionEdges());
  const lastScoreRef = useRef(0);
  const wasBoostingRef = useRef(false);

  useEffect(() => () => wind.stop(), [wind]);

  // priority -1：比畫面元件（0）先跑，大家讀到的都是同一幀的狀態
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const input = inputRef.current;
    const actions = input.actions;
    const paused = pausedRef.current;
    const camera = state.camera as THREE.PerspectiveCamera;
    const size: ViewSize = state.size;

    // ─── 生命週期 ───
    if (edges.pressed(actions, 'restart-game')) {
      resetGame(game);
      rig.requestSnap();
      lastScoreRef.current = 0;
      onScore(0);
      onStatus('READY');
    }
    if (edges.pressed(actions, 'start-game') && game.phase === 'READY') {
      startGame(game);
      rig.requestSnap();
      onStatus('PLAYING');
    }
    const inRun = game.phase === 'PLAYING' || game.phase === 'DYING';
    if (edges.pressed(actions, 'pause') && inRun) onStatus('PAUSED');
    if (edges.pressed(actions, 'resume') && inRun) onStatus('PLAYING');

    // ─── 模擬 ───
    const running = !paused;
    if (running) {
      stepGame(game, {
        moveX: input.move.x,
        moveY: input.move.y,
        fire: !!actions.fire,
        throttle: !!actions.throttle,
        brake: !!actions.brake,
      }, dt);
    }

    // ─── 事件：音效、鏡頭震動 ───
    const p = game.player;
    for (const event of game.events) {
      switch (event.type) {
        case 'shot':
          skySfx.gun();
          break;
        case 'gunEmpty':
          skySfx.gunEmpty();
          break;
        case 'enemyHit':
          skySfx.hitTick();
          break;
        case 'enemyKilled': {
          skySfx.enemyDown();
          if (event.multiplier > 1) skySfx.streak(event.multiplier);
          const closeness = clamp(1 - event.pos.distanceTo(p.pos) / 400, 0.15, 1);
          rig.addTrauma(0.35 * closeness);
          break;
        }
        case 'playerHit':
          skySfx.playerHit();
          rig.addTrauma(event.damage >= 20 ? 0.8 : 0.32);
          break;
        case 'playerDied':
          skySfx.playerExplode();
          rig.addTrauma(1);
          break;
        case 'lockOn':
          skySfx.lockOn();
          break;
        case 'waveStart':
          skySfx.waveStart();
          break;
        case 'waveClear':
          skySfx.waveClear();
          break;
        case 'gameOver':
          onStatus('GAME_OVER');
          onGameOver({
            score: game.score,
            kills: game.kills,
            wave: game.wave,
            accuracy: game.shotsFired > 0 ? game.shotsHit / game.shotsFired : 0,
            bestStreak: game.bestStreak,
          });
          break;
      }
    }

    // ─── 持續音效 ───
    const flying = running && game.phase === 'PLAYING';
    if (flying) {
      wind.start();
      wind.update(speedRatio(p.speed), p.throttle);
      if (game.aimWarning) skySfx.aimWarning();
      if (p.throttle && !wasBoostingRef.current) skySfx.afterburner();
      wasBoostingRef.current = p.throttle;
    } else {
      wind.stop();
      wasBoostingRef.current = false;
    }

    if (game.score !== lastScoreRef.current) {
      lastScoreRef.current = game.score;
      onScore(game.score);
    }

    // ─── 鏡頭與 HUD（要在鏡頭更新後才能投影到螢幕） ───
    updateCamera(rig, camera, game, running ? dt : 0);
    if (hud.attach(hudRootRef.current)) {
      for (const event of game.events) hud.handleEvent(event, camera, size);
      hud.update(game, camera, size);
    }
    clearEvents(game);
  }, -1);

  return null;
}

// ==========================================
// 標題與結算
// ==========================================
function TitleCard() {
  const controls: [string, string][] = [
    ['TILT', 'steer & climb'],
    ['FIRE', 'hold to shoot · lock-on aims for you'],
    ['THROTTLE', 'afterburner'],
    ['BRAKE', 'slow down · turn tighter'],
  ];
  return (
    <div className="absolute inset-0 z-20 pointer-events-none select-none">
      <div className="absolute left-0 right-0 text-center" style={{ top: '13%' }}>
        <div
          className="font-black tracking-wider"
          style={{
            fontSize: 'clamp(40px, 7vw, 84px)',
            color: '#00eeff',
            textShadow: '0 0 30px rgba(0,238,255,0.6), 0 0 60px rgba(0,238,255,0.3), 0 4px 0 rgba(0,40,70,0.6)',
          }}
        >
          SKY FIGHTER
        </div>
        <div className="font-mono text-white/80 tracking-[0.3em] text-sm mt-1" style={{ textShadow: '0 1px 4px rgba(0,30,60,0.8)' }}>
          SURVIVE THE WAVES · CHAIN YOUR KILLS
        </div>
      </div>
      <div className="absolute left-0 right-0 flex justify-center" style={{ bottom: '9%' }}>
        <div
          className="grid gap-x-5 gap-y-1.5 font-mono text-sm px-6 py-4 rounded-xl"
          style={{ gridTemplateColumns: 'auto auto', background: 'rgba(0,20,40,0.55)', border: '1px solid rgba(127,243,255,0.25)' }}
        >
          {controls.map(([key, text]) => (
            <React.Fragment key={key}>
              <span className="font-black text-right" style={{ color: COLORS.hud }}>{key}</span>
              <span className="text-white/85">{text}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 結算資訊放在畫面下方，不和平台 GAME OVER 覆蓋層（置中）重疊 */
function DebriefStrip({ data }: { data: Debrief }) {
  const items: [string, string][] = [
    ['WAVE', `${data.wave}`],
    ['KILLS', `${data.kills}`],
    ['ACCURACY', `${Math.round(data.accuracy * 100)}%`],
    ['BEST STREAK', data.bestStreak > 1 ? `×${data.bestStreak}` : '—'],
  ];
  return (
    <div className="absolute left-0 right-0 flex justify-center pointer-events-none select-none" style={{ bottom: '8%', zIndex: 45 }}>
      <div className="flex gap-8 font-mono px-8 py-4 rounded-xl" style={{ background: 'rgba(0,15,30,0.7)', border: '1px solid rgba(127,243,255,0.3)' }}>
        {items.map(([label, value]) => (
          <div key={label} className="text-center">
            <div className="text-[11px] tracking-[0.25em] text-white/60">{label}</div>
            <div className="text-2xl font-black" style={{ color: COLORS.hud }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 主元件（平台合約：DesktopGameProps，default export）
// ==========================================
export default function SkyFighter({ inputRef, paused, callbacks }: DesktopGameProps) {
  const [game] = useState(createGameState);
  const [status, setStatus] = useState<GameStatus>('READY');
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const hudRootRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef(callbacks);
  const pausedRef = useRef(paused);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // 掛載時回報初始狀態
  useEffect(() => {
    callbacksRef.current.onStatusChange('READY');
    callbacksRef.current.onScoreChange(0);
  }, []);

  const handleStatus = useCallback((next: GameStatus) => {
    setStatus(next);
    if (next === 'READY') setDebrief(null);
    callbacksRef.current.onStatusChange(next);
  }, []);

  const handleScore = useCallback((score: number) => {
    callbacksRef.current.onScoreChange(score);
  }, []);

  return (
    <div
      className="relative w-full h-screen overflow-hidden select-none"
      // 平台裡是全螢幕；/dev 試玩頁的容器比較矮，用 maxHeight 貼齊容器
      style={{ maxHeight: '100%', background: COLORS.skyHorizon }}
    >
      <Canvas
        camera={{ position: [0, 95, 16], fov: VIEW.FOV_BASE, near: 0.1, far: 2600 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <GameDriver
          game={game}
          inputRef={inputRef}
          pausedRef={pausedRef}
          hudRootRef={hudRootRef}
          onStatus={handleStatus}
          onScore={handleScore}
          onGameOver={setDebrief}
        />
        <SkyScene game={game} />
      </Canvas>

      <Hud rootRef={hudRootRef} visible={status === 'PLAYING' || status === 'PAUSED'} />
      {status === 'READY' && <TitleCard />}
      {status === 'GAME_OVER' && debrief && <DebriefStrip data={debrief} />}
    </div>
  );
}
