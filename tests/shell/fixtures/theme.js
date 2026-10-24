// A test-only theme pack. The real default pack is src/themes/default (WP2).
import { benjo } from '../../../src/assets/benjo.js';

const square = { viewBox: [0, 0, 64, 64], paths: [{ d: 'M8 8H56V56H8Z', fill: 'hazard' }] };
const dot = {
  viewBox: [0, 0, 64, 64],
  paths: [{ d: 'M32 12A20 20 0 1 1 31.9 12Z', fill: 'pickup' }],
};

export const fakeTheme = {
  id: 'default',
  name: 'Fixture',
  holiday: 'default',
  palette: {
    bg: '#040404',
    accent: '#d72228',
    accentSoft: '#d7222833',
    glow: '#ff8a3d',
    ink: '#f2f2f2',
    muted: '#9e9e9e',
    hazard: '#d72228',
    pickup: '#ff8a3d',
  },
  particles: {
    count: 40,
    color: '#ff8a3d',
    size: [1, 2.5],
    speed: [4, 14],
    drift: 'up',
    twinkle: true,
  },
  sprites: { benjo, hazards: [square], pickups: [dot] },
  tagline: 'FIXTURE',
};

export const fakeHalloween = {
  ...fakeTheme,
  id: 'halloween',
  name: 'Fixture Halloween',
  holiday: 'halloween',
  palette: { ...fakeTheme.palette, bg: '#07040a', accent: '#ff7a1a', glow: '#ffb347' },
};
