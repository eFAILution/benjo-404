// @ts-check
// Valentine's Day: deep wine night, pink accent, soft pink glow drifting up.
// Benjo wears a headband with two hearts. Hazards are a broken heart and a stray
// arrow; pickups are a heart and a love letter.
//
// Sprites are simple shapes: circles, ellipses, polygons, stars, and hearts (#12). Benjo's
// accessory is drawn in his own 620-unit viewBox, over the logo paths.
import { benjo as baseBenjo } from '../../assets/benjo.js';

/** @type {import('../../contracts').ThemePack} */
export default {
  id: 'valentines',
  name: "Valentine's Day",
  holiday: 'valentines',
  palette: {
    bg: '#0a0407',
    accent: '#ff4d7d',
    accentSoft: '#ff4d7d33',
    glow: '#ffb3c7',
    ink: '#f2f2f2',
    muted: '#9e9e9e',
    hazard: '#b3123a',
    pickup: '#ff4d7d',
  },
  particles: {
    count: 140,
    color: '#ffb3c7',
    size: [1, 2.5],
    speed: [6, 16],
    drift: 'up',
    twinkle: true,
  },
  sprites: {
    benjo: {
      ...baseBenjo,
      paths: [
        ...baseBenjo.paths,
        { d: 'M396 236H404V356H396ZM458 230H466V358H458Z', fill: 'muted' },
        { d: 'M334.9 352.6a96 18 8 1 1 190.1 26.7a96 18 8 1 1 -190.1 -26.7Z', fill: 'accent' },
        {
          d: 'M400 245C367.5 224.3 375.3 195.6 400 211.7C424.7 195.6 432.5 224.3 400 245ZM462 237C429.5 216.3 437.3 187.6 462 203.7C486.7 187.6 494.5 216.3 462 237Z',
          fill: 'accent',
        },
      ],
    },
    hazards: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: 'M48 90C-4.5 55.8 8.1 8.3 48 34.9C87.9 8.3 100.5 55.8 48 90Z', fill: 'hazard' },
          { d: 'M44 24L52 24L44 40L56 52L46 64L54 90L46 90L38 64L46 52L36 40Z', fill: 'bg' },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: 'M10 82L14 86L76 24L72 20Z', fill: 'muted' },
          { d: 'M62 18L90 6L78 34Z', fill: 'hazard' },
          { d: 'M10 82L2 78L6 70L18 74ZM14 86L18 94L26 90L22 78Z', fill: 'accent' },
        ],
      },
    ],
    pickups: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: 'M48 89C-5.8 53.9 7.1 5.2 48 32.5C88.8 5.2 101.8 53.9 48 89Z', fill: 'pickup' },
          { d: 'M24.2 38.5a9 6 -30 1 1 15.6 -9a9 6 -30 1 1 -15.6 9Z', fill: 'glow' },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: 'M8 24H88V76H8Z', fill: 'ink' },
          { d: 'M8 24L88 24L48 56Z', fill: 'muted' },
          { d: 'M48 67C33 57.1 36.6 43.4 48 51C59.4 43.4 63 57.1 48 67Z', fill: 'pickup' },
        ],
      },
    ],
  },
  tagline: 'BE MINE',
  // A soft rising chime for treats.
  cues: {
    pickup: [
      { type: 'sine', f: 659, d: 0.1, g: 0.3 },
      { type: 'sine', f: 880, at: 0.09, d: 0.18, g: 0.3 },
    ],
  },
};
