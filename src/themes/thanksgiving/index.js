// @ts-check
// Thanksgiving: dark oak night, pumpkin orange accent, autumn leaves falling.
// Benjo wears a buckled brown hat. Hazards are a turkey and an acorn; pickups are a
// slice of pie and a maple leaf.
//
// Sprites are simple shapes: circles, ellipses, polygons, stars, and hearts (#12). Benjo's
// accessory is drawn in his own 620-unit viewBox, over the logo paths.
import { benjo as baseBenjo } from '../../assets/benjo.js';

/** @type {import('../../contracts').ThemePack} */
export default {
  id: 'thanksgiving',
  name: 'Thanksgiving',
  holiday: 'thanksgiving',
  palette: {
    bg: '#090503',
    accent: '#e07a1f',
    accentSoft: '#e07a1f33',
    glow: '#ffcf70',
    ink: '#f2f2f2',
    muted: '#9e9e9e',
    hazard: '#a0522d',
    pickup: '#e0a31f',
  },
  particles: {
    count: 120,
    color: '#e07a1f',
    size: [1.5, 3],
    speed: [8, 20],
    drift: 'down',
    twinkle: false,
  },
  sprites: {
    benjo: {
      ...baseBenjo,
      paths: [
        ...baseBenjo.paths,
        {
          d: 'M321 359.5a104 20 8 1 1 206 28.9a104 20 8 1 1 -206 -28.9ZM362 362L382 200L478 214L480 380Z',
          fill: 'hazard',
        },
        { d: 'M366 320L480 336L480 360L362 346Z', fill: 'bg' },
        { d: 'M402 318H442V352H402Z', fill: 'glow' },
        { d: 'M411 326H433V344H411Z', fill: 'hazard' },
      ],
    },
    hazards: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          {
            d: 'M9.9 56.9a22 9 -50 1 1 28.3 -33.7a22 9 -50 1 1 -28.3 33.7ZM57.9 23.1a22 9 50 1 1 28.3 33.7a22 9 50 1 1 -28.3 -33.7ZM48 0a22 9 90 1 1 0 44a22 9 90 1 1 0 -44Z',
            fill: 'accent',
          },
          {
            d: 'M27.2 48.8a20 8 -70 1 1 13.7 -37.6a20 8 -70 1 1 -13.7 37.6ZM55.2 11.2a20 8 70 1 1 13.7 37.6a20 8 70 1 1 -13.7 -37.6Z',
            fill: 'glow',
          },
          { d: 'M22 62a26 26 0 1 1 52 0a26 26 0 1 1 -52 0Z', fill: 'hazard' },
          { d: 'M37 36a11 11 0 1 1 22 0a11 11 0 1 1 -22 0Z', fill: '#c97a4a' },
          { d: 'M48 38L58 42L48 46ZM43 50a3 6 0 1 1 6 0a3 6 0 1 1 -6 0Z', fill: '#e63946' },
          { d: 'M43 33a2 2 0 1 1 4 0a2 2 0 1 1 -4 0Z', fill: 'bg' },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: 'M48 34a26 30 90 1 1 0 52a26 30 90 1 1 0 -52Z', fill: 'pickup' },
          { d: 'M18 34a30 14 0 1 1 60 0a30 14 0 1 1 -60 0ZM46 8H52V22H46Z', fill: 'hazard' },
        ],
      },
    ],
    pickups: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: 'M12 74L84 74L84 60L30 28Z', fill: 'accent' },
          { d: 'M12 74L84 74L84 82L12 82Z', fill: 'glow' },
          { d: 'M26 34L84 58L84 64L22 40Z', fill: 'glow' },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          {
            d: 'M48 4L56 24L66 18L64 38L84 30L78 46L92 50L70 64L74 74L52 70L52 94L44 94L44 70L22 74L26 64L4 50L18 46L12 30L32 38L30 18L40 24Z',
            fill: 'pickup',
          },
        ],
      },
    ],
  },
  tagline: 'GOBBLE GOBBLE',
  // A warm two-note chime for treats.
  cues: {
    pickup: [
      { type: 'triangle', f: 523, d: 0.1, g: 0.3 },
      { type: 'triangle', f: 784, at: 0.1, d: 0.18, g: 0.3 },
    ],
  },
};
