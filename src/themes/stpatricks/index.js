// @ts-check
// St. Patrick's Day: forest-black night, clover green accent, gold sparks twinkling.
// Benjo wears a green top hat with a gold buckle. Hazards are a storm cloud and a
// black cat; pickups are a shamrock and a gold coin.
//
// Sprites are simple shapes: circles, ellipses, polygons, stars, and hearts (#12). Benjo's
// accessory is drawn in his own 620-unit viewBox, over the logo paths.
import { benjo as baseBenjo } from '../../assets/benjo.js';

/** @type {import('../../contracts').ThemePack} */
export default {
  id: 'stpatricks',
  name: "St. Patrick's Day",
  holiday: 'stpatricks',
  palette: {
    bg: '#030805',
    accent: '#2fbf4a',
    accentSoft: '#2fbf4a33',
    glow: '#ffd84d',
    ink: '#f2f2f2',
    muted: '#9e9e9e',
    hazard: '#7d8796',
    pickup: '#2fbf4a',
  },
  particles: {
    count: 150,
    color: '#ffd84d',
    size: [1, 2.5],
    speed: [6, 18],
    drift: 'down',
    twinkle: true,
  },
  sprites: {
    benjo: {
      ...baseBenjo,
      paths: [
        ...baseBenjo.paths,
        {
          d: 'M321 357.5a104 20 8 1 1 206 28.9a104 20 8 1 1 -206 -28.9ZM356 360L372 190L486 206L482 378Z',
          fill: 'accent',
        },
        { d: 'M362 300L480 316L480 346L358 330Z', fill: 'bg' },
        { d: 'M400 302H444V342H400Z', fill: 'glow' },
        { d: 'M410 312H434V332H410Z', fill: 'accent' },
      ],
    },
    hazards: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          {
            d: 'M10 46a20 20 0 1 1 40 0a20 20 0 1 1 -40 0ZM26 36a26 26 0 1 1 52 0a26 26 0 1 1 -52 0ZM54 48a18 18 0 1 1 36 0a18 18 0 1 1 -36 0ZM30 46H72V66H30Z',
            fill: 'hazard',
          },
          { d: 'M50 60L38 80L48 80L40 96L60 72L50 72L58 60Z', fill: 'glow' },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          {
            d: 'M22 66a26 26 0 1 1 52 0a26 26 0 1 1 -52 0ZM30 32a18 18 0 1 1 36 0a18 18 0 1 1 -36 0ZM32 24L34 6L44 18ZM64 24L62 6L52 18Z',
            fill: 'hazard',
          },
          { d: 'M70 78L86 58L90 34L84 34L80 56L66 72Z', fill: 'hazard' },
          {
            d: 'M37 30a4 6 0 1 1 8 0a4 6 0 1 1 -8 0ZM51 30a4 6 0 1 1 8 0a4 6 0 1 1 -8 0Z',
            fill: 'glow',
          },
        ],
      },
    ],
    pickups: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          {
            d: 'M48 42C25.5 27.6 30.9 7.6 48 18.8C65.1 7.6 70.5 27.6 48 42ZM52 40L58 92L52 92L46 44Z',
            fill: 'pickup',
          },
          {
            d: 'M19 65.6a18 16 -60 1 1 18 -31.2a18 16 -60 1 1 -18 31.2ZM59 34.4a18 16 60 1 1 18 31.2a18 16 60 1 1 -18 -31.2Z',
            fill: 'pickup',
          },
          { d: 'M41 44a7 7 0 1 1 14 0a7 7 0 1 1 -14 0Z', fill: '#1f8f35' },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: 'M4 48a44 44 0 1 1 88 0a44 44 0 1 1 -88 0Z', fill: 'glow' },
          { d: 'M14 48a34 34 0 1 1 68 0a34 34 0 1 1 -68 0Z', fill: '#e0b62e' },
          {
            d: 'M34 42a8 8 0 1 1 16 0a8 8 0 1 1 -16 0ZM46 42a8 8 0 1 1 16 0a8 8 0 1 1 -16 0ZM40 52a8 8 0 1 1 16 0a8 8 0 1 1 -16 0Z',
            fill: 'glow',
          },
        ],
      },
    ],
  },
  tagline: 'LUCK OF THE DRAGON',
  // A lucky jingle of coins for treats.
  cues: {
    pickup: [
      { type: 'triangle', f: 1175, d: 0.06, g: 0.3 },
      { type: 'triangle', f: 1568, at: 0.06, d: 0.06, g: 0.3 },
      { type: 'triangle', f: 2093, at: 0.12, d: 0.1, g: 0.3 },
    ],
  },
};
