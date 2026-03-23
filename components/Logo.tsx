// components/Logo.tsx — GyroArcade Logo
import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  animate?: boolean;
}

export default function Logo({ size = 64, className = '', animate = true }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Main gradient: cyan → blue → violet */}
        <linearGradient id="logo-grad-main" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>

        {/* Secondary gradient for inner ring */}
        <linearGradient id="logo-grad-inner" x1="120" y1="0" x2="0" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>

        {/* Glow filter */}
        <filter id="logo-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer gyroscope ring 1 — horizontal */}
      <ellipse
        cx="60" cy="60" rx="50" ry="20"
        stroke="url(#logo-grad-main)"
        strokeWidth="3"
        opacity="0.7"
        filter="url(#logo-glow)"
      >
        {animate && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="0 60 60;360 60 60"
            dur="12s"
            repeatCount="indefinite"
          />
        )}
      </ellipse>

      {/* Outer gyroscope ring 2 — tilted 60° */}
      <ellipse
        cx="60" cy="60" rx="50" ry="20"
        stroke="url(#logo-grad-inner)"
        strokeWidth="3"
        opacity="0.6"
        transform="rotate(60 60 60)"
        filter="url(#logo-glow)"
      >
        {animate && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="60 60 60;420 60 60"
            dur="16s"
            repeatCount="indefinite"
          />
        )}
      </ellipse>

      {/* Outer gyroscope ring 3 — tilted 120° */}
      <ellipse
        cx="60" cy="60" rx="50" ry="20"
        stroke="url(#logo-grad-main)"
        strokeWidth="2.5"
        opacity="0.5"
        transform="rotate(120 60 60)"
        filter="url(#logo-glow)"
      >
        {animate && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="120 60 60;480 60 60"
            dur="20s"
            repeatCount="indefinite"
          />
        )}
      </ellipse>

      {/* Center play-arrow (pointing up-right, symbolizing direction control) */}
      <g filter="url(#logo-glow)">
        <polygon
          points="50,38 78,60 50,82"
          fill="url(#logo-grad-main)"
          opacity="0.95"
        />
        {/* Arrow inner highlight */}
        <polygon
          points="54,44 72,60 54,76"
          fill="white"
          opacity="0.25"
        />
      </g>

      {/* Center dot (axis point) */}
      <circle
        cx="60" cy="60" r="4"
        fill="white"
        opacity="0.9"
      >
        {animate && (
          <animate
            attributeName="opacity"
            values="0.9;0.4;0.9"
            dur="2s"
            repeatCount="indefinite"
          />
        )}
      </circle>
    </svg>
  );
}
