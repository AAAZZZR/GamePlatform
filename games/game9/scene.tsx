// games/game9/scene.tsx — Sky Fighter 的 3D 畫面（R3F）
// 所有元件都在 useFrame 裡直接讀遊戲狀態、改 three 物件，不走 React 重繪。
'use client';

import React, { useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  COLORS,
  ENEMY,
  ENEMY_PALETTES,
  EnemyKind,
  FLIGHT,
  PLAYER_PALETTE,
  Palette,
} from './config';
import { GameState, clamp } from './sim';

type GameProp = { game: GameState };

export const SUN_DIRECTION = new THREE.Vector3(0.45, 0.55, -0.7).normalize();
export const FOG_NEAR = 350;
export const FOG_FAR = 1400;
const SKY_RADIUS = 1800;

// ==========================================
// 共用幾何（整個模組只建一次，玩家和所有敵機共用）
// ==========================================
interface JetGeometries {
  fuselage: THREE.BufferGeometry;
  wings: THREE.BufferGeometry;
  fins: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
  nozzle: THREE.BufferGeometry;
  glow: THREE.BufferGeometry;
  flame: THREE.BufferGeometry;
}

let jetGeometryCache: JetGeometries | null = null;

function merge(parts: THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)));
  if (!merged) throw new Error(`[SkyFighter] 合併機身幾何失敗：${label}`);
  merged.computeVertexNormals();
  return merged;
}

/** 平面多邊形擠出成薄片；points 是 (x, z)，擠出後躺在 XZ 平面 */
function flatPlate(points: [number, number][], thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, thickness / 2, 0);
  return geo;
}

/** 垂直尾翼；points 是 (z, y) */
function verticalPlate(points: [number, number][], thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2);
  geo.translate(thickness / 2, 0, 0);
  return geo;
}

function mirrorX(points: [number, number][]): [number, number][] {
  return points.map(([x, z]) => [-x, z] as [number, number]).reverse();
}

function getJetGeometries(): JetGeometries {
  if (jetGeometryCache) return jetGeometryCache;

  // 機身：機頭朝 -Z（原本的圓錐是反的，尖端朝後）
  const body = new THREE.CylinderGeometry(0.5, 0.42, 3.0, 8);
  body.rotateX(Math.PI / 2);
  body.translate(0, 0, 0.3);
  const nose = new THREE.ConeGeometry(0.42, 1.6, 8);
  nose.rotateX(-Math.PI / 2);
  nose.translate(0, 0, -2.0);

  const wingRight: [number, number][] = [[0.35, -0.9], [2.7, 0.9], [2.7, 1.35], [0.35, 1.35]];
  const stabRight: [number, number][] = [[0.3, 1.2], [1.35, 1.7], [1.35, 1.95], [0.3, 1.95]];

  const canopy = new THREE.SphereGeometry(0.34, 10, 8);
  canopy.scale(1, 0.75, 2.2);
  canopy.translate(0, 0.33, -0.9);

  const nozzle = new THREE.CylinderGeometry(0.36, 0.44, 0.4, 8, 1, true);
  nozzle.rotateX(Math.PI / 2);
  nozzle.translate(0, 0, 1.95);

  const glow = new THREE.CircleGeometry(0.34, 10);
  glow.translate(0, 0, 2.1);

  // 後燃器火焰：底在原點、尖端朝 +Z，長度靠 scale.z 控制
  const flame = new THREE.ConeGeometry(0.3, 1, 8, 1, true);
  flame.rotateX(Math.PI / 2);
  flame.translate(0, 0, 0.5);

  jetGeometryCache = {
    fuselage: merge([body, nose], 'fuselage'),
    wings: merge([flatPlate(wingRight, 0.08), flatPlate(mirrorX(wingRight), 0.08)], 'wings'),
    fins: merge([
      verticalPlate([[0.55, 0.35], [1.75, 0.35], [1.85, 1.55], [1.35, 1.55]], 0.07),
      flatPlate(stabRight, 0.06),
      flatPlate(mirrorX(stabRight), 0.06),
    ], 'fins'),
    canopy,
    nozzle,
    glow,
    flame,
  };
  return jetGeometryCache;
}

// ==========================================
// 噴射機模型
// ==========================================
interface JetMaterialRefs {
  body: React.RefObject<THREE.MeshStandardMaterial | null>;
  wing: React.RefObject<THREE.MeshStandardMaterial | null>;
  accent: React.RefObject<THREE.MeshStandardMaterial | null>;
  glow: React.RefObject<THREE.MeshBasicMaterial | null>;
}

function JetModel({ palette, refs }: { palette: Palette; refs?: JetMaterialRefs }) {
  const geo = getJetGeometries();
  return (
    <>
      <mesh geometry={geo.fuselage}>
        <meshStandardMaterial ref={refs?.body} color={palette.body} flatShading metalness={0.25} roughness={0.5} />
      </mesh>
      <mesh geometry={geo.wings}>
        <meshStandardMaterial ref={refs?.wing} color={palette.wing} flatShading metalness={0.2} roughness={0.6} />
      </mesh>
      <mesh geometry={geo.fins}>
        <meshStandardMaterial ref={refs?.accent} color={palette.accent} flatShading metalness={0.2} roughness={0.6} />
      </mesh>
      <mesh geometry={geo.canopy}>
        <meshStandardMaterial color="#123247" flatShading metalness={0.6} roughness={0.15} />
      </mesh>
      <mesh geometry={geo.nozzle}>
        <meshStandardMaterial color="#2b2f36" flatShading metalness={0.5} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geo.glow}>
        <meshBasicMaterial ref={refs?.glow} color={palette.glow} toneMapped={false} />
      </mesh>
    </>
  );
}

// ─── 玩家 ─────────────────────────────────────────────────
function PlayerJet({ game }: GameProp) {
  const groupRef = useRef<THREE.Group>(null);
  const flameRef = useRef<THREE.Group>(null);
  const flameMatRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const p = game.player;
    group.visible = game.phase === 'READY' || game.phase === 'PLAYING';
    group.position.copy(p.pos);
    group.quaternion.copy(p.quat);

    // 後燃器：速度越快火焰越長、越橘
    const boost = clamp((p.speed - FLIGHT.CRUISE_SPEED) / (FLIGHT.BOOST_SPEED - FLIGHT.CRUISE_SPEED), 0, 1);
    const flicker = 0.9 + Math.sin(clock.elapsedTime * 47) * 0.1;
    if (flameRef.current) {
      const length = (0.5 + boost * 2.6) * flicker;
      const width = 0.75 + boost * 0.45;
      flameRef.current.scale.set(width, width, length);
    }
    if (flameMatRef.current) {
      flameMatRef.current.color.setRGB(0.35 + boost * 0.65, 0.75 - boost * 0.25, 1 - boost * 0.85);
    }
  });

  const geo = getJetGeometries();
  return (
    <group ref={groupRef}>
      <JetModel palette={PLAYER_PALETTE} />
      <group ref={flameRef} position={[0, 0, 2.1]}>
        <mesh geometry={geo.flame}>
          <meshBasicMaterial
            ref={flameMatRef}
            color="#66ccff"
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

// ─── 敵機 ─────────────────────────────────────────────────
function EnemySlot({ game, index }: GameProp & { index: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const body = useRef<THREE.MeshStandardMaterial>(null);
  const wing = useRef<THREE.MeshStandardMaterial>(null);
  const accent = useRef<THREE.MeshStandardMaterial>(null);
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  const kindRef = useRef<EnemyKind>('scout');

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const e = game.enemies[index];
    if (!e) {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.position.copy(e.pos);
    group.quaternion.copy(e.quat);
    group.scale.setScalar(e.spec.scale);

    // 換了機種才改顏色
    if (kindRef.current !== e.kind) {
      kindRef.current = e.kind;
      const palette = ENEMY_PALETTES[e.kind];
      body.current?.color.set(palette.body);
      wing.current?.color.set(palette.wing);
      accent.current?.color.set(palette.accent);
      glow.current?.color.set(palette.glow);
    }
    // 被打中閃白
    if (body.current) {
      body.current.emissive.setRGB(1, 1, 1);
      body.current.emissiveIntensity = e.flash > 0 ? 1.4 : 0;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <JetModel palette={ENEMY_PALETTES.scout} refs={{ body, wing, accent, glow }} />
    </group>
  );
}

function EnemyFleet({ game }: GameProp) {
  const slots: number[] = [];
  for (let i = 0; i < ENEMY.MAX_SLOTS; i++) slots.push(i);
  return (
    <>
      {slots.map(i => <EnemySlot key={i} game={game} index={i} />)}
    </>
  );
}

// ==========================================
// 曳光彈
// ==========================================
const _dummy = new THREE.Object3D();
const _dir = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);
const TRACER_CAPACITY = 160;

function TracerLayer({ game, enemy }: GameProp & { enemy: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    let n = 0;
    const length = enemy ? 7 : 9;
    const thickness = enemy ? 0.32 : 0.16;
    for (const b of game.bullets) {
      if (!b.active || b.enemy !== enemy || n >= TRACER_CAPACITY) continue;
      _dir.copy(b.vel).normalize();
      _dummy.position.copy(b.pos).addScaledVector(_dir, -length / 2);
      _dummy.quaternion.setFromUnitVectors(_zAxis, _dir);
      _dummy.scale.set(thickness, thickness, length);
      _dummy.updateMatrix();
      mesh.setMatrixAt(n, _dummy.matrix);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, TRACER_CAPACITY]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        color={enemy ? COLORS.enemyTracer : COLORS.playerTracer}
        toneMapped={false}
        transparent
        opacity={0.95}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

// ==========================================
// 爆炸、火花、煙
// ==========================================
const _fade = new THREE.Color();
const BLACK = new THREE.Color(0, 0, 0);

function ParticleLayer({ game, kind }: GameProp & { kind: 'fire' | 'smoke' }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const capacity = kind === 'fire' ? game.fire.items.length : game.smoke.items.length;

  // 第一次 render 前就建立 instanceColor，shader 才會帶顏色
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < capacity; i++) mesh.setColorAt(i, BLACK);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = 0;
  }, [capacity]);

  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const pool = kind === 'fire' ? game.fire : game.smoke;
    let n = 0;
    for (const pt of pool.items) {
      if (!pt.active || n >= capacity) continue;
      const fade = pt.life / pt.maxLife;
      let size = pt.startSize + (pt.endSize - pt.startSize) * (1 - fade);
      // 追蹤鏡頭會穿過留在原地的煙和水花：離鏡頭太近就縮小，不會糊滿畫面
      const cameraDist = pt.pos.distanceTo(camera.position);
      size *= clamp((cameraDist - 2) / 8, 0, 1);
      if (kind === 'fire') {
        // 加法混色：顏色變暗 = 變透明
        _fade.copy(pt.color).multiplyScalar(Math.pow(fade, 1.3));
      } else {
        _fade.copy(pt.color);
        if (fade < 0.3) size *= fade / 0.3;
      }
      _dummy.position.copy(pt.pos);
      _dummy.quaternion.identity();
      _dummy.scale.setScalar(size);
      _dummy.updateMatrix();
      mesh.setMatrixAt(n, _dummy.matrix);
      mesh.setColorAt(n, _fade);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  if (kind === 'fire') {
    return (
      <instancedMesh ref={meshRef} args={[undefined, undefined, capacity]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial
          toneMapped={false}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    );
  }
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, capacity]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 1]} />
      <meshBasicMaterial transparent opacity={0.5} depthWrite={false} />
    </instancedMesh>
  );
}

// ==========================================
// 速度線（開後燃器或俯衝時從畫面邊緣掠過）
// ==========================================
const SPEED_LINE_COUNT = 40;

interface SpeedLine {
  x: number;
  y: number;
  z: number;
}

function createSpeedLines(): SpeedLine[] {
  const lines: SpeedLine[] = [];
  for (let i = 0; i < SPEED_LINE_COUNT; i++) {
    const angle = (i / SPEED_LINE_COUNT) * Math.PI * 2 + (i % 3) * 0.7;
    const radius = 6 + ((i * 37) % 11) * 0.8;
    lines.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.7, z: -((i * 53) % 80) });
  }
  return lines;
}

function SpeedLines({ game }: GameProp) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const linesRef = useRef<SpeedLine[] | null>(null);

  useFrame(({ camera }, delta) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;
    if (!linesRef.current) linesRef.current = createSpeedLines();
    const lines = linesRef.current;

    const p = game.player;
    const flying = game.phase === 'PLAYING';
    const intensity = flying
      ? clamp((p.speed - FLIGHT.CRUISE_SPEED * 1.08) / (FLIGHT.BOOST_SPEED - FLIGHT.CRUISE_SPEED * 1.08), 0, 1)
      : 0;
    mat.color.setScalar(intensity * 0.32);
    mesh.visible = intensity > 0.01;
    if (!mesh.visible) return;

    const dt = Math.min(delta, 0.05);
    const length = 1.5 + intensity * 3.5;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      line.z += p.speed * 1.3 * dt;
      if (line.z > 4) line.z -= 85;
      _dummy.position.set(line.x, line.y, line.z).applyMatrix4(camera.matrixWorld);
      _dummy.quaternion.copy(camera.quaternion);
      _dummy.scale.set(0.025, 0.025, length);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, SPEED_LINE_COUNT]} frustumCulled={false} visible={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        ref={matRef}
        color="#000000"
        toneMapped={false}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        fog={false}
      />
    </instancedMesh>
  );
}

// ==========================================
// 環境：天空、太陽、海面、雲
// ==========================================
function createSkyGeometry(): THREE.SphereGeometry {
  const geo = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
  const zenith = new THREE.Color(COLORS.skyZenith);
  const horizon = new THREE.Color(COLORS.skyHorizon);
  const position = geo.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const h = Math.max(0, position.getY(i) / SKY_RADIUS);
    c.copy(horizon).lerp(zenith, Math.pow(h, 0.55));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

let skyGeometryCache: THREE.SphereGeometry | null = null;
function getSkyGeometry(): THREE.SphereGeometry {
  if (!skyGeometryCache) skyGeometryCache = createSkyGeometry();
  return skyGeometryCache;
}

function SkyDome() {
  const groupRef = useRef<THREE.Group>(null);
  const sunRef = useRef<THREE.Group>(null);

  useFrame(({ camera }) => {
    groupRef.current?.position.copy(camera.position);
    sunRef.current?.lookAt(camera.position);
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={getSkyGeometry()} renderOrder={-2} frustumCulled={false}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={sunRef} position={SUN_DIRECTION.clone().multiplyScalar(SKY_RADIUS * 0.9)}>
        <mesh renderOrder={-1}>
          <circleGeometry args={[105, 24]} />
          <meshBasicMaterial
            color={COLORS.sun}
            transparent
            opacity={0.12}
            fog={false}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh renderOrder={-1}>
          <circleGeometry args={[38, 24]} />
          <meshBasicMaterial color={COLORS.sun} fog={false} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

const GRID_CELL = 50;
const GRID_SIZE = 2000;

function Ocean({ game }: GameProp) {
  const seaRef = useRef<THREE.Mesh>(null);
  const gridRef = useRef<THREE.GridHelper>(null);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const m of materials) {
      m.transparent = true;
      m.opacity = 0.25;
      m.depthWrite = false;
    }
  }, []);

  useFrame(({ camera }) => {
    // 海面跟著鏡頭走（看起來無限大）；格線對齊格子，才不會跟著滑
    const target = game.phase === 'READY' ? game.player.pos : camera.position;
    seaRef.current?.position.set(target.x, 0, target.z);
    gridRef.current?.position.set(
      Math.round(target.x / GRID_CELL) * GRID_CELL,
      0.05,
      Math.round(target.z / GRID_CELL) * GRID_CELL,
    );
  });

  return (
    <>
      <mesh ref={seaRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial color={COLORS.ocean} roughness={0.75} metalness={0} />
      </mesh>
      <gridHelper ref={gridRef} args={[GRID_SIZE, GRID_SIZE / GRID_CELL, COLORS.oceanGrid, COLORS.oceanGrid]} />
    </>
  );
}

/** 固定種子的亂數：每次掛載雲都在一樣的位置，也不違反 render 純度 */
function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

interface Puff {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

function createCloudPuffs(): Puff[] {
  const random = seededRandom(9);
  const puffs: Puff[] = [];
  for (let i = 0; i < 64; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 120 + Math.sqrt(random()) * 1550;
    // 大部分在 110~280 高，少數低雲讓低空飛行有東西掠過
    const low = i % 6 === 0;
    const cx = Math.cos(angle) * radius;
    const cy = low ? 55 + random() * 30 : 110 + random() * 170;
    const cz = Math.sin(angle) * radius;
    const count = 4 + Math.floor(random() * 4);
    const size = low ? 0.6 : 1;
    for (let j = 0; j < count; j++) {
      const s = (9 + random() * 13) * size;
      puffs.push({
        x: cx + (random() - 0.5) * 34 * size,
        y: cy + (random() - 0.5) * 5,
        z: cz + (random() - 0.5) * 22 * size,
        sx: s * 1.3,
        sy: s * 0.62,
        sz: s,
      });
    }
  }
  return puffs;
}

let cloudPuffCache: Puff[] | null = null;
function getCloudPuffs(): Puff[] {
  if (!cloudPuffCache) cloudPuffCache = createCloudPuffs();
  return cloudPuffCache;
}

function Clouds() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const puffs = getCloudPuffs();

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    puffs.forEach((puff, i) => {
      dummy.position.set(puff.x, puff.y, puff.z);
      dummy.scale.set(puff.sx, puff.sy, puff.sz);
      dummy.rotation.set(0, i * 0.7, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [puffs]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, puffs.length]}>
      <icosahedronGeometry args={[1, 2]} />
      <meshLambertMaterial color="#ffffff" emissive="#a9c4d6" emissiveIntensity={0.45} />
    </instancedMesh>
  );
}

// ==========================================
// 整個場景
// ==========================================
export function SkyScene({ game }: GameProp) {
  return (
    <>
      <color attach="background" args={[COLORS.skyHorizon]} />
      <fog attach="fog" args={[COLORS.skyHorizon, FOG_NEAR, FOG_FAR]} />
      <hemisphereLight args={['#dff3ff', '#2f8aa5', 1.1]} />
      <directionalLight
        position={[SUN_DIRECTION.x * 200, SUN_DIRECTION.y * 200, SUN_DIRECTION.z * 200]}
        intensity={1.6}
        color="#fff3dc"
      />

      <SkyDome />
      <Ocean game={game} />
      <Clouds />

      <PlayerJet game={game} />
      <EnemyFleet game={game} />
      <TracerLayer game={game} enemy={false} />
      <TracerLayer game={game} enemy />
      <ParticleLayer game={game} kind="smoke" />
      <ParticleLayer game={game} kind="fire" />
      <SpeedLines game={game} />
    </>
  );
}
