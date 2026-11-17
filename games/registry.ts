// games/registry.ts
import { GameEntry } from '@/platform/types';

import TiltToLive from './game5';
import TiltToLiveMobile from './game5/MobileController';
import SkyFighter from './game9';
import SkyFighterMobile from './game9/MobileController';

export const GAME_REGISTRY: Record<string, GameEntry> = {
  game5: {
    name: 'Tilt to Live',
    description: 'Tilt to dodge red dots. Collect powerups to destroy them. Survive!',
    icon: '🔺',
    desktop: TiltToLive,
    mobile: TiltToLiveMobile,
  },
  game9: {
    name: 'Sky Fighter',
    description: 'Tilt to fly your jet in 3D. Hold FIRE to shoot. Dogfight enemies!',
    icon: '🛩️',
    desktop: SkyFighter,
    mobile: SkyFighterMobile,
  },
};
