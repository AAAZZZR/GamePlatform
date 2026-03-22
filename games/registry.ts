// games/registry.ts
import React from 'react';
import { GameEntry } from '@/platform/types';

// Game Imports
import Game1 from './game1';
import Game1_Mobile from './game1/MobileController';
import Game2 from './game2';
import Game2_Mobile from './game2/MobileController';
import Game3 from './game3';
import Game3_Mobile from './game3/MobileController';
import Game4 from './game4';
import Game4_Mobile from './game4/MobileController';
import Game5 from './game5';
import Game5_Mobile from './game5/MobileController';

export const GAME_REGISTRY: Record<string, GameEntry> = {
  'game1': {
    name: 'Rocket Shooter',
    description: 'Tilt to fly your rocket. Hold FIRE to shoot meteors. Dodge or die!',
    icon: '🚀',
    desktop: Game1,
    mobile: Game1_Mobile,
  },
  'game2': {
    name: 'Space Brick',
    description: 'Tilt to move paddle. Break all bricks to advance. Catch power-ups!',
    icon: '🧱',
    desktop: Game2,
    mobile: Game2_Mobile,
  },
  'game3': {
    name: 'Neon Racing',
    description: 'Tilt to steer. Hold Nitro to boost. Collect coins. Stay on the road!',
    icon: '🏎️',
    desktop: Game3,
    mobile: Game3_Mobile,
  },
  'game4': {
    name: 'Snake',
    description: 'Tilt your phone to steer the snake. Eat food to grow. Boost for speed!',
    icon: '🐍',
    desktop: Game4,
    mobile: Game4_Mobile,
  },
  'game5': {
    name: 'Asteroid Dodge',
    description: 'Tilt to dodge asteroids. Collect coins. Dash or raise your shield!',
    icon: '🌌',
    desktop: Game5,
    mobile: Game5_Mobile,
  },
};
