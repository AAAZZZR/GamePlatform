// hooks/usePlayerLink.ts — 手機控制器頁面用：同一個房號只建一條連線（singleton）
import { useCallback, useSyncExternalStore } from 'react';
import { PlayerLink, type PlayerLinkState } from '@/lib/peer/playerLink';

let playerLink: PlayerLink | null = null;

function getPlayerLink(roomId: string): PlayerLink {
  if (playerLink?.roomId !== roomId) {
    playerLink?.close();
    playerLink = new PlayerLink(roomId);
  }
  return playerLink;
}

function getServerSnapshot(): PlayerLinkState | null {
  return null;
}

export function usePlayerLink(roomId: string | null): { link: PlayerLink | null; state: PlayerLinkState | null } {
  const subscribe = useCallback(
    (onChange: () => void) => (roomId ? getPlayerLink(roomId).subscribe(onChange) : () => {}),
    [roomId],
  );
  const getSnapshot = useCallback(() => (roomId ? getPlayerLink(roomId).getSnapshot() : null), [roomId]);
  const state = useSyncExternalStore<PlayerLinkState | null>(subscribe, getSnapshot, getServerSnapshot);
  return { link: roomId && state ? getPlayerLink(roomId) : null, state };
}
