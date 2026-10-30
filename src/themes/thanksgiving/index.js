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
            d: 'M29.2 55.4a15 8.5 -172 1 1 -29.7 -4.2a15 8.5 -172 1 1 29.7 4.2ZM31.3 48.9a15 8.5 -151.5 1 1 -26.4 -14.3a15 8.5 -151.5 1 1 26.4 14.3ZM35.5 43.7a15 8.5 -131 1 1 -19.7 -22.6a15 8.5 -131 1 1 19.7 22.6ZM41.3 40.2a15 8.5 -110.5 1 1 -10.5 -28.1a15 8.5 -110.5 1 1 10.5 28.1ZM48 39a15 8.5 -90 1 1 0 -30a15 8.5 -90 1 1 0 30ZM54.7 40.2a15 8.5 -69.5 1 1 10.5 -28.1a15 8.5 -69.5 1 1 -10.5 28.1ZM60.5 43.7a15 8.5 -49 1 1 19.7 -22.6a15 8.5 -49 1 1 -19.7 22.6ZM64.7 48.9a15 8.5 -28.5 1 1 26.4 -14.3a15 8.5 -28.5 1 1 -26.4 14.3ZM66.8 55.4a15 8.5 -8 1 1 29.7 -4.2a15 8.5 -8 1 1 -29.7 4.2Z',
            fill: '#d62828',
          },
          {
            d: 'M37.1 56.5a11 6.5 -172 1 1 -21.8 -3.1a11 6.5 -172 1 1 21.8 3.1ZM39 51.6a11 6.5 -144.7 1 1 -17.9 -12.7a11 6.5 -144.7 1 1 17.9 12.7ZM42.9 48.2a11 6.5 -117.3 1 1 -10.1 -19.5a11 6.5 -117.3 1 1 10.1 19.5ZM48 47a11 6.5 -90 1 1 0 -22a11 6.5 -90 1 1 0 22ZM53.1 48.2a11 6.5 -62.7 1 1 10.1 -19.5a11 6.5 -62.7 1 1 -10.1 19.5ZM57 51.6a11 6.5 -35.3 1 1 17.9 -12.7a11 6.5 -35.3 1 1 -17.9 12.7ZM58.9 56.5a11 6.5 -8 1 1 21.8 -3.1a11 6.5 -8 1 1 -21.8 3.1Z',
            fill: 'accent',
          },
          {
            d: 'M48 43a21 23 90 1 1 0 42a21 23 90 1 1 0 -42ZM36 36a12 12 0 1 1 24 0a12 12 0 1 1 -24 0Z',
            fill: 'hazard',
          },
          {
            d: 'M43 40L53 40L48 48ZM38 84L42 84L42 92L46 96L34 96L38 92ZM54 84L58 84L58 92L62 96L50 96L54 92Z',
            fill: 'glow',
          },
          { d: 'M51 47.5a3.5 6 90 1 1 0 7a3.5 6 90 1 1 0 -7Z', fill: '#e63946' },
          {
            d: 'M41 33a2.5 2.5 0 1 1 5 0a2.5 2.5 0 1 1 -5 0ZM50 33a2.5 2.5 0 1 1 5 0a2.5 2.5 0 1 1 -5 0Z',
            fill: 'bg',
          },
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
