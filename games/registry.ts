// games/registry.ts
import React from 'react';

// Game 1 Imports
import Game1 from './game1';
import Game1_Mobile from './game1/MobileController';

// Game 2 Imports
import Game2 from './game2';
import Game2_Mobile from './game2/MobileController';

// Game 3 Imports
import Game3 from './game3';
import Game3_Mobile from './game3/MobileController';

export interface GameEntry {
  name: string;
  description: string;
  icon: string;
  desktop: React.ComponentType<any>;
  mobile: React.ComponentType<any>;
}

export const GAME_REGISTRY: Record<string, GameEntry> = {
  'game1': {
    name: 'Rocket Shooter',
    description: 'Control a Rocket by your phone and shoot meteorites.',
    icon: '🚀',
    desktop: Game1,
    mobile: Game1_Mobile
  },
  'game2': {
    name: 'Space Brick',
    description: 'Tilt to move paddle. Launch the ball to break all bricks.',
    icon: '🧱',
    desktop: Game2,
    mobile: Game2_Mobile
  },
  'game3': {
    name: 'Neon Racing',
    description: 'Tilt to steer. Hold Nitro to boost. Avoid obstacles on the road.',
    icon: '🏎️',
    desktop: Game3,
    mobile: Game3_Mobile
  }
};