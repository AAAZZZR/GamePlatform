// components/GameStatusBar.tsx
import React from 'react';

export default function GameStatusBar() {
  return (
    <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none select-none">
      {/* 這裡未來可以放血量、分數、Buff 狀態 */}
      <div className="text-white/50 text-xs font-mono border border-white/20 p-2 rounded bg-black/40 backdrop-blur-sm">
        STATUS_BAR_COMPONENT (PlaceHolder)
      </div>
    </div>
  );
}