// hooks/useHostLink.ts — 電腦端頁面用：整個分頁只有一個房間（singleton），分頁關掉房間就沒了
import { useSyncExternalStore } from 'react';
import { HostLink, type HostSnapshot } from '@/lib/peer/hostLink';

let hostLink: HostLink | null = null;

function getHostLink(): HostLink {
  if (!hostLink) hostLink = new HostLink();
  return hostLink;
}

function subscribe(onChange: () => void): () => void {
  return getHostLink().subscribe(onChange);
}

function getSnapshot(): HostSnapshot {
  return getHostLink().getSnapshot();
}

// 靜態輸出時在 build 階段 render，沒有房間
function getServerSnapshot(): HostSnapshot | null {
  return null;
}

export function useHostLink(): { link: HostLink | null; snapshot: HostSnapshot | null } {
  const snapshot = useSyncExternalStore<HostSnapshot | null>(subscribe, getSnapshot, getServerSnapshot);
  return { link: snapshot ? getHostLink() : null, snapshot };
}
