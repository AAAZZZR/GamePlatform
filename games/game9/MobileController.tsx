// games/game9/MobileController.tsx — Sky Fighter 手機控制器（橫拿）
// 左手：油門（上）／煞車（下）；右手：大顆 FIRE。左上角留給平台的設定齒輪。
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { MobileControllerProps } from '@/platform/types';

type HoldAction = 'fire' | 'throttle' | 'brake';

const HOLD_ACTIONS: HoldAction[] = ['fire', 'throttle', 'brake'];

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(pattern);
}

/** 管理按住型按鈕：多指同時按、手指滑出按鈕、切到背景都不會卡住 */
function useHoldButtons(sendAction: (action: string) => void) {
  const [held, setHeld] = useState<Record<HoldAction, boolean>>({ fire: false, throttle: false, brake: false });
  const heldRef = useRef<Record<HoldAction, boolean>>({ fire: false, throttle: false, brake: false });
  const sendRef = useRef(sendAction);
  const fireRumbleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    sendRef.current = sendAction;
  }, [sendAction]);

  const stopRumble = useCallback(() => {
    if (fireRumbleRef.current !== null) {
      clearInterval(fireRumbleRef.current);
      fireRumbleRef.current = null;
    }
  }, []);

  const setHold = useCallback((action: HoldAction, on: boolean) => {
    if (heldRef.current[action] === on) return;
    heldRef.current = { ...heldRef.current, [action]: on };
    setHeld(heldRef.current);
    sendRef.current(`${action}-${on ? 'start' : 'end'}`);

    if (action === 'fire') {
      stopRumble();
      if (on) {
        // 按住開火時持續輕震，像機砲的後座力
        vibrate(25);
        fireRumbleRef.current = setInterval(() => vibrate(12), 110);
      }
    } else if (on) {
      vibrate(action === 'throttle' ? [20, 30, 20] : 30);
    }
  }, [stopRumble]);

  const releaseAll = useCallback(() => {
    for (const action of HOLD_ACTIONS) setHold(action, false);
  }, [setHold]);

  // 切到背景或元件卸載時放開所有按鈕，避免遊戲端一直以為在開火
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') releaseAll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', releaseAll);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', releaseAll);
      releaseAll();
      stopRumble();
    };
  }, [releaseAll, stopRumble]);

  return { held, setHold };
}

interface HoldButtonProps {
  action: HoldAction;
  active: boolean;
  onHold: (action: HoldAction, on: boolean) => void;
  className: string;
  activeClassName: string;
  idleClassName: string;
  glow: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

function HoldButton({ action, active, onHold, className, activeClassName, idleClassName, glow, style, children }: HoldButtonProps) {
  const press = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    // 抓住指標：手指滑出按鈕範圍也算按著，直到放開
    e.currentTarget.setPointerCapture(e.pointerId);
    onHold(action, true);
  };
  const release = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    onHold(action, false);
  };

  return (
    <button
      type="button"
      className={`relative flex flex-col items-center justify-center select-none touch-none transition-transform duration-75 ${className} ${active ? activeClassName : idleClassName}`}
      style={{
        boxShadow: active ? `0 0 40px ${glow}, inset 0 0 30px ${glow}` : `0 0 14px ${glow}`,
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        ...style,
      }}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={() => onHold(action, false)}
      onContextMenu={e => e.preventDefault()}
    >
      {children}
    </button>
  );
}

export default function SkyFighterMobileController({ sendAction }: MobileControllerProps) {
  const { held, setHold } = useHoldButtons(sendAction);

  return (
    <div
      className="w-full h-full relative overflow-hidden bg-slate-900 select-none touch-none flex items-stretch justify-between gap-4 px-4 py-3"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* ── 左：油門／煞車（頂端留空給平台的齒輪按鈕） ── */}
      <div className="flex flex-col justify-end gap-3 pt-20 shrink-0" style={{ width: 'min(34%, 190px)' }}>
        <HoldButton
          action="throttle"
          active={held.throttle}
          onHold={setHold}
          className="flex-1 min-h-[72px] rounded-2xl border-4"
          activeClassName="bg-emerald-500/45 border-emerald-300 scale-[0.97]"
          idleClassName="bg-emerald-500/15 border-emerald-400/50"
          glow="rgba(52,211,153,0.45)"
        >
          <span className={`text-xl font-black tracking-wider ${held.throttle ? 'text-emerald-200' : 'text-emerald-400'}`}>▲ THROTTLE</span>
          <span className="text-white/40 text-[11px] tracking-widest">AFTERBURNER</span>
        </HoldButton>
        <HoldButton
          action="brake"
          active={held.brake}
          onHold={setHold}
          className="flex-1 min-h-[72px] rounded-2xl border-4"
          activeClassName="bg-cyan-500/45 border-cyan-300 scale-[0.97]"
          idleClassName="bg-cyan-500/15 border-cyan-400/50"
          glow="rgba(34,211,238,0.45)"
        >
          <span className={`text-xl font-black tracking-wider ${held.brake ? 'text-cyan-200' : 'text-cyan-400'}`}>▼ BRAKE</span>
          <span className="text-white/40 text-[11px] tracking-widest">TIGHTER TURNS</span>
        </HoldButton>
      </div>

      {/* ── 中：提示 ── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center pointer-events-none min-w-0">
        <p className="text-slate-400 text-xs font-mono tracking-[0.25em]">TILT TO FLY</p>
        <p className="text-slate-600 text-[10px] font-mono tracking-wider">hold fire on a target to lock on</p>
      </div>

      {/* ── 右：開火 ── */}
      <div className="flex items-center justify-center shrink-0" style={{ width: 'min(36%, 230px)' }}>
        <HoldButton
          action="fire"
          active={held.fire}
          onHold={setHold}
          className="rounded-full border-[6px]"
          activeClassName="bg-red-500/50 border-red-300 scale-95"
          idleClassName="bg-red-500/20 border-red-400/60"
          glow="rgba(239,68,68,0.55)"
          style={{ height: 'min(100%, 230px)', aspectRatio: '1 / 1', maxWidth: '100%' }}
        >
          <div className="absolute inset-3 rounded-full border-2 border-white/10 pointer-events-none" />
          <span className={`text-3xl font-black tracking-wider ${held.fire ? 'text-red-100' : 'text-red-400'}`}>FIRE</span>
          <span className="text-white/40 text-xs tracking-widest">HOLD</span>
        </HoldButton>
      </div>
    </div>
  );
}
