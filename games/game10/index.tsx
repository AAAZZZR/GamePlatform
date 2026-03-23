// games/game10/index.tsx — Skeet Shooter (R3F First-Person Clay Pigeon)
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo, MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NormalizedInput, GameCallbacks, GameStatus } from '@/platform/types';
import { sfx } from '@/platform/audio';

// ==========================================
// 1. Configuration
// ==========================================
const CFG = {
  // Camera
  CAM_POS: [0, 8, 0] as const,
  PITCH_MIN: -0.3,
  PITCH_MAX: 1.2,
  LOOK_SMOOTH: 0.15,
  YAW_SENSITIVITY: 1.0,
  PITCH_SENSITIVITY: 1.0,
  // Disc physics
  GRAVITY: -9.8,
  DISC_LIFETIME: 5,
  DISC_GROUND_Y: 0.5,
  DISC_RADIUS: 0.8,
  // Shooting
  CONE_HALF_ANGLE: 4.5 * (Math.PI / 180),
  SHOT_COOLDOWN: 400,
  MAX_SHOTS: 2,
  // Shatter
  FRAGMENT_COUNT: 8,
  FRAGMENT_LIFE: 1.5,
  // Rounds
  LAUNCHES_PER_ROUND: 10,
  PULL_DELAY: 1200,
  ROUND_PAUSE: 3000,
  // Scoring
  HIT_SCORE: 100,
  EARLY_BONUS: 50,
  PERFECT_BONUS: 500,
  EARLY_THRESHOLD: 0.4,
  // Muzzle flash
  MUZZLE_DURATION: 80,
  // Launcher positions
  LAUNCHERS: [
    { x: -15, y: 0, z: -30 },
    { x: 15, y: 0, z: -30 },
    { x: 0, y: 0, z: -35 },
    { x: -20, y: 0, z: -15 },
    { x: 20, y: 0, z: -15 },
  ],
};

// ==========================================
// 2. Types
// ==========================================
interface Vec3 { x: number; y: number; z: number; }

interface DiscState {
  id: number;
  pos: Vec3;
  vel: Vec3;
  launchTime: number;
  alive: boolean;
  hitStatus: 'flying' | 'hit' | 'missed';
}

interface Fragment {
  id: number;
  pos: Vec3;
  vel: Vec3;
  life: number;
  color: string;
}

interface LaunchEntry {
  launchers: number[];
  speeds: number[];
  angles: number[];
  yawAngles: number[];
}

interface RoundState {
  roundNumber: number;
  launchIndex: number;
  schedule: LaunchEntry[];
  discsHit: number;
  discsTotal: number;
  waitingForPull: boolean;
  pullTime: number;
  pauseUntil: number;
}

interface GameState {
  yaw: number;
  pitch: number;
  discs: DiscState[];
  fragments: Fragment[];
  shotsLeft: number;
  lastShotTime: number;
  muzzleFlashUntil: number;
  score: number;
  combo: number;
  totalShots: number;
  totalHits: number;
  round: RoundState;
  status: GameStatus;
  startTime: number;
  discInRange: boolean;
}

// ==========================================
// 3. Helpers
// ==========================================
let _id = 0;
function nid() { return ++_id; }

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function getPhase(roundNumber: number): number {
  if (roundNumber <= 2) return 1;
  if (roundNumber <= 4) return 2;
  if (roundNumber <= 6) return 3;
  if (roundNumber <= 9) return 4;
  return 5;
}

function generateRoundSchedule(roundNumber: number): LaunchEntry[] {
  const phase = getPhase(roundNumber);
  const schedule: LaunchEntry[] = [];

  for (let i = 0; i < CFG.LAUNCHES_PER_ROUND; i++) {
    let entry: LaunchEntry;

    switch (phase) {
      case 1: {
        // Single disc, slow, center launcher, high arc
        entry = {
          launchers: [2],
          speeds: [18 + Math.random() * 4],
          angles: [1.1 + Math.random() * 0.2],
          yawAngles: [(Math.random() - 0.5) * 0.3],
        };
        break;
      }
      case 2: {
        // Single, medium speed, left/right launchers
        const lr = Math.random() > 0.5 ? 0 : 1;
        entry = {
          launchers: [lr],
          speeds: [22 + Math.random() * 5],
          angles: [0.9 + Math.random() * 0.3],
          yawAngles: [lr === 0 ? 0.3 + Math.random() * 0.4 : -(0.3 + Math.random() * 0.4)],
        };
        break;
      }
      case 3: {
        // Mix single + double
        if (i % 3 === 0) {
          // Double
          entry = {
            launchers: [0, 1],
            speeds: [24 + Math.random() * 4, 24 + Math.random() * 4],
            angles: [0.9 + Math.random() * 0.3, 0.9 + Math.random() * 0.3],
            yawAngles: [0.3 + Math.random() * 0.3, -(0.3 + Math.random() * 0.3)],
          };
        } else {
          const idx = Math.floor(Math.random() * 3);
          const yawDir = idx === 0 ? 1 : idx === 1 ? -1 : (Math.random() - 0.5) * 2;
          entry = {
            launchers: [idx],
            speeds: [24 + Math.random() * 5],
            angles: [0.85 + Math.random() * 0.3],
            yawAngles: [yawDir * (0.2 + Math.random() * 0.3)],
          };
        }
        break;
      }
      case 4: {
        // Crossing discs from opposite sides
        if (i % 2 === 0) {
          entry = {
            launchers: [3, 4],
            speeds: [26 + Math.random() * 5, 26 + Math.random() * 5],
            angles: [0.8 + Math.random() * 0.3, 0.8 + Math.random() * 0.3],
            yawAngles: [0.5 + Math.random() * 0.3, -(0.5 + Math.random() * 0.3)],
          };
        } else {
          const idx = Math.floor(Math.random() * 5);
          entry = {
            launchers: [idx],
            speeds: [28 + Math.random() * 5],
            angles: [0.75 + Math.random() * 0.35],
            yawAngles: [(Math.random() - 0.5) * 1.0],
          };
        }
        break;
      }
      default: {
        // Phase 5+: Triple, fast, all launchers
        if (i % 3 === 0) {
          // Triple
          const picks = [0, 1, 2].map(() => Math.floor(Math.random() * 5));
          entry = {
            launchers: picks,
            speeds: picks.map(() => 30 + Math.random() * 8),
            angles: picks.map(() => 0.7 + Math.random() * 0.4),
            yawAngles: picks.map(() => (Math.random() - 0.5) * 1.2),
          };
        } else if (i % 3 === 1) {
          // Double crossing
          entry = {
            launchers: [3, 4],
            speeds: [32 + Math.random() * 6, 32 + Math.random() * 6],
            angles: [0.7 + Math.random() * 0.3, 0.7 + Math.random() * 0.3],
            yawAngles: [0.6 + Math.random() * 0.4, -(0.6 + Math.random() * 0.4)],
          };
        } else {
          const idx = Math.floor(Math.random() * 5);
          entry = {
            launchers: [idx],
            speeds: [34 + Math.random() * 6],
            angles: [0.65 + Math.random() * 0.4],
            yawAngles: [(Math.random() - 0.5) * 1.4],
          };
        }
        break;
      }
    }

    schedule.push(entry);
  }

  return schedule;
}

function launchDiscs(entry: LaunchEntry, nowMs: number): DiscState[] {
  const discs: DiscState[] = [];
  for (let i = 0; i < entry.launchers.length; i++) {
    const launcherIdx = entry.launchers[i];
    const launcher = CFG.LAUNCHERS[launcherIdx];
    const speed = entry.speeds[i];
    const elevAngle = entry.angles[i];
    const yawAngle = entry.yawAngles[i];

    // Direction from launcher toward player area with yaw offset and elevation
    const vx = Math.sin(yawAngle) * Math.cos(elevAngle) * speed;
    const vy = Math.sin(elevAngle) * speed;
    const vz = Math.cos(yawAngle) * Math.cos(elevAngle) * speed;

    discs.push({
      id: nid(),
      pos: { x: launcher.x, y: launcher.y + 1, z: launcher.z },
      vel: { x: vx, y: vy, z: vz },
      launchTime: nowMs,
      alive: true,
      hitStatus: 'flying',
    });
  }
  return discs;
}

function computeForwardVec(yaw: number, pitch: number): Vec3 {
  return {
    x: -Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
}

function angleBetween(fwd: Vec3, dx: number, dy: number, dz: number): number {
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 0.001) return Math.PI;
  const nx = dx / len;
  const ny = dy / len;
  const nz = dz / len;
  const dot = fwd.x * nx + fwd.y * ny + fwd.z * nz;
  return Math.acos(clamp(dot, -1, 1));
}

const FRAG_COLORS = ['#ff6600', '#ff4400', '#ff8800', '#cc3300', '#ffaa00', '#ff5500', '#ee2200', '#ff7722'];

function createFragments(pos: Vec3): Fragment[] {
  const frags: Fragment[] = [];
  for (let i = 0; i < CFG.FRAGMENT_COUNT; i++) {
    frags.push({
      id: nid(),
      pos: { x: pos.x, y: pos.y, z: pos.z },
      vel: {
        x: (Math.random() - 0.5) * 8,
        y: Math.random() * 6 + 2,
        z: (Math.random() - 0.5) * 8,
      },
      life: CFG.FRAGMENT_LIFE,
      color: FRAG_COLORS[i % FRAG_COLORS.length],
    });
  }
  return frags;
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
    const schedule = generateRoundSchedule(1);
    return {
      yaw: 0,
      pitch: 0.3,
      discs: [],
      fragments: [],
      shotsLeft: CFG.MAX_SHOTS,
      lastShotTime: 0,
      muzzleFlashUntil: 0,
      score: 0,
      combo: 0,
      totalShots: 0,
      totalHits: 0,
      round: {
        roundNumber: 1,
        launchIndex: 0,
        schedule,
        discsHit: 0,
        discsTotal: 0,
        waitingForPull: true,
        pullTime: 0,
        pauseUntil: 0,
      },
      status: 'READY' as GameStatus,
      startTime: 0,
      discInRange: false,
    };
  }, []);

  const [gs, setGs] = useState<GameState>(getInitialState);
  const stateRef = useRef(gs);
  stateRef.current = gs;
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  // Refs for R3F components
  const yawRef = useRef(gs.yaw);
  yawRef.current = gs.yaw;
  const pitchRef = useRef(gs.pitch);
  pitchRef.current = gs.pitch;
  const discsRef = useRef(gs.discs);
  discsRef.current = gs.discs;
  const fragmentsRef = useRef(gs.fragments);
  fragmentsRef.current = gs.fragments;
  const muzzleRef = useRef(gs.muzzleFlashUntil);
  muzzleRef.current = gs.muzzleFlashUntil;

  useEffect(() => { cbRef.current.onScoreChange(gs.score); }, [gs.score]);
  useEffect(() => { cbRef.current.onStatusChange(gs.status); }, [gs.status]);

  useEffect(() => {
    let loopId: number;
    let prevT = performance.now();
    const smoothed = { x: 0, y: 0 };
    let prevShoot = false;
    let prevPull = false;

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
        smoothed.x = 0;
        smoothed.y = 0;
        prevShoot = false;
        prevPull = false;
        setGs(getInitialState());
      }

      if (s.status === 'PLAYING' && !paused) {
        const nowMs = Date.now();
        const dtSec = dt * 0.016667;

        // ─── Camera look (gyro) ───
        smoothed.x += (input.move.x - smoothed.x) * CFG.LOOK_SMOOTH;
        smoothed.y += (input.move.y - smoothed.y) * CFG.LOOK_SMOOTH;

        let yaw = s.yaw + smoothed.x * CFG.YAW_SENSITIVITY * 0.03 * dt;
        let pitch = s.pitch + smoothed.y * CFG.PITCH_SENSITIVITY * 0.03 * dt;
        pitch = clamp(pitch, CFG.PITCH_MIN, CFG.PITCH_MAX);

        // ─── Update disc physics ───
        const newDiscs = [...s.discs];
        for (let i = newDiscs.length - 1; i >= 0; i--) {
          const d = newDiscs[i];
          if (!d.alive) continue;

          d.vel.y += CFG.GRAVITY * dtSec;
          d.pos.x += d.vel.x * dtSec;
          d.pos.y += d.vel.y * dtSec;
          d.pos.z += d.vel.z * dtSec;

          const elapsed = (nowMs - d.launchTime) / 1000;
          if (elapsed > CFG.DISC_LIFETIME || d.pos.y < CFG.DISC_GROUND_Y) {
            if (d.hitStatus === 'flying') {
              d.hitStatus = 'missed';
              d.alive = false;
            }
          }
        }

        // ─── Disc in range check (for crosshair color) ───
        const fwd = computeForwardVec(yaw, pitch);
        const camPos = CFG.CAM_POS;
        let discInRange = false;
        for (let i = 0; i < newDiscs.length; i++) {
          const d = newDiscs[i];
          if (!d.alive || d.hitStatus !== 'flying') continue;
          const dx = d.pos.x - camPos[0];
          const dy = d.pos.y - camPos[1];
          const dz = d.pos.z - camPos[2];
          const angle = angleBetween(fwd, dx, dy, dz);
          if (angle < CFG.CONE_HALF_ANGLE) {
            discInRange = true;
            break;
          }
        }

        // ─── Shooting (hitscan + cone) ───
        const shootPressed = !!input.actions['fire'];
        const shootJustPressed = shootPressed && !prevShoot;
        prevShoot = shootPressed;

        let shotsLeft = s.shotsLeft;
        let lastShotTime = s.lastShotTime;
        let muzzleFlashUntil = s.muzzleFlashUntil;
        let score = s.score;
        let combo = s.combo;
        let totalShots = s.totalShots;
        let totalHits = s.totalHits;
        let newFragments = [...s.fragments];

        if (shootJustPressed && shotsLeft > 0 && (nowMs - lastShotTime) >= CFG.SHOT_COOLDOWN) {
          shotsLeft--;
          lastShotTime = nowMs;
          muzzleFlashUntil = nowMs + CFG.MUZZLE_DURATION;
          totalShots++;
          sfx.shoot();

          // Find closest disc in cone
          let bestIdx = -1;
          let bestAngle = Infinity;
          for (let i = 0; i < newDiscs.length; i++) {
            const d = newDiscs[i];
            if (!d.alive || d.hitStatus !== 'flying') continue;
            const dx = d.pos.x - camPos[0];
            const dy = d.pos.y - camPos[1];
            const dz = d.pos.z - camPos[2];
            const angle = angleBetween(fwd, dx, dy, dz);
            if (angle < CFG.CONE_HALF_ANGLE && angle < bestAngle) {
              bestAngle = angle;
              bestIdx = i;
            }
          }

          if (bestIdx >= 0) {
            const hitDisc = newDiscs[bestIdx];
            hitDisc.hitStatus = 'hit';
            hitDisc.alive = false;
            totalHits++;
            combo++;

            // Score
            let pts = CFG.HIT_SCORE;
            const discElapsed = (nowMs - hitDisc.launchTime) / 1000;
            const arcPct = discElapsed / CFG.DISC_LIFETIME;
            if (arcPct < CFG.EARLY_THRESHOLD) {
              pts += CFG.EARLY_BONUS;
            }
            const comboMult = Math.min(combo, 5);
            pts *= comboMult;
            score += pts;

            // Fragments
            newFragments = newFragments.concat(createFragments(hitDisc.pos));

            sfx.explosion();
            if (combo >= 3) sfx.powerup();
          } else {
            // Miss shot (no disc hit)
            combo = 0;
          }
        }

        // ─── Update fragments ───
        for (let i = newFragments.length - 1; i >= 0; i--) {
          const f = newFragments[i];
          f.vel.y += CFG.GRAVITY * dtSec * 0.5;
          f.pos.x += f.vel.x * dtSec;
          f.pos.y += f.vel.y * dtSec;
          f.pos.z += f.vel.z * dtSec;
          f.life -= dtSec;
          if (f.life <= 0) {
            newFragments.splice(i, 1);
          }
        }

        // ─── Round management ───
        const round = { ...s.round };

        // Check if all active discs from current launch are resolved
        const anyFlying = newDiscs.some(d => d.hitStatus === 'flying');

        // Count hits/misses from resolved discs
        let roundHit = 0;
        let roundTotal = 0;
        for (const d of newDiscs) {
          if (d.hitStatus === 'hit') roundHit++;
          if (d.hitStatus !== 'flying') roundTotal++;
        }

        if (round.pauseUntil > 0 && nowMs < round.pauseUntil) {
          // In round transition pause
        } else if (round.pauseUntil > 0 && nowMs >= round.pauseUntil) {
          // Start new round
          const newRound = round.roundNumber + 1;
          round.roundNumber = newRound;
          round.launchIndex = 0;
          round.schedule = generateRoundSchedule(newRound);
          round.discsHit = 0;
          round.discsTotal = 0;
          round.waitingForPull = true;
          round.pullTime = 0;
          round.pauseUntil = 0;
          newDiscs.length = 0;
          shotsLeft = CFG.MAX_SHOTS;
        } else if (round.pullTime > 0 && nowMs >= round.pullTime) {
          // Time to launch!
          const entry = round.schedule[round.launchIndex];
          if (entry) {
            const launched = launchDiscs(entry, nowMs);
            newDiscs.push(...launched);
            round.pullTime = 0;
            shotsLeft = CFG.MAX_SHOTS;
          }
        } else if (!anyFlying && round.pullTime === 0 && round.pauseUntil === 0) {
          // All discs resolved, check if we need to advance
          if (newDiscs.length > 0) {
            // Accumulate round stats from resolved discs
            round.discsHit += roundHit;
            round.discsTotal += roundTotal;
            newDiscs.length = 0;

            // Play miss sound for any disc missed this launch
            const missedThisLaunch = roundTotal - roundHit;
            if (missedThisLaunch > 0 && combo === 0) {
              sfx.crash();
            }

            round.launchIndex++;
            if (round.launchIndex >= CFG.LAUNCHES_PER_ROUND) {
              // Round complete
              // Perfect round bonus
              if (round.discsHit === round.discsTotal && round.discsTotal > 0) {
                score += CFG.PERFECT_BONUS;
                sfx.powerup();
              }
              round.pauseUntil = nowMs + CFG.ROUND_PAUSE;
            } else {
              round.waitingForPull = true;
              shotsLeft = CFG.MAX_SHOTS;
            }
          } else if (round.waitingForPull) {
            // Waiting for the player to pull
            const pullPressed = !!input.actions['pull'];
            const pullJustPressed = pullPressed && !prevPull;
            prevPull = pullPressed;

            if (pullJustPressed) {
              round.waitingForPull = false;
              round.pullTime = nowMs + CFG.PULL_DELAY;
              sfx.coin();
              shotsLeft = CFG.MAX_SHOTS;
            }
          }
        }

        // Update pull tracking outside the pull block
        if (!round.waitingForPull) {
          prevPull = !!input.actions['pull'];
        }

        setGs(prev => ({
          ...prev,
          yaw,
          pitch,
          discs: newDiscs,
          fragments: newFragments,
          shotsLeft,
          lastShotTime,
          muzzleFlashUntil,
          score,
          combo,
          totalShots,
          totalHits,
          round,
          discInRange,
        }));
      }

      loopId = requestAnimationFrame(loop);
    };

    loopId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(loopId);
  }, [paused, inputRef, getInitialState]);

  return { gs, yawRef, pitchRef, discsRef, fragmentsRef, muzzleRef };
}

// ==========================================
// 5. R3F Scene Components
// ==========================================

// ─── Camera Controller ───
function CameraController({
  yawRef,
  pitchRef,
}: {
  yawRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
}) {
  const euler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), []);

  useFrame(({ camera }) => {
    euler.set(pitchRef.current, yawRef.current, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
    camera.position.set(CFG.CAM_POS[0], CFG.CAM_POS[1], CFG.CAM_POS[2]);
  });

  return null;
}

// ─── Environment ───
function Environment() {
  const mountainPositions = useMemo(() => [
    { x: -80, z: -120, scale: 1.2 },
    { x: 40, z: -140, scale: 1.5 },
    { x: 120, z: -100, scale: 1.0 },
    { x: -120, z: -80, scale: 0.9 },
    { x: 100, z: -130, scale: 1.3 },
  ], []);

  const treePositions = useMemo(() => {
    const trees: { x: number; z: number; s: number; h: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
      const r = 25 + Math.random() * 35;
      trees.push({
        x: Math.cos(angle) * r,
        z: Math.sin(angle) * r - 10,
        s: 0.6 + Math.random() * 0.6,
        h: 3 + Math.random() * 3,
      });
    }
    return trees;
  }, []);

  return (
    <>
      {/* Sky dome */}
      <mesh>
        <sphereGeometry args={[300, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color="#87CEEB" side={THREE.BackSide} />
      </mesh>

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#4a7c3f" />
      </mesh>

      {/* Mountains */}
      {mountainPositions.map((m, i) => (
        <mesh key={`mt${i}`} position={[m.x, 15 * m.scale, m.z]}>
          <coneGeometry args={[30 * m.scale, 30 * m.scale, 6]} />
          <meshStandardMaterial color="#5a7247" flatShading />
        </mesh>
      ))}

      {/* Trees */}
      {treePositions.map((t, i) => (
        <group key={`tree${i}`} position={[t.x, 0, t.z]}>
          {/* Trunk */}
          <mesh position={[0, t.h * 0.4, 0]}>
            <cylinderGeometry args={[0.2 * t.s, 0.3 * t.s, t.h * 0.8, 6]} />
            <meshStandardMaterial color="#6b4226" />
          </mesh>
          {/* Foliage */}
          <mesh position={[0, t.h * 0.85, 0]}>
            <coneGeometry args={[1.5 * t.s, t.h * 0.7, 8]} />
            <meshStandardMaterial color="#2d5a1e" />
          </mesh>
        </group>
      ))}

      {/* Launcher boxes */}
      {CFG.LAUNCHERS.map((l, i) => (
        <mesh key={`launcher${i}`} position={[l.x, 0.5, l.z]}>
          <boxGeometry args={[1.5, 1, 1.5]} />
          <meshStandardMaterial color="#555555" />
        </mesh>
      ))}

      {/* Lighting */}
      <hemisphereLight args={['#b1e1ff', '#4a7c3f', 0.4]} />
      <directionalLight position={[100, 200, 50]} intensity={0.8} color="#ffeedd" />
    </>
  );
}

// ─── Disc Meshes (pre-allocated pool) ───
function DiscMeshes({ discsRef }: { discsRef: MutableRefObject<DiscState[]> }) {
  const maxDiscs = 6;
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const _euler = useMemo(() => new THREE.Euler(), []);

  useFrame(({ clock }) => {
    const discs = discsRef.current;
    const t = clock.getElapsedTime();
    for (let i = 0; i < maxDiscs; i++) {
      const mesh = refs.current[i];
      if (!mesh) continue;
      if (i < discs.length && discs[i].alive) {
        const d = discs[i];
        mesh.visible = true;
        mesh.position.set(d.pos.x, d.pos.y, d.pos.z);
        // Spin and tilt along velocity
        const speed = Math.sqrt(d.vel.x * d.vel.x + d.vel.z * d.vel.z);
        const tiltAngle = Math.atan2(d.vel.y, speed);
        const headingAngle = Math.atan2(d.vel.x, d.vel.z);
        _euler.set(tiltAngle, headingAngle, t * 8 + i * 1.5);
        mesh.rotation.copy(_euler);
      } else {
        mesh.visible = false;
      }
    }
  });

  return (
    <>
      {Array.from({ length: maxDiscs }, (_, i) => (
        <mesh
          key={`disc${i}`}
          ref={(el) => { refs.current[i] = el; }}
          visible={false}
        >
          <cylinderGeometry args={[0.8, 0.8, 0.1, 16]} />
          <meshStandardMaterial color="#ff6600" emissive="#ff3300" emissiveIntensity={0.3} />
        </mesh>
      ))}
    </>
  );
}

// ─── Fragment Meshes (pre-allocated pool) ───
function FragmentMeshes({ fragmentsRef }: { fragmentsRef: MutableRefObject<Fragment[]> }) {
  const maxFragments = 48;
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const matRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  useFrame(() => {
    const frags = fragmentsRef.current;
    for (let i = 0; i < maxFragments; i++) {
      const mesh = refs.current[i];
      const mat = matRefs.current[i];
      if (!mesh || !mat) continue;
      if (i < frags.length) {
        const f = frags[i];
        mesh.visible = true;
        mesh.position.set(f.pos.x, f.pos.y, f.pos.z);
        mesh.rotation.x += 0.1;
        mesh.rotation.y += 0.15;
        mat.color.set(f.color);
        mat.opacity = clamp(f.life / CFG.FRAGMENT_LIFE, 0, 1);
      } else {
        mesh.visible = false;
      }
    }
  });

  return (
    <>
      {Array.from({ length: maxFragments }, (_, i) => (
        <mesh
          key={`frag${i}`}
          ref={(el) => { refs.current[i] = el; }}
          visible={false}
        >
          <octahedronGeometry args={[0.15]} />
          <meshBasicMaterial
            ref={(el) => { matRefs.current[i] = el; }}
            color="#ff6600"
            transparent
            opacity={1}
          />
        </mesh>
      ))}
    </>
  );
}

// ─── Muzzle Flash ───
function MuzzleFlash({ muzzleRef, yawRef, pitchRef }: {
  muzzleRef: MutableRefObject<number>;
  yawRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    const nowMs = Date.now();
    if (nowMs < muzzleRef.current) {
      meshRef.current.visible = true;
      // Place flash slightly in front of camera
      const yaw = yawRef.current;
      const pitch = pitchRef.current;
      const fwd = computeForwardVec(yaw, pitch);
      meshRef.current.position.set(
        CFG.CAM_POS[0] + fwd.x * 1.5,
        CFG.CAM_POS[1] + fwd.y * 1.5 - 0.3,
        CFG.CAM_POS[2] + fwd.z * 1.5,
      );
    } else {
      meshRef.current.visible = false;
    }
  });

  return (
    <mesh ref={meshRef} visible={false}>
      <sphereGeometry args={[0.3, 8, 8]} />
      <meshBasicMaterial color="#ffff88" transparent opacity={0.8} />
    </mesh>
  );
}

// ─── Scene ───
function Scene({
  yawRef,
  pitchRef,
  discsRef,
  fragmentsRef,
  muzzleRef,
  status,
}: {
  yawRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
  discsRef: MutableRefObject<DiscState[]>;
  fragmentsRef: MutableRefObject<Fragment[]>;
  muzzleRef: MutableRefObject<number>;
  status: GameStatus;
}) {
  return (
    <>
      <CameraController yawRef={yawRef} pitchRef={pitchRef} />
      <Environment />
      {status !== 'READY' && (
        <>
          <DiscMeshes discsRef={discsRef} />
          <FragmentMeshes fragmentsRef={fragmentsRef} />
          <MuzzleFlash muzzleRef={muzzleRef} yawRef={yawRef} pitchRef={pitchRef} />
        </>
      )}
    </>
  );
}

// ==========================================
// 6. HUD Components
// ==========================================

function Crosshair({ inRange }: { inRange: boolean }) {
  const color = inRange ? '#ff8800' : 'rgba(255,255,255,0.7)';
  const lineColor = inRange ? 'rgba(255,136,0,0.6)' : 'rgba(255,255,255,0.4)';

  return (
    <div
      className="absolute inset-0 z-10 pointer-events-none"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Outer circle */}
      <div style={{
        position: 'absolute',
        width: 40,
        height: 40,
        borderRadius: '50%',
        border: `2px solid ${color}`,
        transition: 'border-color 0.1s',
      }} />
      {/* Center dot */}
      <div style={{
        position: 'absolute',
        width: 4,
        height: 4,
        borderRadius: '50%',
        background: color,
        transition: 'background 0.1s',
      }} />
      {/* Top line */}
      <div style={{
        position: 'absolute',
        width: 2,
        height: 12,
        background: lineColor,
        transform: 'translateY(-26px)',
        transition: 'background 0.1s',
      }} />
      {/* Bottom line */}
      <div style={{
        position: 'absolute',
        width: 2,
        height: 12,
        background: lineColor,
        transform: 'translateY(26px)',
        transition: 'background 0.1s',
      }} />
      {/* Left line */}
      <div style={{
        position: 'absolute',
        width: 12,
        height: 2,
        background: lineColor,
        transform: 'translateX(-26px)',
        transition: 'background 0.1s',
      }} />
      {/* Right line */}
      <div style={{
        position: 'absolute',
        width: 12,
        height: 2,
        background: lineColor,
        transform: 'translateX(26px)',
        transition: 'background 0.1s',
      }} />
    </div>
  );
}

function ShotIndicators({ shotsLeft }: { shotsLeft: number }) {
  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-3"
      style={{ pointerEvents: 'none' }}
    >
      {Array.from({ length: CFG.MAX_SHOTS }, (_, i) => {
        const filled = i < shotsLeft;
        return (
          <div
            key={i}
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: `2px solid ${filled ? '#ffcc00' : 'rgba(255,255,255,0.2)'}`,
              background: filled ? '#ffcc00' : 'transparent',
              transition: 'all 0.15s',
            }}
          />
        );
      })}
    </div>
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

export default function Game10({ inputRef, paused, callbacks }: Props) {
  const { gs, yawRef, pitchRef, discsRef, fragmentsRef, muzzleRef } = useGameLogic(inputRef, paused, callbacks);
  const { status, score, combo, totalShots, totalHits, round, shotsLeft, discInRange } = gs;

  const phase = getPhase(round.roundNumber);
  const accuracy = totalShots > 0 ? Math.round((totalHits / totalShots) * 100) : 0;
  const comboText = combo >= 2 ? `x${Math.min(combo, 5)}!` : '';
  const showPullPrompt = status === 'PLAYING' && round.waitingForPull && round.pauseUntil === 0;

  return (
    <div className="relative w-full h-screen overflow-hidden select-none" style={{ background: '#87CEEB' }}>
      {/* R3F Canvas */}
      <Canvas
        camera={{ position: [0, 8, 0], fov: 70, near: 0.1, far: 500 }}
        gl={{ antialias: false, alpha: false }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Scene
          yawRef={yawRef}
          pitchRef={pitchRef}
          discsRef={discsRef}
          fragmentsRef={fragmentsRef}
          muzzleRef={muzzleRef}
          status={status}
        />
      </Canvas>

      {/* HUD: Playing */}
      {status === 'PLAYING' && (
        <>
          {/* Crosshair */}
          <Crosshair inRange={discInRange} />

          {/* Top-left: Round + Phase */}
          <div className="absolute top-4 left-4 z-10 pointer-events-none">
            <div className="text-sm font-bold font-mono tracking-wider"
              style={{ color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
              ROUND {round.roundNumber} <span style={{ color: 'rgba(255,255,255,0.5)' }}>·</span> PHASE {phase}
            </div>
          </div>

          {/* Top-center: Score + Combo */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-center pointer-events-none">
            <div className="text-2xl font-black tracking-[0.3em] font-mono"
              style={{
                color: 'rgba(255,255,255,0.9)',
                textShadow: '0 0 20px rgba(255,150,0,0.5), 0 2px 6px rgba(0,0,0,0.4)',
              }}>
              {score.toString().padStart(7, '0')}
            </div>
            {comboText && (
              <div className="text-lg font-black mt-0.5 animate-pulse"
                style={{
                  color: combo >= 4 ? '#ff4400' : combo >= 3 ? '#ff8800' : '#ffcc00',
                  textShadow: '0 0 15px rgba(255,136,0,0.7)',
                }}>
                {comboText}
              </div>
            )}
          </div>

          {/* Top-right: Accuracy */}
          <div className="absolute top-4 right-4 z-10 pointer-events-none">
            <div className="text-sm font-bold font-mono tracking-wider"
              style={{ color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
              HIT: {accuracy}%
            </div>
          </div>

          {/* Center: Pull prompt */}
          {showPullPrompt && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
              style={{ paddingTop: 80 }}>
              <div className="text-xl font-black tracking-[0.2em] animate-pulse"
                style={{
                  color: '#ffcc00',
                  textShadow: '0 0 20px rgba(255,200,0,0.7), 0 2px 8px rgba(0,0,0,0.5)',
                }}>
                TAP PULL
              </div>
            </div>
          )}

          {/* Round transition overlay */}
          {round.pauseUntil > 0 && (
            <div className="absolute inset-0 z-15 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-3xl font-black tracking-wider"
                style={{
                  color: 'rgba(255,255,255,0.9)',
                  textShadow: '0 0 30px rgba(255,150,0,0.6), 0 3px 10px rgba(0,0,0,0.5)',
                }}>
                ROUND {round.roundNumber} COMPLETE
              </div>
              <div className="text-lg font-mono mt-2"
                style={{ color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                {round.discsHit}/{round.discsTotal} HIT
                {round.discsHit === round.discsTotal && round.discsTotal > 0 && (
                  <span style={{ color: '#ffcc00', marginLeft: 12 }}>PERFECT! +{CFG.PERFECT_BONUS}</span>
                )}
              </div>
            </div>
          )}

          {/* Bottom-center: Shot indicators */}
          <ShotIndicators shotsLeft={shotsLeft} />
        </>
      )}

      {/* READY overlay */}
      {status === 'READY' && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4"
          style={{ background: 'rgba(40,20,0,0.5)' }}
        >
          <div
            className="text-5xl font-black tracking-wider"
            style={{
              color: '#ff8800',
              textShadow: '0 0 30px rgba(255,136,0,0.6), 0 0 60px rgba(255,100,0,0.3)',
            }}
          >
            SKEET SHOOTER
          </div>
          <div
            className="text-lg tracking-[0.2em] mt-2"
            style={{
              color: 'rgba(255,220,180,0.8)',
              textShadow: '0 1px 6px rgba(0,0,0,0.5)',
            }}
          >
            TILT TO AIM
          </div>
          <div
            className="text-base tracking-[0.15em] mt-1"
            style={{
              color: 'rgba(255,220,180,0.6)',
              textShadow: '0 1px 6px rgba(0,0,0,0.5)',
            }}
          >
            TAP SHOOT
          </div>
        </div>
      )}
    </div>
  );
}
