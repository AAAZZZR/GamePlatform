// components/Logo.tsx — GyroPlay Logo
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
        <linearGradient id="gp-ring1" x1="10" y1="10" x2="110" y2="110" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id="gp-ring2" x1="110" y1="10" x2="10" y2="110" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id="gp-play" x1="48" y1="35" x2="82" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <filter id="gp-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="gp-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#0ea5e9" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Outer circle border */}
      <circle cx="60" cy="60" r="56" stroke="url(#gp-ring1)" strokeWidth="2" opacity="0.25" />

      {/* Gyroscope ring 1 — horizontal orbit */}
      <ellipse
        cx="60" cy="60" rx="44" ry="16"
        stroke="url(#gp-ring1)" strokeWidth="2.5" strokeLinecap="round"
        opacity="0.8" filter="url(#gp-glow)"
      >
        {animate && (
          <animateTransform attributeName="transform" type="rotate"
            values="0 60 60;360 60 60" dur="10s" repeatCount="indefinite" />
        )}
      </ellipse>

      {/* Gyroscope ring 2 — tilted 70° */}
      <ellipse
        cx="60" cy="60" rx="44" ry="16"
        stroke="url(#gp-ring2)" strokeWidth="2.5" strokeLinecap="round"
        opacity="0.65" transform="rotate(70 60 60)" filter="url(#gp-glow)"
      >
        {animate && (
          <animateTransform attributeName="transform" type="rotate"
            values="70 60 60;430 60 60" dur="14s" repeatCount="indefinite" />
        )}
      </ellipse>

      {/* Play triangle — centered, clean */}
      <g filter="url(#gp-shadow)">
        <polygon points="49,38 80,60 49,82" fill="url(#gp-play)" />
        <polygon points="53,43 74,60 53,77" fill="white" opacity="0.2" />
      </g>

      {/* Center axis dot */}
      <circle cx="60" cy="60" r="3" fill="white" opacity="0.9">
        {animate && (
          <animate attributeName="opacity" values="0.9;0.5;0.9" dur="2.5s" repeatCount="indefinite" />
        )}
      </circle>

      {/* Tiny orbit dots on rings */}
      <circle cx="60" cy="60" r="2" fill="#22d3ee" opacity="0.8">
        {animate && (
          <animateMotion dur="10s" repeatCount="indefinite"
            path="M44,0 A44,16 0 1,1 -44,0 A44,16 0 1,1 44,0" />
        )}
      </circle>
    </svg>
  );
}
