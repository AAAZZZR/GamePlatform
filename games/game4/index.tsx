// games/game4/index.tsx — Tunnel Runner (R3F 3D)
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo, MutableRefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { NormalizedInput, GameCallbacks, GameStatus } from '@/platform/types';
import { sfx } from '@/platform/audio';

// ==========================================
// 1. Configuration
// ==========================================
const CFG = {
  // Tunnel
  TUNNEL_HW: 6,       // half-width
  TUNNEL_HH: 4,       // half-height
  RING_SPACING: 12,
  RENDER_DIST: 140,
  CLEANUP_BEHIND: 15,
  // Player
  PLAYER_R: 0.35,
  PLAYER_Z: -8,       // player's Z in scene (ahead of camera)
  // Speed
  BASE_SPEED: 0.25,
  SPEED_RAMP: 0.004,  // per second
  MAX_SPEED: 1.0,
  BOOST_MULT: 1.6,
  BOOST_DURATION: 2000,
  // Gates
  GATE_SPACING_MIN: 18,
  GATE_SPACING_MAX: 28,
  GATE_THICKNESS: 0.4,
  INITIAL_GAP: 5.0,
  MIN_GAP: 2.2,
  GAP_SHRINK: 0.06,   // per gate
  // Orbs
  ORB_SPACING: 10,
  ORB_R: 0.3,
  ORB_SCORE: 100,
  // Scoring
  SCORE_PER_DIST: 2,
};

// Neon colors
const NEON = ['#ff0055', '#ff6600', '#ffcc00', '#00ff88', '#00ccff', '#aa44ff', '#ff44aa'];

// ==========================================
// 2. Types
// ==========================================
interface Gate {
  id: number;
  z: number;
  gapX: number;
  gapY: number;
  gapW: number;
  gapH: number;
  color: string;
}

interface Orb {
  id: number;
  z: number;
  x: number;
  y: number;
  collected: boolean;
}

interface GameState {
  px: number;
  py: number;
  distance: number;
  speed: number;
  gates: Gate[];
  orbs: Orb[];
  status: GameStatus;
  score: number;
  startTime: number;
  nextGateZ: number;
  nextOrbZ: number;
  gateCount: number;
  boostUntil: number;
}

// ==========================================
// 3. Helpers
// ==========================================
let _id = 0;
function nid() { return ++_id; }

function makeGate(z: number, count: number): Gate {
  const gapW = Math.max(CFG.MIN_GAP, CFG.INITIAL_GAP - count * CFG.GAP_SHRINK);
  const gapH = Math.max(CFG.MIN_GAP * 0.7, (CFG.INITIAL_GAP * 0.8) - count * CFG.GAP_SHRINK * 0.7);
  const maxOffX = CFG.TUNNEL_HW - gapW / 2 - 0.5;
  const maxOffY = CFG.TUNNEL_HH - gapH / 2 - 0.5;
  return {
    id: nid(),
    z,
    gapX: (Math.random() - 0.5) * 2 * maxOffX,
    gapY: (Math.random() - 0.5) * 2 * maxOffY,
    gapW,
    gapH,
    color: NEON[Math.floor(Math.random() * NEON.length)],
  };
}

function makeOrb(z: number): Orb {
  return {
    id: nid(),
    z,
    x: (Math.random() - 0.5) * (CFG.TUNNEL_HW * 2 - 2),
    y: (Math.random() - 0.5) * (CFG.TUNNEL_HH * 2 - 2),
    collected: false,
  };
}

// ==========================================
// 4. Game Logic Hook
// ==========================================
function useGameLogic(
  inputRef: MutableRefObject<NormalizedInput>,
  paused: boolean,
  callbacks: GameCallbacks,
) {
  const getInitialState = useCallback((): GameState => {
    _id = 0;
    const gates: Gate[] = [];
    const orbs: Orb[] = [];
    let gz = 40;
    for (let i = 0; i < 8; i++) {
      gates.push(makeGate(gz, i));
      gz += CFG.GATE_SPACING_MIN + Math.random() * (CFG.GATE_SPACING_MAX - CFG.GATE_SPACING_MIN);
    }
    let oz = 20;
    for (let i = 0; i < 10; i++) {
      orbs.push(makeOrb(oz));
      oz += CFG.ORB_SPACING + Math.random() * 5;
    }
    return {
      px: 0, py: 0, distance: 0, speed: CFG.BASE_SPEED,
      gates, orbs,
      status: 'READY', score: 0, startTime: 0,
      nextGateZ: gz, nextOrbZ: oz, gateCount: 8,
      boostUntil: 0,
    };
  }, []);

  const [gs, setGs] = useState<GameState>(getInitialState);
  const stateRef = useRef(gs);
  stateRef.current = gs;
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => { cbRef.current.onScoreChange(gs.score); }, [gs.score]);
  useEffect(() => { cbRef.current.onStatusChange(gs.status); }, [gs.status]);

  useEffect(() => {
    let loopId: number;
    let prevT = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - prevT) / 16.667, 3);
      prevT = now;
      const input = inputRef.current;
      const s = stateRef.current;

      // Lifecycle
      if (s.status === 'READY' && input.actions['start-game']) {
        setGs(prev => ({ ...prev, status: 'PLAYING', startTime: Date.now() }));
        sfx.start();
      }
      if (input.actions['restart-game']) {
        setGs(getInitialState());
      }

      if (s.status === 'PLAYING' && !paused) {
        const nowMs = Date.now();
        const elapsed = (nowMs - s.startTime) / 1000;
        const isBoosting = nowMs < s.boostUntil;
        const speed = Math.min(CFG.MAX_SPEED, CFG.BASE_SPEED + elapsed * CFG.SPEED_RAMP)
          * (isBoosting ? CFG.BOOST_MULT : 1);

        // Player movement (negate Y: tilt forward = input.move.y>0 → move DOWN in 3D = -Y)
        let px = s.px + input.move.x * dt * 0.12;
        let py = s.py - input.move.y * dt * 0.12;
        const margin = CFG.PLAYER_R + 0.2;
        px = Math.max(-CFG.TUNNEL_HW + margin, Math.min(CFG.TUNNEL_HW - margin, px));
        py = Math.max(-CFG.TUNNEL_HH + margin, Math.min(CFG.TUNNEL_HH - margin, py));

        // Advance distance
        const distance = s.distance + speed * dt;
        let score = s.score + Math.floor(speed * dt * CFG.SCORE_PER_DIST);

        // Gate collision
        let gameOver = false;
        for (const g of s.gates) {
          const relZ = g.z - distance;
          if (relZ > -0.5 && relZ < 0.5) {
            // Player is passing through this gate
            const inGapX = Math.abs(px - g.gapX) < (g.gapW / 2 - CFG.PLAYER_R);
            const inGapY = Math.abs(py - g.gapY) < (g.gapH / 2 - CFG.PLAYER_R);
            if (!inGapX || !inGapY) {
              gameOver = true;
              sfx.crash();
              break;
            }
          }
        }

        // Orb collection
        const orbs = [...s.orbs];
        for (const o of orbs) {
          if (o.collected) continue;
          const relZ = o.z - distance;
          if (relZ > -1 && relZ < 1) {
            const dx = px - o.x;
            const dy = py - o.y;
            if (Math.sqrt(dx * dx + dy * dy) < CFG.ORB_R + CFG.PLAYER_R) {
              o.collected = true;
              score += CFG.ORB_SCORE;
              sfx.coin();
            }
          }
        }

        // Boost action
        let boostUntil = s.boostUntil;
        if (input.actions['boost'] && nowMs >= s.boostUntil) {
          boostUntil = nowMs + CFG.BOOST_DURATION;
        }

        // Generate new gates ahead
        let gates = s.gates.filter(g => g.z > distance - CFG.CLEANUP_BEHIND);
        let nextGateZ = s.nextGateZ;
        let gateCount = s.gateCount;
        while (nextGateZ < distance + CFG.RENDER_DIST) {
          gates.push(makeGate(nextGateZ, gateCount));
          gateCount++;
          nextGateZ += CFG.GATE_SPACING_MIN + Math.random() * (CFG.GATE_SPACING_MAX - CFG.GATE_SPACING_MIN);
        }

        // Generate new orbs
        let filteredOrbs = orbs.filter(o => !o.collected && o.z > distance - CFG.CLEANUP_BEHIND);
        let nextOrbZ = s.nextOrbZ;
        while (nextOrbZ < distance + CFG.RENDER_DIST) {
          filteredOrbs.push(makeOrb(nextOrbZ));
          nextOrbZ += CFG.ORB_SPACING + Math.random() * 5;
        }

        setGs({
          px, py, distance, speed,
          gates, orbs: filteredOrbs,
          status: gameOver ? 'GAME_OVER' : 'PLAYING',
          score, startTime: s.startTime,
          nextGateZ, nextOrbZ, gateCount,
          boostUntil,
        });
      }

      loopId = requestAnimationFrame(loop);
    };

    loopId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(loopId);
  }, [paused, inputRef, getInitialState]);

  return gs;
}

// ==========================================
// 5. R3F Components
// ==========================================

// Tunnel ring — rectangular wireframe
function TunnelRing({ z }: { z: number }) {
  const hw = CFG.TUNNEL_HW;
  const hh = CFG.TUNNEL_HH;
  const points = useMemo<[number, number, number][]>(() => [
    [-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0], [-hw, -hh, 0],
  ], [hw, hh]);

  return (
    <group position={[0, 0, z]}>
      <Line points={points} color="#0a4466" lineWidth={1} />
    </group>
  );
}

// Gate obstacle — 4 sections around the gap
function GateMesh({ gate, relZ }: { gate: Gate; relZ: number }) {
  const hw = CFG.TUNNEL_HW;
  const hh = CFG.TUNNEL_HH;
  const { gapX, gapY, gapW, gapH, color } = gate;
  const t = CFG.GATE_THICKNESS;
  const gl = gapX - gapW / 2;
  const gr = gapX + gapW / 2;
  const gb = gapY - gapH / 2;
  const gt = gapY + gapH / 2;

  // Build wall sections around the gap
  const sections: { cx: number; cy: number; w: number; h: number }[] = [];

  // Left wall
  if (gl > -hw + 0.1) sections.push({ cx: (-hw + gl) / 2, cy: 0, w: gl + hw, h: hh * 2 });
  // Right wall
  if (gr < hw - 0.1) sections.push({ cx: (gr + hw) / 2, cy: 0, w: hw - gr, h: hh * 2 });
  // Top (between left/right gap edges)
  if (gt < hh - 0.1) {
    const sx = Math.max(gl, -hw);
    const ex = Math.min(gr, hw);
    if (ex > sx) sections.push({ cx: (sx + ex) / 2, cy: (gt + hh) / 2, w: ex - sx, h: hh - gt });
  }
  // Bottom
  if (gb > -hh + 0.1) {
    const sx = Math.max(gl, -hw);
    const ex = Math.min(gr, hw);
    if (ex > sx) sections.push({ cx: (sx + ex) / 2, cy: (-hh + gb) / 2, w: ex - sx, h: gb + hh });
  }

  // Gap edge lines (bright outline of the opening)
  const edgePoints = useMemo<[number, number, number][]>(() => [
    [gl, gb, 0], [gr, gb, 0], [gr, gt, 0], [gl, gt, 0], [gl, gb, 0],
  ], [gl, gr, gb, gt]);

  return (
    <group position={[0, 0, relZ]}>
      {sections.map((s, i) => (
        <mesh key={i} position={[s.cx, s.cy, 0]}>
          <boxGeometry args={[s.w, s.h, t]} />
          <meshBasicMaterial color={color} transparent opacity={0.35} />
        </mesh>
      ))}
      {/* Bright gap outline */}
      <Line points={edgePoints} color="#00ff88" lineWidth={2} />
    </group>
  );
}

// Collectible orb
function OrbMesh({ orb, relZ, time }: { orb: Orb; relZ: number; time: number }) {
  const pulse = 1 + Math.sin(time * 4 + orb.id) * 0.2;
  return (
    <mesh position={[orb.x, orb.y, relZ]} scale={pulse}>
      <octahedronGeometry args={[CFG.ORB_R, 0]} />
      <meshBasicMaterial color="#ffcc00" wireframe />
    </mesh>
  );
}

// Player ship (simple arrow/wedge)
function PlayerMesh({ x, y, boosting }: { x: number; y: number; boosting: boolean }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.4);
    s.lineTo(0.3, -0.3);
    s.lineTo(0, -0.15);
    s.lineTo(-0.3, -0.3);
    s.closePath();
    return s;
  }, []);

  return (
    <group position={[x, y, CFG.PLAYER_Z]}>
      {/* Glow ring */}
      <mesh>
        <ringGeometry args={[0.5, 0.55, 32]} />
        <meshBasicMaterial color={boosting ? '#ff6600' : '#00ccff'} transparent opacity={0.3} />
      </mesh>
      {/* Ship body */}
      <mesh rotation={[0, 0, 0]}>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial color={boosting ? '#ffaa00' : '#00eeff'} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// Floor grid for speed perception
function FloorGrid({ distance }: { distance: number }) {
  const lines = useMemo(() => {
    const geos: { z: number }[] = [];
    for (let i = 0; i < 15; i++) {
      geos.push({ z: -i * 10 });
    }
    return geos;
  }, []);

  const offset = -(distance % 10);

  return (
    <group position={[0, -CFG.TUNNEL_HH, offset]}>
      {lines.map((l, i) => (
        <mesh key={i} position={[0, 0, l.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[CFG.TUNNEL_HW * 2, 0.06]} />
          <meshBasicMaterial color="#0a3344" transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

// ==========================================
// 6. Scene (inner Canvas content)
// ==========================================
function Scene({ gs, inputRef }: { gs: GameState; inputRef: MutableRefObject<NormalizedInput> }) {
  const { distance, gates, orbs, px, py, status, boostUntil } = gs;
  const nowMs = Date.now();
  const time = nowMs / 1000;
  const isBoosting = nowMs < boostUntil;

  // Generate ring Z positions
  const ringStart = Math.floor(distance / CFG.RING_SPACING) * CFG.RING_SPACING;
  const rings: number[] = [];
  for (let z = ringStart; z < distance + CFG.RENDER_DIST; z += CFG.RING_SPACING) {
    rings.push(z);
  }

  return (
    <>
      <fog attach="fog" args={['#050510', 40, CFG.RENDER_DIST - 20]} />
      <color attach="background" args={['#050510']} />

      {/* Floor grid */}
      <FloorGrid distance={distance} />

      {/* Tunnel rings */}
      {rings.map(rz => {
        const relZ = -(rz - distance);
        return <TunnelRing key={`r${rz}`} z={relZ} />;
      })}

      {/* Gates */}
      {gates.map(g => {
        const relZ = -(g.z - distance);
        if (relZ < -CFG.RENDER_DIST || relZ > CFG.CLEANUP_BEHIND) return null;
        return <GateMesh key={g.id} gate={g} relZ={relZ} />;
      })}

      {/* Orbs */}
      {orbs.map(o => {
        if (o.collected) return null;
        const relZ = -(o.z - distance);
        if (relZ < -CFG.RENDER_DIST || relZ > CFG.CLEANUP_BEHIND) return null;
        return <OrbMesh key={o.id} orb={o} relZ={relZ} time={time} />;
      })}

      {/* Player */}
      {status !== 'READY' && (
        <PlayerMesh x={px} y={py} boosting={isBoosting} />
      )}
    </>
  );
}

// ==========================================
// 7. Main Component
// ==========================================
interface Props {
  inputRef: MutableRefObject<NormalizedInput>;
  paused: boolean;
  callbacks: GameCallbacks;
  [key: string]: any;
}

export default function Game4({ inputRef, paused, callbacks }: Props) {
  const gs = useGameLogic(inputRef, paused, callbacks);
  const { status, score, speed, distance, boostUntil } = gs;
  const isBoosting = Date.now() < boostUntil;

  return (
    <div className="relative w-full h-screen overflow-hidden select-none" style={{ background: '#050510' }}>
      {/* R3F Canvas */}
      <Canvas
        camera={{ position: [0, 0, 5], fov: 75, near: 0.1, far: 200 }}
        gl={{ antialias: false, alpha: false }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Scene gs={gs} inputRef={inputRef} />
      </Canvas>

      {/* HUD: Score */}
      {status === 'PLAYING' && (
        <>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-2xl font-black tracking-[0.3em] text-white/80 font-mono"
            style={{ textShadow: '0 0 20px rgba(0,204,255,0.5)' }}>
            {score.toString().padStart(7, '0')}
          </div>
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 text-xs font-bold text-cyan-400/60 font-mono">
            {Math.floor(speed * 1000)} km/h
          </div>
          {isBoosting && (
            <div className="absolute top-4 right-4 z-10 text-xs font-bold text-orange-400 bg-orange-900/30 px-3 py-1 rounded-full border border-orange-500/30 animate-pulse">
              BOOST
            </div>
          )}
        </>
      )}

      {/* READY overlay */}
      {status === 'READY' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4">
          <div className="text-5xl font-black tracking-wider"
            style={{
              color: '#00eeff',
              textShadow: '0 0 30px rgba(0,238,255,0.6), 0 0 60px rgba(0,238,255,0.3)',
            }}>
            TUNNEL RUNNER
          </div>
          <div className="text-white/30 text-sm tracking-widest animate-pulse font-mono">
            TILT TO DODGE · FLY THROUGH THE GATES
          </div>
          <div className="flex gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-sm" style={{ background: 'rgba(255,0,85,0.5)', border: '1px solid #ff0055' }} />
              <span className="text-white/40 text-xs">WALL</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-sm border border-green-400" style={{ background: 'transparent' }} />
              <span className="text-white/40 text-xs">GAP</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rotate-45" style={{ background: '#ffcc00' }} />
              <span className="text-white/40 text-xs">ORB</span>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER overlay */}
      {status === 'GAME_OVER' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/60">
          <div className="text-4xl font-black text-red-500 tracking-wider"
            style={{ textShadow: '0 0 30px rgba(239,68,68,0.5)' }}>
            CRASH
          </div>
          <div className="text-xs text-white/40 font-mono">DISTANCE: {Math.floor(distance)}m</div>
          <div className="text-2xl font-bold text-white/80 tracking-widest font-mono">
            {score.toString().padStart(7, '0')}
          </div>
          <div className="text-white/30 text-xs tracking-widest mt-2 animate-pulse">
            TAP RESTART ON CONTROLLER
          </div>
        </div>
      )}
    </div>
  );
}
