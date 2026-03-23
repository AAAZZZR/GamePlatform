// components/TiltBall.tsx — Gyro tilt indicator ball
'use client';
import React from 'react';

interface Props {
  tiltX: number; // -1 to 1
  tiltY: number; // -1 to 1
  size?: number; // ball diameter in px
  range?: number; // max travel distance in px
}

export default function TiltBall({ tiltX, tiltY, size = 28, range = 80 }: Props) {
  const dx = tiltX * range;
  const dy = tiltY * range;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Arena circle */}
      <div
        className="relative rounded-full border border-white/10"
        style={{
          width: range * 2 + size,
          height: range * 2 + size,
          background: 'radial-gradient(circle, rgba(6,182,212,0.06), transparent 70%)',
        }}
      >
        {/* Crosshair lines */}
        <div className="absolute top-1/2 left-4 right-4 h-px bg-white/5" />
        <div className="absolute left-1/2 top-4 bottom-4 w-px bg-white/5" />

        {/* Glowing ball */}
        <div
          className="absolute rounded-full"
          style={{
            width: size,
            height: size,
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`,
            background: 'radial-gradient(circle, #67e8f9, #0891b2)',
            boxShadow: '0 0 16px rgba(103,232,249,0.7), 0 0 40px rgba(103,232,249,0.3)',
            transition: 'transform 0.08s ease-out',
          }}
        />
      </div>
      <span className="text-[10px] text-gray-500 font-mono tracking-wider">TILT PREVIEW</span>
    </div>
  );
}
