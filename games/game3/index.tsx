// games/game3/index.tsx — Neon Racing (Gameplay Overhaul)
import React, { useEffect, useState, useRef, useCallback, useMemo, MutableRefObject } from 'react';
import { Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { NormalizedInput } from '@/platform/types';
import { sfx } from '@/platform/audio';

/* ── Config ───────────────────────────────────────────────────────── */
const GAME_CONFIG = {
  WIDTH: 800,
  HEIGHT: 600,
  CAR_WIDTH: 40,
  CAR_HEIGHT: 70,
  BASE_SPEED: 3,
  NITRO_SPEED: 14,
  STEER_FACTOR: 2.0,
  ROAD_WIDTH: 360,
  SEGMENT_HEIGHT: 20,
  VISIBLE_SEGMENTS: 42,
  INITIAL_OBSTACLE_CHANCE: 0.08,
  MAX_OBSTACLE_CHANCE: 0.35,
  COIN_CHANCE: 0.25,
  COIN_SIZE: 20,
  COIN_SCORE: 50,
  // Zone durations (in world-distance units, ~20 segments = 400 distance per screen)
  ZONE_LENGTH: 6000,  // change zone every ~6000 distance
};

/* ── Road zone theme types ────────────────────────────────────────── */
type ZoneType = 'city' | 'highway' | 'tunnel';
const ZONE_SEQUENCE: ZoneType[] = ['city', 'highway', 'tunnel'];

function getZone(distance: number): { type: ZoneType; progress: number } {
  const idx = Math.floor(distance / GAME_CONFIG.ZONE_LENGTH) % ZONE_SEQUENCE.length;
  const progress = (distance % GAME_CONFIG.ZONE_LENGTH) / GAME_CONFIG.ZONE_LENGTH;
  return { type: ZONE_SEQUENCE[idx], progress };
}

const ZONE_COLORS: Record<ZoneType, { road1: string; road2: string; edge: string; ground1: string; ground2: string; bg: string; accent: string }> = {
  city:    { road1: '#12122a', road2: '#161638', edge: '#00d4ff', ground1: '#080816', ground2: '#0a0a1e', bg: '#0a0a1a', accent: '#ff00ff' },
  highway: { road1: '#0c1a0c', road2: '#102010', edge: '#00ff88', ground1: '#060c06', ground2: '#081008', bg: '#050a05', accent: '#00ff88' },
  tunnel:  { road1: '#1a1010', road2: '#201414', edge: '#ff6600', ground1: '#0a0606', ground2: '#0c0808', bg: '#0a0505', accent: '#ff6600' },
};

/* ── Road section types for variety ───────────────────────────────── */
type RoadSection = 'straight' | 'gentle_curve' | 'sharp_turn' | 'narrow';

interface RoadSectionDef {
  type: RoadSection;
  startY: number;
  length: number;
  direction: number;   // -1 or 1 for curves
  narrowFactor: number; // 1 = full width, 0.5 = half
}

/* ── Entity types ─────────────────────────────────────────────────── */
type EntityType = 'obstacle' | 'coin' | 'oil_slick' | 'speed_pad' | 'nitro_pickup' | 'multiplier'
  | 'barrier' | 'lane_changer' | 'warning_sign';

interface Entity {
  id: string;
  trackY: number;
  offsetX: number;
  width: number;
  height: number;
  active: boolean;
  type: EntityType;
  // Extra data for special entities
  laneDir?: number;          // lane_changer: -1 or 1
  laneSpeed?: number;        // lane_changer: how fast it moves
  barrierSpan?: number;      // barrier: fraction of road (0.3-0.6)
  barrierSide?: number;      // barrier: -1=left, 0=center, 1=right
}

interface SpeedLine { id: string; x: number; y: number; len: number; opacity: number; }

interface Particle {
  id: string; x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

interface GameState {
  distance: number;
  carX: number;
  carAngle: number;
  isNitro: boolean;
  obstacles: Entity[];
  coins: Entity[];
  speedLines: SpeedLine[];
  particles: Particle[];
  status: 'READY' | 'PLAYING' | 'GAME_OVER';
  score: number;
  coinsCollected: number;
  // New gameplay state
  scoreMultiplier: number;
  multiplierTimer: number;
  slideVelocity: number;      // oil slick sliding
  speedBoostTimer: number;    // speed pad boost
  roadSections: RoadSectionDef[];
}

/* ── Game Logic Hook ──────────────────────────────────────────────── */
function useGameLogic(inputRef: MutableRefObject<NormalizedInput>, paused: boolean = false) {

  // Generate road sections procedurally
  const generateSections = useCallback((startY: number, count: number): RoadSectionDef[] => {
    const sections: RoadSectionDef[] = [];
    let y = startY;
    for (let i = 0; i < count; i++) {
      const difficulty = Math.min(1, y / 15000);
      const roll = Math.random();
      let type: RoadSection;
      let length: number;
      let direction = Math.random() > 0.5 ? 1 : -1;
      let narrowFactor = 1;

      if (roll < 0.25) {
        type = 'straight';
        length = 800 + Math.random() * 600;
      } else if (roll < 0.55) {
        type = 'gentle_curve';
        length = 600 + Math.random() * 800;
      } else if (roll < 0.75 + difficulty * 0.15) {
        type = 'sharp_turn';
        length = 400 + Math.random() * 400;
      } else {
        type = 'narrow';
        length = 300 + Math.random() * 400;
        narrowFactor = 0.55 + Math.random() * 0.2;
      }

      sections.push({ type, startY: y, length, direction, narrowFactor });
      y += length;
    }
    return sections;
  }, []);

  // Get road curve at a given world Y, incorporating sections
  const getRoadCurve = useCallback((y: number, sections: RoadSectionDef[]): number => {
    // Base sine wave for gentle motion
    let curve = Math.sin(y * 0.0008) * 30;

    // Find active section
    for (const sec of sections) {
      if (y < sec.startY || y > sec.startY + sec.length) continue;
      const t = (y - sec.startY) / sec.length; // 0-1 progress through section
      const smoothT = t * t * (3 - 2 * t); // smoothstep

      switch (sec.type) {
        case 'gentle_curve':
          curve += Math.sin(smoothT * Math.PI) * 120 * sec.direction;
          break;
        case 'sharp_turn':
          curve += Math.sin(smoothT * Math.PI) * 200 * sec.direction;
          break;
        case 'narrow':
          // Narrow sections don't curve much
          curve += Math.sin(smoothT * Math.PI * 2) * 30 * sec.direction;
          break;
      }
    }

    // Progressive intensity overlay
    const intensity = Math.min(1, y / 10000);
    curve += Math.sin(y * 0.002) * 40 * intensity;

    return curve;
  }, []);

  // Get road width at a point (for narrow sections)
  const getRoadWidth = useCallback((y: number, sections: RoadSectionDef[]): number => {
    let width = GAME_CONFIG.ROAD_WIDTH;
    for (const sec of sections) {
      if (sec.type !== 'narrow') continue;
      if (y < sec.startY || y > sec.startY + sec.length) continue;
      const t = (y - sec.startY) / sec.length;
      // Smooth in/out of narrow
      const narrowAmount = Math.sin(t * Math.PI);
      width = GAME_CONFIG.ROAD_WIDTH * (1 - narrowAmount * (1 - sec.narrowFactor));
    }
    return width;
  }, []);

  // Get current road section type
  const getCurrentSection = useCallback((y: number, sections: RoadSectionDef[]): RoadSectionDef | null => {
    for (const sec of sections) {
      if (y >= sec.startY && y <= sec.startY + sec.length) return sec;
    }
    return null;
  }, []);

  const createSpeedLines = (): SpeedLine[] =>
    Array.from({ length: 30 }, () => ({
      id: uuidv4(),
      x: Math.random() * GAME_CONFIG.WIDTH,
      y: Math.random() * GAME_CONFIG.HEIGHT,
      len: Math.random() * 60 + 30,
      opacity: 0
    }));

  const initialSections = generateSections(0, 20);

  const getInitialState = (): GameState => ({
    distance: 0, carX: 0, carAngle: 0, isNitro: false,
    obstacles: [], coins: [], speedLines: createSpeedLines(),
    particles: [],
    status: 'READY', score: 0, coinsCollected: 0,
    scoreMultiplier: 1,
    multiplierTimer: 0,
    slideVelocity: 0,
    speedBoostTimer: 0,
    roadSections: initialSections,
  });

  const [gameState, setGameState] = useState<GameState>(getInitialState());
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const localInputRef = useRef({ nitro: false });
  const obstacleSpawnCounter = useRef(0);

  const setNitro = useCallback((active: boolean) => {
    localInputRef.current.nitro = active;
  }, []);

  const startGame = useCallback(() => {
    setGameState(prev => ({ ...prev, status: 'PLAYING' }));
  }, []);

  const resetGame = useCallback(() => {
    const freshSections = generateSections(0, 20);
    setGameState({ ...getInitialState(), roadSections: freshSections });
    localInputRef.current = { nitro: false };
    obstacleSpawnCounter.current = 0;
  }, [generateSections]);

  useEffect(() => {
    let loopId: number;

    const loop = () => {
      if (stateRef.current.status === 'PLAYING' && !paused) {
        const current = stateRef.current;
        const steer = inputRef.current.move.x * GAME_CONFIG.STEER_FACTOR;
        const nitro = localInputRef.current.nitro;
        const sections = current.roadSections;

        // Speed with difficulty progression
        const gameTime = current.distance / 500;
        const speedBonus = Math.min(gameTime * 0.15, 6);
        let speed = (nitro ? GAME_CONFIG.NITRO_SPEED : GAME_CONFIG.BASE_SPEED) + speedBonus;

        // Speed pad boost
        if (current.speedBoostTimer > 0) {
          speed += 4;
        }

        // Highway zone = faster
        const zone = getZone(current.distance);
        if (zone.type === 'highway') speed += 2;
        // Tunnel zone = slightly slower base
        if (zone.type === 'tunnel') speed -= 0.5;

        const obstacleChance = Math.min(
          GAME_CONFIG.INITIAL_OBSTACLE_CHANCE + gameTime * 0.008,
          GAME_CONFIG.MAX_OBSTACLE_CHANCE
        );

        const rad = (steer * Math.PI) / 180;
        const dx = Math.sin(rad) * speed;
        const dy = Math.cos(rad) * speed;

        // Apply slide velocity from oil slicks
        let slideV = current.slideVelocity * 0.96; // friction decay
        if (Math.abs(slideV) < 0.1) slideV = 0;

        let newCarX = current.carX + dx + slideV;
        const newDistance = current.distance + dy;

        // Decrement timers
        let newMultTimer = Math.max(0, current.multiplierTimer - 1);
        let newMultiplier = newMultTimer > 0 ? current.scoreMultiplier : 1;
        let newBoostTimer = Math.max(0, current.speedBoostTimer - 1);

        // Generate more road sections if needed
        let newSections = sections;
        const lastSection = sections[sections.length - 1];
        if (lastSection && newDistance + GAME_CONFIG.HEIGHT * 2 > lastSection.startY) {
          const moreSections = generateSections(
            lastSection.startY + lastSection.length, 10
          );
          newSections = [...sections.filter(s => s.startY + s.length > newDistance - 2000), ...moreSections];
        }

        // Spawn entities
        let newObstacles = current.obstacles.filter(o => o.trackY > newDistance - 100);
        let newCoins = current.coins.filter(c => c.trackY > newDistance - 100);

        if (Math.floor(newDistance / 80) > obstacleSpawnCounter.current) {
          obstacleSpawnCounter.current = Math.floor(newDistance / 80);
          const spawnY = newDistance + GAME_CONFIG.HEIGHT + 200;
          const spawnRoadW = getRoadWidth(spawnY, newSections);
          const currentSec = getCurrentSection(spawnY, newSections);
          const difficulty = Math.min(1, newDistance / 15000);

          // --- Obstacle variety ---
          if (Math.random() < obstacleChance) {
            const obsRoll = Math.random();

            if (obsRoll < 0.45) {
              // Normal static obstacle car
              const offset = (Math.random() * (spawnRoadW - 60)) - (spawnRoadW / 2 - 30);
              newObstacles.push({
                id: uuidv4(), trackY: spawnY, offsetX: offset,
                width: 44, height: 44, active: true, type: 'obstacle'
              });
            } else if (obsRoll < 0.65) {
              // Lane-changing car
              const offset = (Math.random() * (spawnRoadW - 80)) - (spawnRoadW / 2 - 40);
              newObstacles.push({
                id: uuidv4(), trackY: spawnY, offsetX: offset,
                width: 44, height: 44, active: true, type: 'lane_changer',
                laneDir: Math.random() > 0.5 ? 1 : -1,
                laneSpeed: 0.8 + Math.random() * 1.2,
              });
            } else if (obsRoll < 0.80) {
              // Barrier spanning partial width
              const side = Math.random() > 0.5 ? 1 : (Math.random() > 0.5 ? -1 : 0);
              const span = 0.3 + Math.random() * 0.3;
              const bw = spawnRoadW * span;
              let bOffset = 0;
              if (side === -1) bOffset = -(spawnRoadW / 2 - bw / 2) + 10;
              else if (side === 1) bOffset = (spawnRoadW / 2 - bw / 2) - 10;
              newObstacles.push({
                id: uuidv4(), trackY: spawnY, offsetX: bOffset,
                width: bw, height: 16, active: true, type: 'barrier',
                barrierSpan: span, barrierSide: side,
              });
            } else {
              // Oil slick
              const offset = (Math.random() * (spawnRoadW - 60)) - (spawnRoadW / 2 - 30);
              newObstacles.push({
                id: uuidv4(), trackY: spawnY, offsetX: offset,
                width: 50, height: 30, active: true, type: 'oil_slick'
              });
            }
          }

          // --- Warning signs before sharp turns ---
          if (currentSec && currentSec.type === 'sharp_turn') {
            const turnProgress = (spawnY - currentSec.startY) / currentSec.length;
            if (turnProgress < 0.15 && Math.random() < 0.5) {
              newObstacles.push({
                id: uuidv4(), trackY: spawnY,
                offsetX: -(spawnRoadW / 2 + 40) * currentSec.direction,
                width: 30, height: 30, active: true, type: 'warning_sign',
              });
            }
          }

          // --- Coins and collectibles ---
          const collectRoll = Math.random();
          if (collectRoll < GAME_CONFIG.COIN_CHANCE) {
            // Coin trail along the curve (spawn 3-5 coins in a row)
            const trailCount = 2 + Math.floor(Math.random() * 4);
            for (let ci = 0; ci < trailCount; ci++) {
              const trailY = spawnY + ci * 50;
              const trailCurve = getRoadCurve(trailY, newSections);
              // Offset along the curve path
              const coinOff = (Math.random() * 0.4 - 0.2) * getRoadWidth(trailY, newSections);
              newCoins.push({
                id: uuidv4(), trackY: trailY, offsetX: coinOff,
                width: GAME_CONFIG.COIN_SIZE, height: GAME_CONFIG.COIN_SIZE,
                active: true, type: 'coin'
              });
            }
          } else if (collectRoll < GAME_CONFIG.COIN_CHANCE + 0.06) {
            // Speed pad
            const offset = (Math.random() * (spawnRoadW - 60)) - (spawnRoadW / 2 - 30);
            newCoins.push({
              id: uuidv4(), trackY: spawnY, offsetX: offset,
              width: 40, height: 60, active: true, type: 'speed_pad'
            });
          } else if (collectRoll < GAME_CONFIG.COIN_CHANCE + 0.10 && difficulty > 0.2) {
            // Nitro pickup
            const offset = (Math.random() * (spawnRoadW - 40)) - (spawnRoadW / 2 - 20);
            newCoins.push({
              id: uuidv4(), trackY: spawnY, offsetX: offset,
              width: 24, height: 24, active: true, type: 'nitro_pickup'
            });
          } else if (collectRoll < GAME_CONFIG.COIN_CHANCE + 0.13 && difficulty > 0.3) {
            // Score multiplier
            const offset = (Math.random() * (spawnRoadW - 40)) - (spawnRoadW / 2 - 20);
            newCoins.push({
              id: uuidv4(), trackY: spawnY, offsetX: offset,
              width: 22, height: 22, active: true, type: 'multiplier'
            });
          }
        }

        // Update lane-changing obstacles
        for (const obs of newObstacles) {
          if (obs.type === 'lane_changer' && obs.active) {
            const rw = getRoadWidth(obs.trackY, newSections);
            obs.offsetX += (obs.laneDir ?? 1) * (obs.laneSpeed ?? 1);
            // Bounce off road edges
            if (obs.offsetX > rw / 2 - 30) { obs.laneDir = -1; }
            if (obs.offsetX < -rw / 2 + 30) { obs.laneDir = 1; }
          }
        }

        // Collision detection
        let isGameOver = false;
        const currentRoadCX = getRoadCurve(newDistance, newSections);
        const currentRoadW = getRoadWidth(newDistance, newSections);

        let newParticles = current.particles
          .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 1 }))
          .filter(p => p.life > 0);

        // Off-road check
        if (newCarX < currentRoadCX - currentRoadW / 2 + 20 ||
            newCarX > currentRoadCX + currentRoadW / 2 - 20) {
          isGameOver = true;
        }

        // Obstacle collisions
        for (const obs of newObstacles) {
          if (!obs.active) continue;
          const obsWorldX = getRoadCurve(obs.trackY, newSections) + obs.offsetX;
          const relY = obs.trackY - newDistance;

          if (obs.type === 'warning_sign') continue; // no collision

          const collisionX = Math.abs(newCarX - obsWorldX) < (GAME_CONFIG.CAR_WIDTH / 2 + obs.width / 2);
          const collisionY = Math.abs(0 - relY) < (GAME_CONFIG.CAR_HEIGHT / 2 + obs.height / 2);

          if (collisionX && collisionY) {
            if (obs.type === 'oil_slick') {
              // Oil slick: cause sliding
              obs.active = false;
              slideV = (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random() * 4);
              // Yellow spray particles
              const oilScreenX = GAME_CONFIG.WIDTH / 2 + obsWorldX;
              for (let i = 0; i < 10; i++) {
                newParticles.push({
                  id: uuidv4(),
                  x: oilScreenX + (Math.random() - 0.5) * 40,
                  y: GAME_CONFIG.HEIGHT - 80 + (Math.random() - 0.5) * 20,
                  vx: (Math.random() - 0.5) * 4,
                  vy: (Math.random() - 0.5) * 3,
                  life: 15 + Math.random() * 10,
                  maxLife: 25,
                  color: '#8B8000',
                  size: 3 + Math.random() * 3,
                });
              }
            } else {
              // obstacle, lane_changer, barrier => crash
              isGameOver = true;
              const carScreenX = GAME_CONFIG.WIDTH / 2 + newCarX;
              for (let i = 0; i < 20; i++) {
                newParticles.push({
                  id: uuidv4(),
                  x: carScreenX + (Math.random() - 0.5) * 40,
                  y: GAME_CONFIG.HEIGHT - 80 + (Math.random() - 0.5) * 30,
                  vx: (Math.random() - 0.5) * 8,
                  vy: (Math.random() - 0.5) * 8,
                  life: 30 + Math.random() * 20, maxLife: 50,
                  color: ['#ff0040', '#ff6600', '#ffcc00', '#ff00ff'][Math.floor(Math.random() * 4)],
                  size: 3 + Math.random() * 5,
                });
              }
            }
          }
        }

        // Collectible collisions
        let coinsAdd = 0;
        for (const coin of newCoins) {
          if (!coin.active) continue;
          const coinWorldX = getRoadCurve(coin.trackY, newSections) + coin.offsetX;
          const relY = coin.trackY - newDistance;
          const hitX = Math.abs(newCarX - coinWorldX) < (GAME_CONFIG.CAR_WIDTH / 2 + coin.width / 2);
          const hitY = Math.abs(0 - relY) < (GAME_CONFIG.CAR_HEIGHT / 2 + coin.height / 2);

          if (hitX && hitY) {
            coin.active = false;
            const coinScreenX = GAME_CONFIG.WIDTH / 2 + coinWorldX;

            if (coin.type === 'coin') {
              coinsAdd++;
              sfx.coin();
              for (let i = 0; i < 8; i++) {
                newParticles.push({
                  id: uuidv4(), x: coinScreenX,
                  y: GAME_CONFIG.HEIGHT - relY,
                  vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5 - 2,
                  life: 20 + Math.random() * 10, maxLife: 30,
                  color: ['#fde047', '#fbbf24', '#ffffff'][Math.floor(Math.random() * 3)],
                  size: 2 + Math.random() * 3,
                });
              }
            } else if (coin.type === 'speed_pad') {
              newBoostTimer = 90; // ~1.5 seconds boost
              sfx.nitroOn();
              for (let i = 0; i < 12; i++) {
                newParticles.push({
                  id: uuidv4(), x: coinScreenX,
                  y: GAME_CONFIG.HEIGHT - relY,
                  vx: (Math.random() - 0.5) * 6, vy: -3 - Math.random() * 4,
                  life: 20 + Math.random() * 10, maxLife: 30,
                  color: ['#00ff88', '#00ffcc', '#ffffff'][Math.floor(Math.random() * 3)],
                  size: 3 + Math.random() * 3,
                });
              }
            } else if (coin.type === 'nitro_pickup') {
              // Grant short nitro burst
              localInputRef.current.nitro = true;
              sfx.nitroOn();
              setTimeout(() => { localInputRef.current.nitro = false; sfx.nitroOff(); }, 2000);
              for (let i = 0; i < 10; i++) {
                newParticles.push({
                  id: uuidv4(), x: coinScreenX,
                  y: GAME_CONFIG.HEIGHT - relY,
                  vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 3,
                  life: 25, maxLife: 25,
                  color: ['#ff6600', '#ffcc00', '#ff3300'][Math.floor(Math.random() * 3)],
                  size: 3 + Math.random() * 4,
                });
              }
            } else if (coin.type === 'multiplier') {
              newMultiplier = Math.min(current.scoreMultiplier + 1, 5);
              newMultTimer = 300; // ~5 seconds
              sfx.powerup();
              for (let i = 0; i < 15; i++) {
                newParticles.push({
                  id: uuidv4(), x: coinScreenX,
                  y: GAME_CONFIG.HEIGHT - relY,
                  vx: (Math.random() - 0.5) * 7, vy: (Math.random() - 0.5) * 7,
                  life: 30, maxLife: 30,
                  color: ['#ff00ff', '#ff66ff', '#ffffff', '#cc00ff'][Math.floor(Math.random() * 4)],
                  size: 2 + Math.random() * 4,
                });
              }
            }
          }
        }

        // Exhaust trail particles
        if (Math.random() < (nitro ? 0.8 : 0.3)) {
          const carScreenX = GAME_CONFIG.WIDTH / 2 + newCarX;
          newParticles.push({
            id: uuidv4(),
            x: carScreenX + (Math.random() - 0.5) * 10,
            y: GAME_CONFIG.HEIGHT - 45,
            vx: (Math.random() - 0.5) * 1.5, vy: 2 + Math.random() * 3,
            life: nitro ? 25 : 15, maxLife: nitro ? 25 : 15,
            color: nitro ? ['#ff6600', '#ffcc00', '#ff0040'][Math.floor(Math.random() * 3)] : '#6366f1',
            size: nitro ? 4 + Math.random() * 4 : 2 + Math.random() * 2,
          });
        }

        if (newParticles.length > 150) newParticles = newParticles.slice(-150);

        // Speed lines
        const newSpeedLines = current.speedLines.map(sl => ({
          ...sl,
          y: sl.y + speed * 2.5,
          opacity: nitro ? Math.min(sl.opacity + 0.12, 0.9)
            : (speed > 5 ? Math.min(sl.opacity + 0.03, 0.3) : Math.max(sl.opacity - 0.05, 0)),
          ...(sl.y > GAME_CONFIG.HEIGHT ? { y: 0, x: Math.random() * GAME_CONFIG.WIDTH } : {})
        }));

        if (isGameOver) sfx.crash();

        setGameState(prev => ({
          ...prev,
          distance: newDistance,
          carX: newCarX,
          carAngle: Math.max(-25, Math.min(25, steer * 0.3)),
          isNitro: nitro,
          obstacles: newObstacles,
          coins: newCoins.filter(c => c.active),
          speedLines: newSpeedLines,
          particles: newParticles,
          status: isGameOver ? 'GAME_OVER' : 'PLAYING',
          score: (Math.floor(newDistance / 10) + prev.coinsCollected * GAME_CONFIG.COIN_SCORE) * newMultiplier,
          coinsCollected: prev.coinsCollected + coinsAdd,
          scoreMultiplier: newMultiplier,
          multiplierTimer: newMultTimer,
          slideVelocity: slideV,
          speedBoostTimer: newBoostTimer,
          roadSections: newSections,
        }));
      }
      loopId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(loopId);
  }, [paused, getRoadCurve, getRoadWidth, getCurrentSection, generateSections]);

  // Wrapper to match old signature
  const getCurve = useCallback((y: number) => {
    return getRoadCurve(y, stateRef.current.roadSections);
  }, [getRoadCurve]);

  const getWidth = useCallback((y: number) => {
    return getRoadWidth(y, stateRef.current.roadSections);
  }, [getRoadWidth]);

  return { gameState, setNitro, startGame, resetGame, getRoadCurve: getCurve, getRoadWidth: getWidth };
}

/* ── SVG-based inline neon car ────────────────────────────────────── */
const NeonCar = ({ isNitro }: { isNitro: boolean }) => {
  const bodyColor = isNitro ? '#ff6600' : '#00d4ff';
  const glowColor = isNitro ? '#ff6600' : '#00d4ff';
  return (
    <svg width="40" height="70" viewBox="0 0 40 70" style={{ display: 'block' }}>
      <defs>
        <filter id="carGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isNitro ? '#ffaa00' : '#00eeff'} />
          <stop offset="100%" stopColor={isNitro ? '#cc4400' : '#0066cc'} />
        </linearGradient>
        <linearGradient id="windshield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(150,220,255,0.9)" />
          <stop offset="100%" stopColor="rgba(80,160,220,0.4)" />
        </linearGradient>
      </defs>
      <rect x="4" y="5" width="32" height="60" rx="6" ry="8" fill="none"
        stroke={glowColor} strokeWidth="2" filter="url(#carGlow)" opacity="0.8" />
      <rect x="5" y="6" width="30" height="58" rx="5" ry="7" fill="url(#bodyGrad)" />
      <line x1="10" y1="8" x2="10" y2="22" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <line x1="30" y1="8" x2="30" y2="22" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <rect x="9" y="24" width="22" height="14" rx="2" fill="url(#windshield)"
        stroke="rgba(200,240,255,0.5)" strokeWidth="0.5" />
      <line x1="12" y1="26" x2="18" y2="36" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      <rect x="11" y="40" width="18" height="10" rx="2" fill="rgba(0,0,0,0.25)" />
      <rect x="12" y="41" width="16" height="7" rx="1" fill="rgba(100,180,220,0.3)"
        stroke="rgba(150,200,240,0.3)" strokeWidth="0.5" />
      <rect x="7" y="6" width="8" height="4" rx="1" fill="#ffffff" opacity="0.95" filter="url(#carGlow)" />
      <rect x="25" y="6" width="8" height="4" rx="1" fill="#ffffff" opacity="0.95" filter="url(#carGlow)" />
      <rect x="7" y="58" width="7" height="4" rx="1" fill="#ff0040" filter="url(#carGlow)" />
      <rect x="26" y="58" width="7" height="4" rx="1" fill="#ff0040" filter="url(#carGlow)" />
      <rect x="1" y="26" width="4" height="6" rx="1" fill={bodyColor} opacity="0.7" />
      <rect x="35" y="26" width="4" height="6" rx="1" fill={bodyColor} opacity="0.7" />
      <rect x="2" y="10" width="4" height="12" rx="2" fill="#1a1a2e" stroke="#444" strokeWidth="0.5" />
      <rect x="34" y="10" width="4" height="12" rx="2" fill="#1a1a2e" stroke="#444" strokeWidth="0.5" />
      <rect x="2" y="48" width="4" height="12" rx="2" fill="#1a1a2e" stroke="#444" strokeWidth="0.5" />
      <rect x="34" y="48" width="4" height="12" rx="2" fill="#1a1a2e" stroke="#444" strokeWidth="0.5" />
      <rect x="6" y="64" width="28" height="2" rx="1" fill={glowColor} opacity="0.6" filter="url(#carGlow)" />
    </svg>
  );
};

/* ── SVG obstacle car ─────────────────────────────────────────────── */
const ObstacleCar = ({ seed }: { seed: number }) => {
  const colors = ['#ff0040', '#ff00ff', '#ff6600', '#cc00ff'];
  const color = colors[seed % colors.length];
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" style={{ display: 'block' }}>
      <defs>
        <filter id={`obsGlow${seed % 4}`}>
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect x="4" y="2" width="36" height="40" rx="4" fill={color} opacity="0.85" />
      <rect x="4" y="2" width="36" height="40" rx="4" fill="none"
        stroke={color} strokeWidth="1.5" filter={`url(#obsGlow${seed % 4})`} opacity="0.9" />
      <line x1="8" y1="8" x2="36" y2="36" stroke="rgba(0,0,0,0.4)" strokeWidth="3" />
      <line x1="8" y1="16" x2="28" y2="36" stroke="rgba(0,0,0,0.4)" strokeWidth="3" />
      <line x1="16" y1="8" x2="36" y2="28" stroke="rgba(0,0,0,0.4)" strokeWidth="3" />
      <rect x="14" y="14" width="16" height="16" rx="2" fill="none"
        stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      <circle cx="9" cy="7" r="2" fill="#fff" opacity="0.8" />
      <circle cx="35" cy="7" r="2" fill="#fff" opacity="0.8" />
      <circle cx="9" cy="37" r="2" fill="#ff0" opacity="0.6" />
      <circle cx="35" cy="37" r="2" fill="#ff0" opacity="0.6" />
    </svg>
  );
};

/* ── Props ────────────────────────────────────────────────────────── */
interface Props {
  inputRef: MutableRefObject<NormalizedInput>;
  socket: Socket;
  roomId: string;
  onExit?: () => void;
  paused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onScoreChange?: (score: number) => void;
  onStatusChange?: (status: any) => void;
  settings?: any;
  [key: string]: any;
}

/* ── Main Component ───────────────────────────────────────────────── */
export default function Game3({ inputRef, socket, roomId, paused = false, onPause, onResume, onScoreChange, onStatusChange }: Props) {
  const { gameState, setNitro, startGame, resetGame, getRoadCurve, getRoadWidth } = useGameLogic(inputRef, paused);
  const { distance, carX, carAngle, obstacles, coins, speedLines, particles, status, score,
    isNitro, coinsCollected, scoreMultiplier, multiplierTimer, speedBoostTimer } = gameState;

  useEffect(() => { if (onScoreChange) onScoreChange(score); }, [score, onScoreChange]);
  useEffect(() => { if (onStatusChange) onStatusChange(status); }, [status, onStatusChange]);

  useEffect(() => {
    const handleAction = (payload: any) => {
      const action = typeof payload === 'string' ? payload : payload.action;
      if (action === 'nitro-start') { setNitro(true); sfx.nitroOn(); }
      if (action === 'nitro-end') { setNitro(false); sfx.nitroOff(); }
      if (action === 'start-game') startGame();
      if (action === 'restart-game') resetGame();
      if (action === 'pause') onPause?.();
      if (action === 'resume') onResume?.();
    };
    socket.on('controller-action', handleAction);
    socket.emit('sync-game-status', { roomId, status });
    return () => { socket.off('controller-action'); };
  }, [socket, roomId, setNitro, resetGame, status, onPause, onResume, startGame]);

  // Current zone for theming
  const zone = getZone(distance);
  const zoneColors = ZONE_COLORS[zone.type];

  const roadSegments = useMemo(() => {
    const segments = [];
    for (let i = 0; i < GAME_CONFIG.VISIBLE_SEGMENTS; i++) {
      const yOffset = i * GAME_CONFIG.SEGMENT_HEIGHT;
      const worldY = distance + yOffset;
      const roadCX = getRoadCurve(worldY);
      const roadW = getRoadWidth(worldY);
      const isMarking = Math.floor((distance + yOffset) / 60) % 2 === 0;
      segments.push({ key: i, bottom: yOffset, centerX: roadCX, width: roadW, isMarking, worldY });
    }
    return segments;
  }, [distance, getRoadCurve, getRoadWidth]);

  // Roadside elements
  const roadsideElements = useMemo(() => {
    const elems: { key: string; side: 'left' | 'right'; bottom: number; x: number; type: 'lamp' | 'barrier' | 'building' }[] = [];
    for (const seg of roadSegments) {
      const worldIdx = Math.floor(seg.worldY / GAME_CONFIG.SEGMENT_HEIGHT);
      if (worldIdx % 8 === 0) {
        const leftX = GAME_CONFIG.WIDTH / 2 + seg.centerX - seg.width / 2 - 30;
        const rightX = GAME_CONFIG.WIDTH / 2 + seg.centerX + seg.width / 2 + 10;
        elems.push({ key: `lampL${seg.key}`, side: 'left', bottom: seg.bottom, x: leftX, type: 'lamp' });
        elems.push({ key: `lampR${seg.key}`, side: 'right', bottom: seg.bottom, x: rightX, type: 'lamp' });
      }
      if (worldIdx % 15 === 0 && zone.type === 'city') {
        const bLeftX = GAME_CONFIG.WIDTH / 2 + seg.centerX - seg.width / 2 - 90;
        const bRightX = GAME_CONFIG.WIDTH / 2 + seg.centerX + seg.width / 2 + 40;
        elems.push({ key: `bldgL${seg.key}`, side: 'left', bottom: seg.bottom, x: bLeftX, type: 'building' });
        elems.push({ key: `bldgR${seg.key}`, side: 'right', bottom: seg.bottom, x: bRightX, type: 'building' });
      }
    }
    return elems;
  }, [roadSegments, zone.type]);

  const screenCenterX = GAME_CONFIG.WIDTH / 2;
  const speed = GAME_CONFIG.BASE_SPEED + Math.min((distance / 500) * 0.15, 6)
    + (isNitro ? GAME_CONFIG.NITRO_SPEED - GAME_CONFIG.BASE_SPEED : 0)
    + (speedBoostTimer > 0 ? 4 : 0)
    + (zone.type === 'highway' ? 2 : 0);
  const speedKmh = Math.floor(speed * 18);

  // Zone label
  const zoneLabel = zone.type === 'city' ? 'CITY' : zone.type === 'highway' ? 'HIGHWAY' : 'TUNNEL';
  const showZoneTransition = zone.progress < 0.05; // first 5% of zone

  return (
    <div className="relative w-full h-screen overflow-hidden flex items-center justify-center font-mono select-none"
      style={{ background: '#050510' }}>

      {/* ── Neon HUD: Score ── */}
      <div className="absolute top-4 left-4 z-30" style={{
        background: 'rgba(0,0,0,0.6)',
        border: '1px solid rgba(0,212,255,0.4)',
        borderRadius: 8,
        padding: '8px 16px',
        boxShadow: '0 0 15px rgba(0,212,255,0.2), inset 0 0 15px rgba(0,212,255,0.05)',
      }}>
        <div style={{ color: '#00d4ff', fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.7 }}>Score</div>
        <div style={{
          color: '#fff', fontSize: 28, fontWeight: 'bold',
          textShadow: '0 0 10px #00d4ff, 0 0 20px #00d4ff',
          fontFamily: 'monospace',
        }}>{score.toLocaleString()}</div>
        {/* Multiplier badge */}
        {scoreMultiplier > 1 && (
          <div style={{
            color: '#ff00ff', fontSize: 14, fontWeight: 'bold',
            textShadow: '0 0 8px #ff00ff',
            animation: 'pulse 0.5s infinite',
          }}>x{scoreMultiplier}</div>
        )}
      </div>

      {/* ── Neon HUD: Speed ── */}
      <div className="absolute top-4 z-30" style={{
        left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.6)',
        border: `1px solid ${isNitro ? 'rgba(255,102,0,0.6)' : `${zoneColors.edge}66`}`,
        borderRadius: 8,
        padding: '6px 20px',
        boxShadow: isNitro
          ? '0 0 20px rgba(255,102,0,0.3), inset 0 0 15px rgba(255,102,0,0.05)'
          : `0 0 15px ${zoneColors.edge}33, inset 0 0 15px ${zoneColors.edge}08`,
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}>
        <div style={{
          color: isNitro ? '#ff6600' : zoneColors.edge,
          fontSize: 32, fontWeight: 'bold',
          textShadow: isNitro ? '0 0 15px #ff6600, 0 0 30px #ff3300' : `0 0 10px ${zoneColors.edge}`,
          fontFamily: 'monospace', transition: 'color 0.3s',
        }}>
          {speedKmh} <span style={{ fontSize: 12, opacity: 0.6 }}>km/h</span>
        </div>
        {isNitro && <div style={{ color: '#ff6600', fontSize: 9, letterSpacing: 4, textAlign: 'center', opacity: 0.9, textShadow: '0 0 8px #ff6600' }}>NITRO</div>}
        {speedBoostTimer > 0 && !isNitro && <div style={{ color: '#00ff88', fontSize: 9, letterSpacing: 4, textAlign: 'center', opacity: 0.9, textShadow: '0 0 8px #00ff88' }}>BOOST</div>}
      </div>

      {/* ── Neon HUD: Coins ── */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2" style={{
        background: 'rgba(0,0,0,0.6)',
        border: '1px solid rgba(251,191,36,0.4)',
        borderRadius: 20, padding: '6px 14px',
        boxShadow: '0 0 12px rgba(251,191,36,0.2)',
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%',
          background: 'radial-gradient(circle, #fde047, #f59e0b)',
          boxShadow: '0 0 8px rgba(251,191,36,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 'bold', color: '#92400e',
        }}>$</div>
        <span style={{
          color: '#fbbf24', fontWeight: 'bold', fontSize: 16,
          textShadow: '0 0 8px rgba(251,191,36,0.6)', fontFamily: 'monospace',
        }}>{coinsCollected}</span>
      </div>

      {/* ── Zone transition banner ── */}
      {showZoneTransition && status === 'PLAYING' && (
        <div className="absolute z-40" style={{
          top: '20%', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.8)',
          border: `2px solid ${zoneColors.edge}`,
          borderRadius: 12, padding: '12px 32px',
          boxShadow: `0 0 30px ${zoneColors.edge}66`,
          animation: 'pulse 1s ease-out',
        }}>
          <div style={{
            color: zoneColors.edge, fontSize: 10, letterSpacing: 6,
            textTransform: 'uppercase', textAlign: 'center', opacity: 0.7,
          }}>ENTERING</div>
          <div style={{
            color: '#fff', fontSize: 28, fontWeight: 'bold',
            textShadow: `0 0 15px ${zoneColors.edge}`,
            textAlign: 'center', letterSpacing: 4,
          }}>{zoneLabel}</div>
        </div>
      )}

      {/* ── Main game viewport ── */}
      <div className="relative overflow-hidden"
        style={{
          width: GAME_CONFIG.WIDTH, height: GAME_CONFIG.HEIGHT,
          background: zone.type === 'tunnel'
            ? 'linear-gradient(180deg, #0a0505 0%, #120808 40%, #1a0c0c 100%)'
            : zone.type === 'highway'
              ? 'linear-gradient(180deg, #050a05 0%, #081008 40%, #0a1a0a 100%)'
              : 'linear-gradient(180deg, #0a0a1a 0%, #0d1025 40%, #101530 100%)',
          borderRadius: 4,
          border: `1px solid ${zoneColors.edge}25`,
          boxShadow: `0 0 40px ${zoneColors.edge}14, inset 0 0 60px rgba(0,0,0,0.5)`,
          transition: 'background 2s ease',
        }}>

        {/* ── Stars / background ── */}
        {zone.type !== 'tunnel' && (
          <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.3 }}>
            {Array.from({ length: 30 }, (_, i) => (
              <div key={`star${i}`} className="absolute rounded-full" style={{
                width: i % 3 === 0 ? 2 : 1, height: i % 3 === 0 ? 2 : 1,
                left: `${(i * 37 + 13) % 100}%`, top: `${(i * 23 + 7) % 50}%`,
                background: '#fff',
                boxShadow: i % 5 === 0 ? `0 0 4px ${zoneColors.edge}` : 'none',
                animation: i % 4 === 0 ? 'pulse 2s infinite' : 'none',
              }} />
            ))}
          </div>
        )}

        {/* ── Tunnel ceiling effect ── */}
        {zone.type === 'tunnel' && (
          <>
            <div className="absolute inset-x-0 top-0 pointer-events-none" style={{
              height: '50%',
              background: 'linear-gradient(180deg, rgba(20,8,8,0.95) 0%, transparent 100%)',
            }} />
            {/* Tunnel lights */}
            {Array.from({ length: 6 }, (_, i) => (
              <div key={`tl${i}`} className="absolute pointer-events-none" style={{
                top: `${10 + i * 15}%`, left: '50%', transform: 'translateX(-50%)',
                width: 100, height: 3,
                background: '#ff660066',
                boxShadow: '0 0 20px #ff660033, 0 4px 30px #ff660022',
                borderRadius: 2,
              }} />
            ))}
          </>
        )}

        {/* ── Distant city skyline (city zone only) ── */}
        {zone.type === 'city' && (
          <div className="absolute pointer-events-none" style={{
            bottom: GAME_CONFIG.HEIGHT * 0.55, left: 0, right: 0, height: 80,
          }}>
            {Array.from({ length: 12 }, (_, i) => {
              const h = 20 + (i * 17 + 7) % 50;
              const w = 20 + (i * 11) % 30;
              const neonClr = ['#ff00ff', '#00d4ff', '#ff6600', '#00ff88'][(i * 3) % 4];
              return (
                <div key={`bld${i}`} className="absolute" style={{
                  bottom: 0, left: `${i * 8.5}%`, width: w, height: h,
                  background: '#0a0a18',
                  borderTop: `1px solid ${neonClr}33`,
                  boxShadow: `0 -2px 8px ${neonClr}15`,
                }}>
                  {Array.from({ length: Math.floor(h / 10) }, (_, j) => (
                    <div key={j} className="absolute" style={{
                      width: 2, height: 2,
                      left: 4 + (j * 7) % (w - 6), top: 4 + j * 10,
                      background: Math.random() > 0.4 ? '#ffcc0066' : 'transparent',
                      boxShadow: '0 0 3px #ffcc0033',
                    }} />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Highway scenery (highway zone) ── */}
        {zone.type === 'highway' && (
          <div className="absolute pointer-events-none" style={{
            bottom: GAME_CONFIG.HEIGHT * 0.55, left: 0, right: 0, height: 40,
          }}>
            {/* Distant mountains / horizon */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: 30,
              background: 'linear-gradient(180deg, transparent, #0a1a0a)',
              borderTop: '1px solid #00ff8822',
            }} />
          </div>
        )}

        {/* ── Road segments ── */}
        {roadSegments.map(seg => {
          const roadLeft = screenCenterX + seg.centerX - seg.width / 2;
          const roadRight = screenCenterX + seg.centerX + seg.width / 2;
          const stripAlternate = Math.floor(seg.worldY / 100) % 2 === 0;
          // Narrow warning: road edges glow red when narrow
          const isNarrow = seg.width < GAME_CONFIG.ROAD_WIDTH * 0.85;
          const edgeColor = isNarrow ? '#ff4444' : (isNitro ? '#ff00ff' : zoneColors.edge);
          return (
            <React.Fragment key={seg.key}>
              {/* Dark ground sides */}
              <div className="absolute" style={{
                bottom: seg.bottom, left: 0, width: roadLeft,
                height: GAME_CONFIG.SEGMENT_HEIGHT + 1,
                backgroundColor: Math.floor(seg.worldY / 200) % 2 === 0 ? zoneColors.ground1 : zoneColors.ground2,
              }} />
              <div className="absolute" style={{
                bottom: seg.bottom, left: roadRight, right: 0,
                height: GAME_CONFIG.SEGMENT_HEIGHT + 1,
                backgroundColor: Math.floor(seg.worldY / 200) % 2 === 0 ? zoneColors.ground1 : zoneColors.ground2,
              }} />
              {/* Road surface */}
              <div className="absolute" style={{
                bottom: seg.bottom, left: roadLeft,
                width: seg.width, height: GAME_CONFIG.SEGMENT_HEIGHT + 1,
                backgroundColor: stripAlternate ? zoneColors.road1 : zoneColors.road2,
              }} />
              {/* Road grid lines */}
              <div className="absolute" style={{
                bottom: seg.bottom, left: roadLeft,
                width: seg.width, height: 1,
                backgroundColor: `${zoneColors.edge}10`,
              }} />
              {/* Lane dividers */}
              {seg.isMarking && (
                <>
                  <div className="absolute" style={{
                    bottom: seg.bottom + GAME_CONFIG.SEGMENT_HEIGHT / 2 - 1.5,
                    left: screenCenterX + seg.centerX - seg.width / 6 - 15,
                    width: 30, height: 3,
                    backgroundColor: `${zoneColors.edge}59`,
                    boxShadow: `0 0 6px ${zoneColors.edge}4D`,
                    borderRadius: 1,
                  }} />
                  <div className="absolute" style={{
                    bottom: seg.bottom + GAME_CONFIG.SEGMENT_HEIGHT / 2 - 1.5,
                    left: screenCenterX + seg.centerX + seg.width / 6 - 15,
                    width: 30, height: 3,
                    backgroundColor: `${zoneColors.edge}59`,
                    boxShadow: `0 0 6px ${zoneColors.edge}4D`,
                    borderRadius: 1,
                  }} />
                </>
              )}
              {/* Neon road edge - LEFT */}
              <div className="absolute" style={{
                bottom: seg.bottom, left: roadLeft,
                width: isNarrow ? 4 : 3, height: GAME_CONFIG.SEGMENT_HEIGHT + 1,
                backgroundColor: edgeColor,
                boxShadow: `0 0 8px ${edgeColor}, 0 0 16px ${edgeColor}44`,
                transition: 'background-color 0.3s',
              }} />
              {/* Neon road edge - RIGHT */}
              <div className="absolute" style={{
                bottom: seg.bottom, left: roadRight - (isNarrow ? 4 : 3),
                width: isNarrow ? 4 : 3, height: GAME_CONFIG.SEGMENT_HEIGHT + 1,
                backgroundColor: edgeColor,
                boxShadow: `0 0 8px ${edgeColor}, 0 0 16px ${edgeColor}44`,
                transition: 'background-color 0.3s',
              }} />
              {/* Barrier markers on curbs */}
              {Math.floor(seg.worldY / GAME_CONFIG.SEGMENT_HEIGHT) % 4 === 0 && (
                <>
                  <div className="absolute" style={{
                    bottom: seg.bottom, left: roadLeft - 8,
                    width: 6, height: GAME_CONFIG.SEGMENT_HEIGHT + 1,
                    backgroundColor: stripAlternate ? '#ff004066' : `${zoneColors.accent}33`,
                  }} />
                  <div className="absolute" style={{
                    bottom: seg.bottom, left: roadRight + 2,
                    width: 6, height: GAME_CONFIG.SEGMENT_HEIGHT + 1,
                    backgroundColor: stripAlternate ? '#ff004066' : `${zoneColors.accent}33`,
                  }} />
                </>
              )}
            </React.Fragment>
          );
        })}

        {/* ── Roadside elements ── */}
        {roadsideElements.map(el => {
          if (el.type === 'lamp') {
            return (
              <div key={el.key} className="absolute" style={{ bottom: el.bottom, left: el.x }}>
                <div style={{ width: 3, height: 40, backgroundColor: '#333', marginLeft: 8 }} />
                <div style={{ width: 20, height: 6, backgroundColor: '#222', borderRadius: '3px 3px 0 0', position: 'relative' }}>
                  <div style={{
                    position: 'absolute', bottom: -3, left: 4, width: 12, height: 4,
                    background: zoneColors.edge,
                    borderRadius: '0 0 6px 6px',
                    boxShadow: `0 0 15px ${zoneColors.edge}, 0 5px 20px ${zoneColors.edge}44`,
                    opacity: 0.8,
                  }} />
                </div>
              </div>
            );
          }
          if (el.type === 'building') {
            const h = 40 + (parseInt(el.key.replace(/\D/g, '')) * 17) % 60;
            const neonClr = el.side === 'left' ? '#ff00ff' : '#00ff88';
            return (
              <div key={el.key} className="absolute" style={{
                bottom: el.bottom, left: el.x,
                width: 40, height: h,
                background: 'linear-gradient(180deg, #0c0c1e, #080818)',
                border: `1px solid ${neonClr}22`,
                boxShadow: `0 0 10px ${neonClr}10`,
              }}>
                <div style={{
                  position: 'absolute', top: 4, left: 4, right: 4, height: 3,
                  background: neonClr, boxShadow: `0 0 8px ${neonClr}`, opacity: 0.6,
                }} />
                {Array.from({ length: Math.floor(h / 14) }, (_, j) => (
                  <div key={j} style={{
                    position: 'absolute',
                    left: 8 + (j * 11) % 24, top: 12 + j * 12,
                    width: 5, height: 5,
                    background: j % 3 === 0 ? '#ffcc0055' : '#ffffff11',
                    boxShadow: j % 3 === 0 ? '0 0 4px #ffcc0033' : 'none',
                  }} />
                ))}
              </div>
            );
          }
          return null;
        })}

        {/* ── Speed lines ── */}
        {speedLines.map(sl => (
          <div key={sl.id} className="absolute pointer-events-none"
            style={{
              left: sl.x, top: sl.y,
              width: 2, height: sl.len,
              background: isNitro
                ? 'linear-gradient(180deg, transparent, rgba(255,102,0,0.9), rgba(255,0,64,0.6), transparent)'
                : `linear-gradient(180deg, transparent, ${zoneColors.edge}B3, transparent)`,
              opacity: sl.opacity,
              boxShadow: isNitro ? '0 0 4px rgba(255,102,0,0.4)' : `0 0 3px ${zoneColors.edge}4D`,
            }} />
        ))}

        {/* ── Particles ── */}
        {particles.map(p => (
          <div key={p.id} className="absolute rounded-full pointer-events-none" style={{
            left: p.x - p.size / 2, top: p.y - p.size / 2,
            width: p.size, height: p.size,
            backgroundColor: p.color,
            opacity: p.life / p.maxLife,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
          }} />
        ))}

        {/* ── Collectibles (coins, speed pads, nitro, multiplier) ── */}
        {coins.map(coin => {
          const relY = coin.trackY - distance;
          const coinWorldX = getRoadCurve(coin.trackY) + coin.offsetX;
          if (relY < -50 || relY > GAME_CONFIG.HEIGHT + 50) return null;
          const pulse = Math.sin(Date.now() * 0.005 + coin.trackY) * 0.15 + 0.85;

          if (coin.type === 'coin') {
            return (
              <div key={coin.id}
                className="absolute flex items-center justify-center rounded-full font-bold text-xs"
                style={{
                  bottom: relY,
                  left: screenCenterX + coinWorldX - GAME_CONFIG.COIN_SIZE / 2,
                  width: GAME_CONFIG.COIN_SIZE, height: GAME_CONFIG.COIN_SIZE,
                  background: 'radial-gradient(circle, #fde047, #f59e0b)',
                  boxShadow: '0 0 12px rgba(245,158,11,0.8), 0 0 24px rgba(245,158,11,0.4)',
                  border: '2px solid rgba(253,224,71,0.8)',
                  transform: `scale(${pulse})`, color: '#92400e',
                }}>$</div>
            );
          }

          if (coin.type === 'speed_pad') {
            return (
              <div key={coin.id} className="absolute" style={{
                bottom: relY,
                left: screenCenterX + coinWorldX - coin.width / 2,
                width: coin.width, height: coin.height,
              }}>
                <svg width={coin.width} height={coin.height} viewBox="0 0 40 60" style={{ display: 'block' }}>
                  <rect x="2" y="2" width="36" height="56" rx="4" fill="#00ff8833"
                    stroke="#00ff88" strokeWidth="2" />
                  {/* Chevrons pointing up */}
                  <polygon points="20,10 10,25 14,25 20,14 26,25 30,25" fill="#00ff88" opacity="0.9" />
                  <polygon points="20,25 10,40 14,40 20,29 26,40 30,40" fill="#00ff88" opacity="0.6" />
                  <polygon points="20,40 10,55 14,55 20,44 26,55 30,55" fill="#00ff88" opacity="0.3" />
                </svg>
              </div>
            );
          }

          if (coin.type === 'nitro_pickup') {
            return (
              <div key={coin.id} className="absolute flex items-center justify-center" style={{
                bottom: relY,
                left: screenCenterX + coinWorldX - coin.width / 2,
                width: coin.width, height: coin.height,
                background: 'radial-gradient(circle, #ff660088, #ff330044)',
                border: '2px solid #ff6600',
                borderRadius: '50%',
                boxShadow: `0 0 15px #ff660088, 0 0 30px #ff330044`,
                transform: `scale(${pulse})`,
                color: '#fff', fontSize: 12, fontWeight: 'bold',
                textShadow: '0 0 8px #ff6600',
              }}>N</div>
            );
          }

          if (coin.type === 'multiplier') {
            return (
              <div key={coin.id} className="absolute flex items-center justify-center" style={{
                bottom: relY,
                left: screenCenterX + coinWorldX - coin.width / 2,
                width: coin.width, height: coin.height,
                background: 'radial-gradient(circle, #ff00ff66, #cc00ff33)',
                border: '2px solid #ff00ff',
                borderRadius: 4,
                boxShadow: '0 0 15px #ff00ff88, 0 0 30px #cc00ff44',
                transform: `scale(${pulse}) rotate(${Math.sin(Date.now() * 0.003) * 15}deg)`,
                color: '#fff', fontSize: 11, fontWeight: 'bold',
                textShadow: '0 0 8px #ff00ff',
              }}>x2</div>
            );
          }

          return null;
        })}

        {/* ── Obstacles (cars, barriers, oil slicks, warning signs) ── */}
        {obstacles.map((obs, idx) => {
          const relY = obs.trackY - distance;
          const obsWorldX = getRoadCurve(obs.trackY) + obs.offsetX;
          if (relY < -50 || relY > GAME_CONFIG.HEIGHT + 50) return null;

          if (obs.type === 'obstacle' || obs.type === 'lane_changer') {
            return (
              <div key={obs.id} className="absolute" style={{
                bottom: relY,
                left: screenCenterX + obsWorldX - obs.width / 2,
                width: obs.width, height: obs.height,
              }}>
                <ObstacleCar seed={idx + Math.floor(obs.trackY)} />
                {/* Lane changer indicator: moving dots */}
                {obs.type === 'lane_changer' && (
                  <div className="absolute" style={{
                    top: -6, left: '50%', transform: 'translateX(-50%)',
                    width: 8, height: 4,
                    backgroundColor: '#ffff00',
                    borderRadius: 2,
                    boxShadow: '0 0 6px #ffff00',
                    animation: 'pulse 0.4s infinite',
                  }} />
                )}
              </div>
            );
          }

          if (obs.type === 'barrier') {
            return (
              <div key={obs.id} className="absolute" style={{
                bottom: relY,
                left: screenCenterX + obsWorldX - obs.width / 2,
                width: obs.width, height: obs.height,
              }}>
                <div style={{
                  width: '100%', height: '100%',
                  background: 'repeating-linear-gradient(90deg, #ff0040 0px, #ff0040 8px, #ffcc00 8px, #ffcc00 16px)',
                  border: '2px solid #ff0040',
                  borderRadius: 2,
                  boxShadow: '0 0 10px #ff004066',
                  opacity: 0.9,
                }} />
              </div>
            );
          }

          if (obs.type === 'oil_slick') {
            return (
              <div key={obs.id} className="absolute" style={{
                bottom: relY,
                left: screenCenterX + obsWorldX - obs.width / 2,
                width: obs.width, height: obs.height,
              }}>
                <div style={{
                  width: '100%', height: '100%',
                  background: 'radial-gradient(ellipse, #2a2a00 20%, #1a1a0088 60%, transparent 100%)',
                  borderRadius: '50%',
                  border: '1px solid #4a4a0044',
                  boxShadow: '0 0 8px #3a3a0033',
                }}>
                  {/* Oil rainbow sheen */}
                  <div style={{
                    position: 'absolute', top: '20%', left: '20%',
                    width: '60%', height: '40%',
                    background: 'linear-gradient(135deg, #ff000022, #00ff0022, #0000ff22, #ff00ff22)',
                    borderRadius: '50%', opacity: 0.6,
                  }} />
                </div>
              </div>
            );
          }

          if (obs.type === 'warning_sign') {
            return (
              <div key={obs.id} className="absolute" style={{
                bottom: relY,
                left: screenCenterX + obsWorldX - obs.width / 2,
                width: obs.width, height: obs.height,
              }}>
                <svg width={obs.width} height={obs.height} viewBox="0 0 30 30" style={{ display: 'block' }}>
                  <polygon points="15,2 28,28 2,28" fill="#ffcc0033" stroke="#ffcc00" strokeWidth="2" />
                  <text x="15" y="24" textAnchor="middle" fill="#ffcc00" fontSize="16" fontWeight="bold">!</text>
                </svg>
              </div>
            );
          }

          return null;
        })}

        {/* ── Player Car ── */}
        <div className="absolute z-20"
          style={{
            bottom: 50,
            left: screenCenterX + carX - GAME_CONFIG.CAR_WIDTH / 2,
            width: GAME_CONFIG.CAR_WIDTH, height: GAME_CONFIG.CAR_HEIGHT,
            transform: `rotate(${carAngle}deg)`,
            transition: 'transform 0.05s linear',
            filter: isNitro
              ? 'drop-shadow(0 0 12px #ff6600) drop-shadow(0 0 24px #ff330066)'
              : `drop-shadow(0 0 8px ${zoneColors.edge}88)`,
          }}>
          <NeonCar isNitro={isNitro} />
          {isNitro && (
            <div className="absolute inset-x-1" style={{
              top: '100%', height: 40,
              background: 'linear-gradient(180deg, rgba(255,102,0,0.9), rgba(255,0,64,0.5), transparent)',
              filter: 'blur(5px)', borderRadius: '0 0 8px 8px',
            }} />
          )}
          <div className="absolute" style={{
            bottom: '100%', left: 2, width: 10, height: 60,
            background: 'linear-gradient(0deg, rgba(255,255,255,0.15), transparent)',
            filter: 'blur(3px)',
          }} />
          <div className="absolute" style={{
            bottom: '100%', right: 2, width: 10, height: 60,
            background: 'linear-gradient(0deg, rgba(255,255,255,0.15), transparent)',
            filter: 'blur(3px)',
          }} />
        </div>

        {/* ── Vignette ── */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: zone.type === 'tunnel'
            ? 'radial-gradient(ellipse at 50% 70%, transparent 30%, rgba(0,0,0,0.7) 100%)'
            : 'radial-gradient(ellipse at 50% 70%, transparent 40%, rgba(0,0,0,0.5) 100%)',
        }} />

        {/* ── Scanline overlay ── */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
          opacity: 0.5,
        }} />
      </div>

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
