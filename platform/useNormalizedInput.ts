// platform/useNormalizedInput.ts — 把手機送來的陀螺儀 + 按鈕轉成 NormalizedInput（存在 ref，遊戲每幀自己讀）
import React, { useEffect, useMemo, useRef } from 'react';
import type { HostLink } from '@/lib/peer/hostLink';
import type { GameSettings, PlayerNumber } from '@/types/game';
import { NormalizedInput } from './types';
import { applyAction, emptyInput, gyroToMove } from './input';

/** 單人：不管哪支手機送的都算 P1 */
export function useNormalizedInput(link: HostLink | null, settings: GameSettings) {
  const inputRef = useRef<NormalizedInput>(emptyInput());
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!link) return;
    return link.onMessage(message => {
      if (message.type === 'gyro') {
        inputRef.current.move = gyroToMove(message.beta, message.gamma, settingsRef.current);
      } else if (message.type === 'action') {
        applyAction(inputRef.current, message.action);
      }
    });
  }, [link]);

  return inputRef;
}

/** 多人：依玩家編號分到兩個 ref */
export function useMultiplayerInput(
  link: HostLink | null,
  settings: GameSettings,
): Map<PlayerNumber, React.MutableRefObject<NormalizedInput>> {
  const p1Ref = useRef<NormalizedInput>(emptyInput());
  const p2Ref = useRef<NormalizedInput>(emptyInput());
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!link) return;
    return link.onMessage((message, playerNumber) => {
      const ref = playerNumber === 2 ? p2Ref : p1Ref;
      if (message.type === 'gyro') {
        ref.current.move = gyroToMove(message.beta, message.gamma, settingsRef.current);
      } else if (message.type === 'action') {
        applyAction(ref.current, message.action);
      }
    });
  }, [link]);

  return useMemo(
    () =>
      new Map<PlayerNumber, React.MutableRefObject<NormalizedInput>>([
        [1, p1Ref],
        [2, p2Ref],
      ]),
    [],
  );
}
