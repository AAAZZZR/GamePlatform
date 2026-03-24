// games/game9/index.tsx — Sky Fighter (R3F 3D Dogfight)
'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo, MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { NormalizedInput, GameCallbacks, GameStatus } from '@/platform/types';
import { sfx } from '@/platform/audio';

// ==========================================
// 1. Configuration
// ==========================================
const CFG = {
  // Flight
  ROLL_SENSITIVITY: 0.035,
  PITCH_SENSITIVITY: 0.03,
  YAW_FROM_ROLL: 0.025,
  AUTO_LEVEL_RATE: 0.015,
  // Speed
  BASE_SPEED: 1.5,
  MIN_SPEED: 0.8,
  MAX_SPEED: 3.0,
  BOOST_MULT: 1.6,
  DIVE_ACCEL: 0.003,
  CLIMB_DECEL: 0.002,
  DRAG_RATE: 0.003,
  // Combat
  MAX_AMMO: 60,
  FIRE_RATE: 80,
  RELOAD_TIME: 2000,
  BULLET_SPEED: 12,
  BULLET_LIFETIME: 90,
  BULLET_DAMAGE: 8,
  ENEMY_BULLET_SPEED: 10,
  ENEMY_BULLET_DAMAGE: 5,
  ENEMY_BULLET_SPREAD: 0.15,
  // Player
  PLAYER_HP: 100,
  PLAYER_HITBOX: 2.5,
  // Enemy
  ENEMY_HP: 40,
  ENEMY_HITBOX: 3.0,
  ENEMY_PATROL_RADIUS: 80,
  ENEMY_DETECT_RANGE: 300,
  ENEMY_FIRE_RANGE: 200,
  ENEMY_FIRE_ANGLE: 15 * (Math.PI / 180),
  ENEMY_TURN_RATE: 0.03,
  ENEMY_EVADE_TIME: 120,
  ENEMY_BURST_MIN: 3,
  ENEMY_BURST_MAX: 5,
  ENEMY_BURST_CD_MIN: 120,
  ENEMY_BURST_CD_MAX: 180,
  // Arena
  ARENA_RADIUS: 600,
  ARENA_PUSH: 0.02,
  GROUND_Y: 0,
  GROUND_PUSH_Y: 15,
  GROUND_PUSH_RATE: 0.04,
  // Ammo regen
  AMMO_REGEN_RATE: 4,  // ammo per second (passive regen)
  // Brake
  BRAKE_DECEL: 0.03,
  // Radar
  RADAR_RANGE: 400,
};

// ==========================================
// 2. Types
// ==========================================
interface Vec3 { x: number; y: number; z: number; }
interface Quat { w: number; x: number; y: number; z: number; }

type AIState = 'PATROL' | 'CHASE' | 'EVADE';

interface Enemy {
  id: number;
  pos: Vec3;
  orientation: Quat;
  speed: number;
  hp: number;
  maxHp: number;
  state: AIState;
  stateTimer: number;
  patrolAngle: number;
  fireTimer: number;
  burstCount: number;
  burstRemaining: number;
  cooldownTimer: number;
  flashTimer: number;
}

interface Bullet {
  id: number;
  pos: Vec3;
  vel: Vec3;
  life: number;
  isEnemy: boolean;
  damage: number;
}

interface Particle {
  id: number;
  pos: Vec3;
  vel: Vec3;
  life: number;
  maxLife: number;
  color: string;
}

interface GameState {
  player: {
    pos: Vec3;
    orientation: Quat;
    speed: number;
    hp: number;
    ammo: number;
    maxAmmo: number;
    rollAngle: number;
    score: number;
    kills: number;
  };
  enemies: Enemy[];
  bullets: Bullet[];
  explosions: Particle[];
  status: GameStatus;
  startTime: number;
  phase: number;
  lastSpawnTime: number;
  nextSpawnDelay: number;
  lastFireTime: number;
}

// ==========================================
// 3. Helpers
// ==========================================
let _id = 0;
function nid() { return ++_id; }

function v3len(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function v3lenXZ(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function spawnEnemy(playerPos: Vec3, playerOrientation: Quat, phase: number): Enemy {
  const _q = new THREE.Quaternion(playerOrientation.x, playerOrientation.y, playerOrientation.z, playerOrientation.w);
  const _fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(_q);

  let spawnPos: Vec3;
  const dist = 300;

  if (phase <= 1) {
    // Spawn AHEAD of player
    spawnPos = {
      x: playerPos.x + _fwd.x * dist,
      y: Math.max(40, playerPos.y + 20 + Math.random() * 40),
      z: playerPos.z + _fwd.z * dist,
    };
  } else if (phase === 2) {
    // Spawn to SIDE
    const side = Math.random() > 0.5 ? 1 : -1;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(_q);
    spawnPos = {
      x: playerPos.x + right.x * dist * side,
      y: Math.max(40, playerPos.y + Math.random() * 60),
      z: playerPos.z + right.z * dist * side,
    };
  } else if (phase === 3) {
    // Spawn BEHIND
    spawnPos = {
      x: playerPos.x - _fwd.x * dist,
      y: Math.max(40, playerPos.y + Math.random() * 60),
      z: playerPos.z - _fwd.z * dist,
    };
  } else {
    // Random position
    const angle = Math.random() * Math.PI * 2;
    spawnPos = {
      x: playerPos.x + Math.cos(angle) * dist,
      y: Math.max(40, 30 + Math.random() * 120),
      z: playerPos.z + Math.sin(angle) * dist,
    };
  }

  const hp = phase >= 5 ? 55 : CFG.ENEMY_HP;

  return {
    id: nid(),
    pos: spawnPos,
    orientation: { w: 1, x: 0, y: 0, z: 0 },
    speed: phase >= 5 ? 1.8 : 1.3,
    hp,
    maxHp: hp,
    state: 'PATROL',
    stateTimer: 0,
    patrolAngle: Math.random() * Math.PI * 2,
    fireTimer: 0,
    burstCount: 0,
    burstRemaining: 0,
    cooldownTimer: phase >= 5 ? CFG.ENEMY_BURST_CD_MIN : CFG.ENEMY_BURST_CD_MAX,
    flashTimer: 0,
  };
}

function makeExplosion(pos: Vec3, count: number, color: string): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const maxLife = 30 + Math.random() * 30;
    particles.push({
      id: nid(),
      pos: { x: pos.x, y: pos.y, z: pos.z },
      vel: {
        x: (Math.random() - 0.5) * 3,
        y: (Math.random() - 0.5) * 3,
        z: (Math.random() - 0.5) * 3,
      },
      life: maxLife,
      maxLife,
      color,
    });
  }
  return particles;
}

function getPhase(elapsed: number): number {
  if (elapsed < 30) return 1;
  if (elapsed < 60) return 2;
  if (elapsed < 90) return 3;
  if (elapsed < 120) return 4;
  return 5;
}

function maxEnemiesForPhase(phase: number): number {
  if (phase <= 3) return 1;
  if (phase === 4) return 2;
  return 3;
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
    return {
      player: {
        pos: { x: 0, y: 60, z: 0 },
        orientation: { w: 1, x: 0, y: 0, z: 0 },
        speed: CFG.BASE_SPEED,
        hp: CFG.PLAYER_HP,
        ammo: CFG.MAX_AMMO,
        maxAmmo: CFG.MAX_AMMO,
        rollAngle: 0,
        score: 0,
        kills: 0,
      },
      enemies: [],
      bullets: [],
      explosions: [],
      status: 'READY' as GameStatus,
      startTime: 0,
      phase: 1,
      lastSpawnTime: 0,
      nextSpawnDelay: 3000,
      lastFireTime: 0,
    };
  }, []);

  const [gs, setGs] = useState<GameState>(getInitialState);
  const stateRef = useRef(gs);
  stateRef.current = gs;
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  // Expose state via refs for R3F components
  const playerRef = useRef(gs.player);
  playerRef.current = gs.player;
  const enemiesRef = useRef(gs.enemies);
  enemiesRef.current = gs.enemies;
  const bulletsRef = useRef(gs.bullets);
  bulletsRef.current = gs.bullets;
  const explosionsRef = useRef(gs.explosions);
  explosionsRef.current = gs.explosions;

  useEffect(() => { cbRef.current.onScoreChange(gs.player.score); }, [gs.player.score]);
  useEffect(() => { cbRef.current.onStatusChange(gs.status); }, [gs.status]);

  useEffect(() => {
    let loopId: number;
    let prevT = performance.now();

    // Pre-allocate reusable THREE objects
    const _q = new THREE.Quaternion();
    const _qDelta = new THREE.Quaternion();
    const _forward = new THREE.Vector3();
    const _v3 = new THREE.Vector3();
    const _eQ = new THREE.Quaternion();
    const _eQDelta = new THREE.Quaternion();
    const _eFwd = new THREE.Vector3();
    const _eV3 = new THREE.Vector3();
    const _toTarget = new THREE.Vector3();
    const smoothed = { x: 0, y: 0 };
    const spottedEnemies = new Set<number>(); // track which enemies have been called out
    let lastProxWarn = 0;

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
        setGs(getInitialState());
      }

      if (s.status === 'PLAYING' && !paused) {
        const nowMs = Date.now();
        const elapsed = (nowMs - s.startTime) / 1000;
        const phase = getPhase(elapsed);
        const isThrottling = !!input.actions['throttle'];
        const isBraking = !!input.actions['brake'];
        const isFiring = !!input.actions['fire'];

        // ─── Player Flight Physics ───
        // 1. Smooth gyro input (normalize to -1..+1; platform bakes speed multiplier into input)
        const nx = input.move.x / 15;
        const ny = input.move.y / 15;
        smoothed.x += (nx - smoothed.x) * 0.12;
        smoothed.y += (ny - smoothed.y) * 0.12;

        // 2. Rotation deltas in local frame (negate roll so tilt-right = bank-right)
        const dRoll = -smoothed.x * CFG.ROLL_SENSITIVITY * dt;
        const dPitch = smoothed.y * CFG.PITCH_SENSITIVITY * dt;

        // Track roll angle for bank-to-turn
        let rollAngle = s.player.rollAngle + dRoll;

        // Auto-level roll when input is small
        if (Math.abs(smoothed.x) < 0.1) {
          rollAngle *= (1 - CFG.AUTO_LEVEL_RATE * dt);
        }
        rollAngle = clamp(rollAngle, -1.2, 1.2);

        const dYaw = rollAngle * CFG.YAW_FROM_ROLL * dt;

        // 3. Apply to quaternion (multiply on right = local frame)
        _q.set(s.player.orientation.x, s.player.orientation.y, s.player.orientation.z, s.player.orientation.w);
        _qDelta.setFromAxisAngle(_v3.set(1, 0, 0), dPitch);
        _q.multiply(_qDelta);
        _qDelta.setFromAxisAngle(_v3.set(0, 1, 0), dYaw);
        _q.multiply(_qDelta);
        _qDelta.setFromAxisAngle(_v3.set(0, 0, 1), dRoll);
        _q.multiply(_qDelta);
        _q.normalize();

        // 4. Extract forward: (0,0,-1) rotated by quaternion
        _forward.set(0, 0, -1).applyQuaternion(_q);

        // 5. Speed model (throttle / brake)
        let speed = s.player.speed;
        if (isThrottling) {
          speed = Math.min(CFG.MAX_SPEED, speed * (1 + (CFG.BOOST_MULT - 1) * 0.1 * dt));
        }
        if (isBraking) {
          speed = Math.max(CFG.MIN_SPEED, speed - CFG.BRAKE_DECEL * dt);
        }
        if (_forward.y < -0.1) {
          speed += CFG.DIVE_ACCEL * dt;
        }
        if (_forward.y > 0.1) {
          speed -= CFG.CLIMB_DECEL * dt;
        }
        speed += (CFG.BASE_SPEED - speed) * CFG.DRAG_RATE * dt;
        speed = clamp(speed, CFG.MIN_SPEED, isThrottling ? CFG.MAX_SPEED : CFG.MAX_SPEED * 0.85);

        // 6. Move along forward
        const px = s.player.pos.x + _forward.x * speed * dt;
        let py = s.player.pos.y + _forward.y * speed * dt;
        const pz = s.player.pos.z + _forward.z * speed * dt;

        // 7. Ground proximity auto-pitch-up
        if (py < CFG.GROUND_PUSH_Y) {
          const pushFactor = 1 - (py / CFG.GROUND_PUSH_Y);
          // Rotate pitch up
          _qDelta.setFromAxisAngle(_v3.set(1, 0, 0), -pushFactor * CFG.GROUND_PUSH_RATE * dt);
          _q.multiply(_qDelta);
          _q.normalize();
          py = Math.max(2, py);
        }

        // 8. Arena boundary soft-push
        const distFromCenter = Math.sqrt(px * px + pz * pz);
        let adjustedPx = px;
        let adjustedPz = pz;
        if (distFromCenter > CFG.ARENA_RADIUS) {
          const pushBack = (distFromCenter - CFG.ARENA_RADIUS) * CFG.ARENA_PUSH * dt;
          const nx = px / distFromCenter;
          const nz = pz / distFromCenter;
          adjustedPx -= nx * pushBack;
          adjustedPz -= nz * pushBack;
        }

        // Clamp altitude
        const adjustedPy = clamp(py, 2, 350);

        const newOrientation: Quat = { w: _q.w, x: _q.x, y: _q.y, z: _q.z };
        const newPos: Vec3 = { x: adjustedPx, y: adjustedPy, z: adjustedPz };

        // ─── Combat: Player Firing + Ammo Auto-Regen ───
        let ammo = s.player.ammo;
        const newBullets = [...s.bullets];
        let lastFireTime = s.lastFireTime;

        // Passive ammo regen (always active)
        ammo = Math.min(CFG.MAX_AMMO, ammo + CFG.AMMO_REGEN_RATE / 60 * dt);

        // Fire
        if (isFiring && ammo >= 1 && (nowMs - lastFireTime) >= CFG.FIRE_RATE) {
          ammo--;
          lastFireTime = nowMs;
          sfx.shoot();
          newBullets.push({
            id: nid(),
            pos: { x: newPos.x, y: newPos.y, z: newPos.z },
            vel: { x: _forward.x * CFG.BULLET_SPEED, y: _forward.y * CFG.BULLET_SPEED, z: _forward.z * CFG.BULLET_SPEED },
            life: CFG.BULLET_LIFETIME,
            isEnemy: false,
            damage: CFG.BULLET_DAMAGE,
          });
        }

        // ─── Update Bullets ───
        for (let i = newBullets.length - 1; i >= 0; i--) {
          const b = newBullets[i];
          b.pos.x += b.vel.x * dt;
          b.pos.y += b.vel.y * dt;
          b.pos.z += b.vel.z * dt;
          b.life -= dt;
          if (b.life <= 0 || b.pos.y < 0) {
            newBullets.splice(i, 1);
          }
        }

        // ─── Update Enemies ───
        const newEnemies = [...s.enemies];
        let score = s.player.score;
        let kills = s.player.kills;
        let hp = s.player.hp;
        let newExplosions = [...s.explosions];

        for (let ei = newEnemies.length - 1; ei >= 0; ei--) {
          const e = newEnemies[ei];

          if (e.flashTimer > 0) e.flashTimer -= dt;

          // AI State Machine
          const distToPlayer = v3len(e.pos, newPos);

          switch (e.state) {
            case 'PATROL': {
              e.patrolAngle += 0.008 * dt;
              const patrolTarget: Vec3 = {
                x: Math.cos(e.patrolAngle) * CFG.ENEMY_PATROL_RADIUS,
                y: 60 + Math.sin(e.patrolAngle * 0.5) * 30,
                z: Math.sin(e.patrolAngle) * CFG.ENEMY_PATROL_RADIUS,
              };
              steerEnemy(e, patrolTarget, CFG.ENEMY_TURN_RATE * 0.5, dt, _eQ, _eQDelta, _eFwd, _eV3, _toTarget);
              if (distToPlayer < CFG.ENEMY_DETECT_RANGE) {
                e.state = 'CHASE';
                e.stateTimer = 0;
              }
              break;
            }
            case 'CHASE': {
              const turnRate = phase >= 5 ? CFG.ENEMY_TURN_RATE * 1.3 : CFG.ENEMY_TURN_RATE;
              steerEnemy(e, newPos, turnRate, dt, _eQ, _eQDelta, _eFwd, _eV3, _toTarget);

              // Check fire angle
              _eQ.set(e.orientation.x, e.orientation.y, e.orientation.z, e.orientation.w);
              _eFwd.set(0, 0, -1).applyQuaternion(_eQ);
              _toTarget.set(newPos.x - e.pos.x, newPos.y - e.pos.y, newPos.z - e.pos.z).normalize();
              const angleToPlayer = Math.acos(clamp(_eFwd.dot(_toTarget), -1, 1));

              // Firing
              if (angleToPlayer < CFG.ENEMY_FIRE_ANGLE && distToPlayer < CFG.ENEMY_FIRE_RANGE) {
                if (e.cooldownTimer <= 0 && e.burstRemaining <= 0) {
                  e.burstRemaining = CFG.ENEMY_BURST_MIN + Math.floor(Math.random() * (CFG.ENEMY_BURST_MAX - CFG.ENEMY_BURST_MIN + 1));
                  e.fireTimer = 0;
                }
              }

              if (e.burstRemaining > 0) {
                e.fireTimer -= dt;
                if (e.fireTimer <= 0) {
                  e.fireTimer = 6;
                  e.burstRemaining--;
                  // Fire bullet with spread
                  const spread = CFG.ENEMY_BULLET_SPREAD * (phase >= 5 ? 0.6 : 1);
                  const bDir = _eFwd.clone();
                  bDir.x += (Math.random() - 0.5) * spread;
                  bDir.y += (Math.random() - 0.5) * spread;
                  bDir.z += (Math.random() - 0.5) * spread;
                  bDir.normalize();
                  newBullets.push({
                    id: nid(),
                    pos: { x: e.pos.x, y: e.pos.y, z: e.pos.z },
                    vel: { x: bDir.x * CFG.ENEMY_BULLET_SPEED, y: bDir.y * CFG.ENEMY_BULLET_SPEED, z: bDir.z * CFG.ENEMY_BULLET_SPEED },
                    life: CFG.BULLET_LIFETIME,
                    isEnemy: true,
                    damage: CFG.ENEMY_BULLET_DAMAGE,
                  });
                  if (e.burstRemaining <= 0) {
                    e.cooldownTimer = CFG.ENEMY_BURST_CD_MIN + Math.random() * (CFG.ENEMY_BURST_CD_MAX - CFG.ENEMY_BURST_CD_MIN);
                  }
                }
              }
              if (e.cooldownTimer > 0) e.cooldownTimer -= dt;

              // Check if should evade (low HP)
              if (e.hp < e.maxHp * 0.3 && Math.random() < 0.01 * dt) {
                e.state = 'EVADE';
                e.stateTimer = CFG.ENEMY_EVADE_TIME;
              }
              break;
            }
            case 'EVADE': {
              // Hard perpendicular turn + climb
              const evadeTarget: Vec3 = {
                x: e.pos.x + (Math.random() - 0.5) * 100,
                y: e.pos.y + 50,
                z: e.pos.z + (Math.random() - 0.5) * 100,
              };
              steerEnemy(e, evadeTarget, CFG.ENEMY_TURN_RATE * 1.5, dt, _eQ, _eQDelta, _eFwd, _eV3, _toTarget);
              e.stateTimer -= dt;
              if (e.stateTimer <= 0) {
                e.state = 'CHASE';
                e.stateTimer = 0;
              }
              break;
            }
          }

          // Move enemy along its forward
          _eQ.set(e.orientation.x, e.orientation.y, e.orientation.z, e.orientation.w);
          _eFwd.set(0, 0, -1).applyQuaternion(_eQ);
          e.pos.x += _eFwd.x * e.speed * dt;
          e.pos.y += _eFwd.y * e.speed * dt;
          e.pos.z += _eFwd.z * e.speed * dt;

          // Keep enemy above ground and within arena
          e.pos.y = Math.max(10, e.pos.y);
          const eDist = Math.sqrt(e.pos.x * e.pos.x + e.pos.z * e.pos.z);
          if (eDist > CFG.ARENA_RADIUS * 1.2) {
            const factor = CFG.ARENA_RADIUS / eDist;
            e.pos.x *= factor;
            e.pos.z *= factor;
          }

          // Bullet-enemy collision (player bullets)
          for (let bi = newBullets.length - 1; bi >= 0; bi--) {
            const b = newBullets[bi];
            if (b.isEnemy) continue;
            const hitDist = v3len(b.pos, e.pos);
            if (hitDist < CFG.ENEMY_HITBOX) {
              e.hp -= b.damage;
              e.flashTimer = 6;
              newBullets.splice(bi, 1);
              if (e.hp <= 0) {
                sfx.explosion();
                newExplosions = newExplosions.concat(makeExplosion(e.pos, 15, '#ff6600'));
                score += 500;
                kills++;
                newEnemies.splice(ei, 1);
                break;
              }
            }
          }
        }

        // Player-enemy bullet collision
        for (let bi = newBullets.length - 1; bi >= 0; bi--) {
          const b = newBullets[bi];
          if (!b.isEnemy) continue;
          const hitDist = v3len(b.pos, newPos);
          if (hitDist < CFG.PLAYER_HITBOX) {
            hp -= b.damage;
            sfx.crash();
            newBullets.splice(bi, 1);
            newExplosions = newExplosions.concat(makeExplosion(newPos, 5, '#ff0000'));
          }
        }

        // ─── Enemy Detection Alerts ───
        {
          let closestDist = Infinity;
          for (const e of newEnemies) {
            const d = v3len(e.pos, newPos);
            if (d < closestDist) closestDist = d;
            // First-time spot callout
            if (d < CFG.ENEMY_DETECT_RANGE && !spottedEnemies.has(e.id)) {
              spottedEnemies.add(e.id);
              sfx.enemySpotted();
            }
          }
          // Proximity warning (closer = louder)
          if (closestDist < CFG.ENEMY_DETECT_RANGE && nowMs - lastProxWarn > 800) {
            const vol = 1 - closestDist / CFG.ENEMY_DETECT_RANGE;
            sfx.proximityWarn(vol);
            lastProxWarn = nowMs;
          }
          // Clean up spotted set for despawned enemies
          const aliveIds = new Set(newEnemies.map(e => e.id));
          for (const id of spottedEnemies) {
            if (!aliveIds.has(id)) spottedEnemies.delete(id);
          }
        }

        // ─── Explosion Particles ───
        for (let pi = newExplosions.length - 1; pi >= 0; pi--) {
          const p = newExplosions[pi];
          p.pos.x += p.vel.x * dt;
          p.pos.y += p.vel.y * dt;
          p.pos.z += p.vel.z * dt;
          p.life -= dt;
          if (p.life <= 0) {
            newExplosions.splice(pi, 1);
          }
        }

        // ─── Enemy Spawning ───
        let lastSpawnTime = s.lastSpawnTime;
        let nextSpawnDelay = s.nextSpawnDelay;

        const maxEnemies = maxEnemiesForPhase(phase);
        if (newEnemies.length < maxEnemies && (nowMs - lastSpawnTime) > nextSpawnDelay) {
          newEnemies.push(spawnEnemy(newPos, newOrientation, phase));
          lastSpawnTime = nowMs;
          nextSpawnDelay = 3000 + Math.random() * 2000;
        }

        // Score over time
        score += Math.floor(dt * 0.5);

        // ─── Check Death ───
        let newStatus: GameStatus = 'PLAYING';
        if (hp <= 0) {
          newStatus = 'GAME_OVER';
          sfx.gameOver();
          newExplosions = newExplosions.concat(makeExplosion(newPos, 20, '#00ccff'));
        }

        setGs({
          player: {
            pos: newPos,
            orientation: newOrientation,
            speed,
            hp: Math.max(0, hp),
            ammo,
            maxAmmo: CFG.MAX_AMMO,
            rollAngle,
            score,
            kills,
          },
          enemies: newEnemies,
          bullets: newBullets,
          explosions: newExplosions,
          status: newStatus,
          startTime: s.startTime,
          phase,
          lastSpawnTime,
          nextSpawnDelay,
          lastFireTime,
        });
      }

      loopId = requestAnimationFrame(loop);
    };

    loopId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(loopId);
  }, [paused, inputRef, getInitialState]);

  return { gs, playerRef, enemiesRef, bulletsRef, explosionsRef };
}

// ─── AI Steering Helper ───
function steerEnemy(
  e: Enemy,
  targetPos: Vec3,
  turnRate: number,
  dt: number,
  _eQ: THREE.Quaternion,
  _eQDelta: THREE.Quaternion,
  _eFwd: THREE.Vector3,
  _eV3: THREE.Vector3,
  _toTarget: THREE.Vector3,
) {
  _eQ.set(e.orientation.x, e.orientation.y, e.orientation.z, e.orientation.w);
  _eFwd.set(0, 0, -1).applyQuaternion(_eQ);

  _toTarget.set(
    targetPos.x - e.pos.x,
    targetPos.y - e.pos.y,
    targetPos.z - e.pos.z,
  ).normalize();

  // Compute cross product for rotation axis
  _eV3.crossVectors(_eFwd, _toTarget);
  const sinAngle = _eV3.length();

  if (sinAngle > 0.001) {
    _eV3.normalize();
    const angle = Math.asin(clamp(sinAngle, -1, 1));
    const step = Math.min(angle, turnRate * dt);
    _eQDelta.setFromAxisAngle(_eV3, step);
    _eQ.premultiply(_eQDelta);
    _eQ.normalize();
  }

  e.orientation = { w: _eQ.w, x: _eQ.x, y: _eQ.y, z: _eQ.z };
}

// ==========================================
// 5. R3F Components
// ==========================================

// ─── Player Jet ───
function PlayerJet({ playerRef }: { playerRef: MutableRefObject<GameState['player']> }) {
  const meshRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!meshRef.current || !playerRef.current) return;
    const p = playerRef.current;
    meshRef.current.position.set(p.pos.x, p.pos.y, p.pos.z);
    meshRef.current.quaternion.set(p.orientation.x, p.orientation.y, p.orientation.z, p.orientation.w);
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.color.set(p.speed > CFG.BASE_SPEED * 1.3 ? '#ff6600' : '#00ffff');
    }
  });

  return (
    <group ref={meshRef}>
      {/* Fuselage */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.5, 3.5, 6]} />
        <meshStandardMaterial color="#00ccff" />
      </mesh>
      {/* Left wing */}
      <mesh position={[-1.5, 0, 0.3]}>
        <boxGeometry args={[2.2, 0.06, 0.9]} />
        <meshStandardMaterial color="#0099cc" />
      </mesh>
      {/* Right wing */}
      <mesh position={[1.5, 0, 0.3]}>
        <boxGeometry args={[2.2, 0.06, 0.9]} />
        <meshStandardMaterial color="#0099cc" />
      </mesh>
      {/* Vertical tail */}
      <mesh position={[0, 0.4, 1.3]}>
        <boxGeometry args={[0.06, 0.7, 0.5]} />
        <meshStandardMaterial color="#0088aa" />
      </mesh>
      {/* Left h-tail */}
      <mesh position={[-0.5, 0, 1.3]}>
        <boxGeometry args={[0.8, 0.05, 0.35]} />
        <meshStandardMaterial color="#0088aa" />
      </mesh>
      {/* Right h-tail */}
      <mesh position={[0.5, 0, 1.3]}>
        <boxGeometry args={[0.8, 0.05, 0.35]} />
        <meshStandardMaterial color="#0088aa" />
      </mesh>
      {/* Engine glow */}
      <mesh ref={glowRef} position={[0, 0, 1.8]}>
        <sphereGeometry args={[0.2, 6, 6]} />
        <meshBasicMaterial color="#00ffff" />
      </mesh>
    </group>
  );
}

// ─── Enemy Jet ───
function EnemyJet({ enemiesRef, index }: { enemiesRef: MutableRefObject<Enemy[]>; index: number }) {
  const meshRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const flashRef = useRef(0);

  useFrame(() => {
    if (!meshRef.current) return;
    const enemies = enemiesRef.current;
    if (index >= enemies.length) {
      meshRef.current.visible = false;
      return;
    }
    const e = enemies[index];
    meshRef.current.visible = true;
    meshRef.current.position.set(e.pos.x, e.pos.y, e.pos.z);
    meshRef.current.quaternion.set(e.orientation.x, e.orientation.y, e.orientation.z, e.orientation.w);

    // Flash white on hit
    if (bodyRef.current) {
      const mat = bodyRef.current.material as THREE.MeshStandardMaterial;
      if (e.flashTimer > 0) {
        mat.color.set('#ffffff');
      } else {
        mat.color.set('#ff3300');
      }
    }
  });

  return (
    <group ref={meshRef}>
      {/* Fuselage */}
      <mesh ref={bodyRef} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.5, 3.5, 6]} />
        <meshStandardMaterial color="#ff3300" />
      </mesh>
      {/* Left wing */}
      <mesh position={[-1.5, 0, 0.3]}>
        <boxGeometry args={[2.2, 0.06, 0.9]} />
        <meshStandardMaterial color="#cc2200" />
      </mesh>
      {/* Right wing */}
      <mesh position={[1.5, 0, 0.3]}>
        <boxGeometry args={[2.2, 0.06, 0.9]} />
        <meshStandardMaterial color="#cc2200" />
      </mesh>
      {/* Vertical tail */}
      <mesh position={[0, 0.4, 1.3]}>
        <boxGeometry args={[0.06, 0.7, 0.5]} />
        <meshStandardMaterial color="#cc2200" />
      </mesh>
      {/* Left h-tail */}
      <mesh position={[-0.5, 0, 1.3]}>
        <boxGeometry args={[0.8, 0.05, 0.35]} />
        <meshStandardMaterial color="#cc2200" />
      </mesh>
      {/* Right h-tail */}
      <mesh position={[0.5, 0, 1.3]}>
        <boxGeometry args={[0.8, 0.05, 0.35]} />
        <meshStandardMaterial color="#cc2200" />
      </mesh>
      {/* Engine glow */}
      <mesh position={[0, 0, 1.8]}>
        <sphereGeometry args={[0.2, 6, 6]} />
        <meshBasicMaterial color="#ff4400" />
      </mesh>
    </group>
  );
}

// ─── Bullets (instanced-like via useFrame) ───
function BulletMeshes({ bulletsRef }: { bulletsRef: MutableRefObject<Bullet[]> }) {
  const maxBullets = 80;
  const refsPlayer = useRef<(THREE.Mesh | null)[]>([]);
  const refsEnemy = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const bullets = bulletsRef.current;
    let pi = 0;
    let ei = 0;
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (!b.isEnemy && pi < maxBullets) {
        const mesh = refsPlayer.current[pi];
        if (mesh) {
          mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
          mesh.visible = true;
        }
        pi++;
      } else if (b.isEnemy && ei < maxBullets) {
        const mesh = refsEnemy.current[ei];
        if (mesh) {
          mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
          mesh.visible = true;
        }
        ei++;
      }
    }
    // Hide unused
    for (let i = pi; i < maxBullets; i++) {
      const mesh = refsPlayer.current[i];
      if (mesh) mesh.visible = false;
    }
    for (let i = ei; i < maxBullets; i++) {
      const mesh = refsEnemy.current[i];
      if (mesh) mesh.visible = false;
    }
  });

  return (
    <>
      {Array.from({ length: maxBullets }, (_, i) => (
        <mesh
          key={`pb${i}`}
          ref={(el) => { refsPlayer.current[i] = el; }}
          visible={false}
        >
          <boxGeometry args={[0.15, 0.15, 0.6]} />
          <meshBasicMaterial color="#ffff00" />
        </mesh>
      ))}
      {Array.from({ length: maxBullets }, (_, i) => (
        <mesh
          key={`eb${i}`}
          ref={(el) => { refsEnemy.current[i] = el; }}
          visible={false}
        >
          <boxGeometry args={[0.15, 0.15, 0.6]} />
          <meshBasicMaterial color="#ff3300" />
        </mesh>
      ))}
    </>
  );
}


// ─── Explosion Particles ───
function ExplosionParticles({ explosionsRef }: { explosionsRef: MutableRefObject<Particle[]> }) {
  const maxParticles = 60;
  const refs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const particles = explosionsRef.current;
    for (let i = 0; i < maxParticles; i++) {
      const mesh = refs.current[i];
      if (!mesh) continue;
      if (i < particles.length) {
        const p = particles[i];
        mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
        const s = (p.life / p.maxLife) * 0.8;
        mesh.scale.set(s, s, s);
        mesh.visible = true;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = p.life / p.maxLife;
        mat.color.set(p.color);
      } else {
        mesh.visible = false;
      }
    }
  });

  return (
    <>
      {Array.from({ length: maxParticles }, (_, i) => (
        <mesh
          key={`ex${i}`}
          ref={(el) => { refs.current[i] = el; }}
          visible={false}
        >
          <octahedronGeometry args={[0.5, 0]} />
          <meshBasicMaterial color="#ff6600" transparent opacity={1} />
        </mesh>
      ))}
    </>
  );
}

// ─── Chase Camera ───
function ChaseCam({ playerRef }: { playerRef: MutableRefObject<GameState['player']> }) {
  const camPos = useRef(new THREE.Vector3(0, 64, 30));
  const camLook = useRef(new THREE.Vector3(0, 60, 0));

  useFrame(({ camera }) => {
    const p = playerRef.current;
    if (!p) return;

    const q = new THREE.Quaternion(p.orientation.x, p.orientation.y, p.orientation.z, p.orientation.w);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);

    const behind = forward.clone().multiplyScalar(-12);
    const desired = new THREE.Vector3(
      p.pos.x + behind.x,
      p.pos.y + behind.y + 4,
      p.pos.z + behind.z,
    );
    const lookAt = new THREE.Vector3(
      p.pos.x + forward.x * 8,
      p.pos.y + forward.y * 8,
      p.pos.z + forward.z * 8,
    );

    camPos.current.lerp(desired, 0.08);
    camLook.current.lerp(lookAt, 0.12);

    // Don't go below ground
    camPos.current.y = Math.max(camPos.current.y, 7);

    camera.position.copy(camPos.current);
    camera.lookAt(camLook.current);
  });

  return null;
}

// ─── Cloud Clusters ───
function Clouds() {
  const clusters = useMemo(() => {
    const result: { x: number; y: number; z: number; spheres: { dx: number; dy: number; dz: number; s: number }[] }[] = [];
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
      const r = 150 + Math.random() * 350;
      const cluster = {
        x: Math.cos(angle) * r,
        y: 100 + Math.random() * 160,
        z: Math.sin(angle) * r,
        spheres: [] as { dx: number; dy: number; dz: number; s: number }[],
      };
      // Larger, more overlapping spheres → reads as a cloud mass
      const count = 5 + Math.floor(Math.random() * 4);
      for (let j = 0; j < count; j++) {
        cluster.spheres.push({
          dx: (Math.random() - 0.5) * 20,
          dy: (Math.random() - 0.5) * 4,
          dz: (Math.random() - 0.5) * 12,
          s: 8 + Math.random() * 14,
        });
      }
      result.push(cluster);
    }
    return result;
  }, []);

  return (
    <>
      {clusters.map((c, ci) => (
        <group key={ci} position={[c.x, c.y, c.z]}>
          {c.spheres.map((sp, si) => (
            <mesh key={si} position={[sp.dx, sp.dy, sp.dz]}>
              <sphereGeometry args={[sp.s, 12, 12]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.55} depthWrite={false} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

// ─── Ground (Ocean) ───
function GroundGrid() {
  return (
    <>
      {/* Ocean surface */}
      <mesh position={[0, -1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2000, 2000]} />
        <meshStandardMaterial color="#1a8caa" roughness={0.3} metalness={0.1} />
      </mesh>
      {/* Wave grid overlay */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2000, 2000, 60, 60]} />
        <meshBasicMaterial color="#3ab8d4" wireframe transparent opacity={0.12} />
      </mesh>
    </>
  );
}

// ==========================================
// 6. Scene (inner Canvas content)
// ==========================================
function Scene({
  playerRef,
  enemiesRef,
  bulletsRef,
  explosionsRef,
  status,
}: {
  playerRef: MutableRefObject<GameState['player']>;
  enemiesRef: MutableRefObject<Enemy[]>;
  bulletsRef: MutableRefObject<Bullet[]>;
  explosionsRef: MutableRefObject<Particle[]>;
  status: GameStatus;
}) {
  return (
    <>
      <color attach="background" args={['#7ec8e3']} />
      <fog attach="fog" args={['#7ec8e3', 200, 800]} />
      <hemisphereLight args={['#b1e1ff', '#3a9960', 0.6]} />
      <directionalLight position={[100, 200, 50]} intensity={1.0} color="#fff5e0" />

      <GroundGrid />
      <Clouds />

      {status !== 'READY' && (
        <>
          <PlayerJet playerRef={playerRef} />
          <ChaseCam playerRef={playerRef} />
        </>
      )}

      {/* Up to 3 enemy slots */}
      <EnemyJet enemiesRef={enemiesRef} index={0} />
      <EnemyJet enemiesRef={enemiesRef} index={1} />
      <EnemyJet enemiesRef={enemiesRef} index={2} />

      <BulletMeshes bulletsRef={bulletsRef} />
      <ExplosionParticles explosionsRef={explosionsRef} />
    </>
  );
}

// ==========================================
// 7. HUD Components
// ==========================================

function Crosshair() {
  return (
    <div
      className="absolute inset-0 z-10 pointer-events-none"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Center dot */}
      <div style={{
        position: 'absolute',
        width: 4,
        height: 4,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.7)',
      }} />
      {/* Top line */}
      <div style={{
        position: 'absolute',
        width: 1,
        height: 16,
        background: 'rgba(255,255,255,0.4)',
        transform: 'translateY(-14px)',
      }} />
      {/* Bottom line */}
      <div style={{
        position: 'absolute',
        width: 1,
        height: 16,
        background: 'rgba(255,255,255,0.4)',
        transform: 'translateY(14px)',
      }} />
      {/* Left line */}
      <div style={{
        position: 'absolute',
        width: 16,
        height: 1,
        background: 'rgba(255,255,255,0.4)',
        transform: 'translateX(-14px)',
      }} />
      {/* Right line */}
      <div style={{
        position: 'absolute',
        width: 16,
        height: 1,
        background: 'rgba(255,255,255,0.4)',
        transform: 'translateX(14px)',
      }} />
    </div>
  );
}

function Radar({ player, enemies }: {
  player: GameState['player'];
  enemies: Enemy[];
}) {
  // Compute player heading on XZ plane from orientation
  const q = new THREE.Quaternion(player.orientation.x, player.orientation.y, player.orientation.z, player.orientation.w);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const heading = Math.atan2(fwd.x, fwd.z);

  const radarR = 50;
  const scale = radarR / CFG.RADAR_RANGE;

  function projectToRadar(target: Vec3): { x: number; y: number; inRange: boolean } {
    const dx = target.x - player.pos.x;
    const dz = target.z - player.pos.z;
    // Rotate by negative heading to make player's forward point up
    const cos = Math.cos(-heading);
    const sin = Math.sin(-heading);
    const rx = dx * cos - dz * sin;
    const ry = -(dx * sin + dz * cos); // negate so forward = up
    const dist = Math.sqrt(rx * rx + ry * ry);
    const inRange = dist * scale < radarR;
    const clampedDist = Math.min(dist * scale, radarR - 3);
    const angle2 = Math.atan2(ry, rx);
    return {
      x: Math.cos(angle2) * clampedDist,
      y: Math.sin(angle2) * clampedDist,
      inRange,
    };
  }

  return (
    <div
      className="absolute top-4 right-4 z-10"
      style={{
        width: radarR * 2 + 20,
        height: radarR * 2 + 20,
        borderRadius: '50%',
        background: 'rgba(0,10,30,0.7)',
        border: '2px solid rgba(0,204,255,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Player dot (center) */}
      <div style={{
        position: 'absolute',
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: '#00ccff',
      }} />
      {/* Enemy dots */}
      {enemies.map(e => {
        const p = projectToRadar(e.pos);
        return (
          <div
            key={e.id}
            style={{
              position: 'absolute',
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: '#ff3300',
              transform: `translate(${p.x}px, ${p.y}px)`,
              opacity: p.inRange ? 1 : 0.4,
            }}
          />
        );
      })}
      {/* Compass N */}
      <div style={{
        position: 'absolute',
        top: 2,
        fontSize: 8,
        color: 'rgba(255,255,255,0.3)',
        fontFamily: 'monospace',
      }}>N</div>
    </div>
  );
}

// ==========================================
// 8. Main Component
// ==========================================
interface Props {
  inputRef: MutableRefObject<NormalizedInput>;
  paused: boolean;
  callbacks: GameCallbacks;
  [key: string]: any;
}

export default function Game9({ inputRef, paused, callbacks }: Props) {
  const { gs, playerRef, enemiesRef, bulletsRef, explosionsRef } = useGameLogic(inputRef, paused, callbacks);
  const { status, player, enemies, phase } = gs;

  const hpPct = player.hp / CFG.PLAYER_HP;
  const ammoPct = player.ammo / player.maxAmmo;
  const speedKmh = Math.floor(player.speed * 500);

  const hpColor = hpPct > 0.6 ? '#00ff66' : hpPct > 0.3 ? '#ffcc00' : '#ff3300';

  return (
    <div className="relative w-full h-screen overflow-hidden select-none" style={{ background: '#7ec8e3' }}>
      {/* R3F Canvas */}
      <Canvas
        camera={{ position: [0, 50, 30], fov: 70, near: 0.1, far: 1000 }}
        gl={{ antialias: false, alpha: false }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Scene
          playerRef={playerRef}
          enemiesRef={enemiesRef}
          bulletsRef={bulletsRef}
          explosionsRef={explosionsRef}
          status={status}
        />
      </Canvas>

      {/* HUD: Playing */}
      {status === 'PLAYING' && (
        <>
          {/* Crosshair */}
          <Crosshair />

          {/* HP Bar — top-left */}
          <div className="absolute top-4 left-4 z-10" style={{ width: 140 }}>
            <div className="text-[10px] font-mono text-white/50 mb-1">HP</div>
            <div style={{
              width: '100%',
              height: 8,
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 4,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${hpPct * 100}%`,
                height: '100%',
                background: hpColor,
                borderRadius: 4,
                transition: 'width 0.2s, background 0.3s',
              }} />
            </div>
            <div className="text-[10px] font-mono mt-0.5" style={{ color: hpColor }}>
              {player.hp}/{CFG.PLAYER_HP}
            </div>
          </div>

          {/* Score + Phase — top-center */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-center">
            <div className="text-2xl font-black tracking-[0.3em] text-white/80 font-mono"
              style={{ textShadow: '0 0 20px rgba(0,204,255,0.5)' }}>
              {player.score.toString().padStart(7, '0')}
            </div>
            <div className="text-[10px] font-mono text-cyan-400/60 mt-0.5">
              PHASE {phase} {' '} KILLS {player.kills}
            </div>
          </div>

          {/* Radar — top-right */}
          <Radar player={player} enemies={enemies} />

          {/* Ammo — bottom-left */}
          <div className="absolute bottom-4 left-4 z-10" style={{ width: 140 }}>
            <div className="text-xs font-mono text-white/60 mb-1">
              AMMO {Math.floor(player.ammo)}/{player.maxAmmo}
            </div>
            <div style={{
              width: '100%',
              height: 6,
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 3,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${ammoPct * 100}%`,
                height: '100%',
                background: ammoPct > 0.3 ? '#00ccff' : '#ff4400',
                borderRadius: 3,
                transition: 'width 0.15s',
              }} />
            </div>
          </div>

          {/* Speed — bottom-center */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-center">
            <div className="text-lg font-bold text-white/70 font-mono tracking-wider">
              {speedKmh} <span className="text-xs text-white/40">km/h</span>
            </div>
          </div>
        </>
      )}

      {/* READY overlay */}
      {status === 'READY' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4"
          style={{ background: 'rgba(10,10,46,0.6)' }}>
          <div className="text-5xl font-black tracking-wider"
            style={{
              color: '#00eeff',
              textShadow: '0 0 30px rgba(0,238,255,0.6), 0 0 60px rgba(0,238,255,0.3)',
            }}>
            SKY FIGHTER
          </div>
          <div className="text-white/30 text-sm tracking-widest animate-pulse font-mono">
            TILT TO FLY &middot; HOLD FIRE TO SHOOT
          </div>
          <div className="flex gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-sm" style={{ background: 'rgba(0,204,255,0.3)', border: '1px solid #00ccff' }} />
              <span className="text-white/40 text-xs">YOUR JET</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-sm" style={{ background: 'rgba(255,51,0,0.3)', border: '1px solid #ff3300' }} />
              <span className="text-white/40 text-xs">ENEMY</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rotate-45" style={{ background: '#ffcc00' }} />
              <span className="text-white/40 text-xs">AMMO</span>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER overlay */}
      {status === 'GAME_OVER' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/60">
          <div className="text-4xl font-black text-red-500 tracking-wider"
            style={{ textShadow: '0 0 30px rgba(239,68,68,0.5)' }}>
            SHOT DOWN
          </div>
          <div className="text-2xl font-bold text-white/80 tracking-widest font-mono">
            {player.score.toString().padStart(7, '0')}
          </div>
          <div className="text-xs text-white/40 font-mono">
            KILLS: {player.kills}
          </div>
          <div className="text-white/30 text-xs tracking-widest mt-2 animate-pulse">
            TAP RESTART
          </div>
        </div>
      )}
    </div>
  );
}
