// @ts-check
// New Year's: midnight blue-black, gold accent, gold sparks drifting up.
// Benjo wears a party hat. Hazards are a midnight alarm clock and a firework rocket;
// pickups are a gold star and a party horn.
//
// Sprites are simple shapes: circles, ellipses, polygons, stars, and hearts (#12). Benjo's
// accessory is drawn in his own 620-unit viewBox, over the logo paths.
import { benjo as baseBenjo } from '../../assets/benjo.js';

/** @type {import('../../contracts').ThemePack} */
export default {
  id: 'newyear',
  name: "New Year's",
  holiday: 'newyear',
  palette: {
    bg: '#05060d',
    accent: '#f2c14e',
    accentSoft: '#f2c14e33',
    glow: '#fff1b8',
    ink: '#f2f2f2',
    muted: '#9e9e9e',
    hazard: '#8a6cff',
    pickup: '#f2c14e',
  },
  particles: {
    count: 180,
    color: '#ffe28a',
    size: [1, 2.5],
    speed: [8, 22],
    drift: 'up',
    twinkle: true,
  },
  sprites: {
    benjo: {
      ...baseBenjo,
      paths: [
        ...baseBenjo.paths,
        { d: 'M430 150L500 392L340 372Z', fill: 'accent' },
        { d: 'M404 222L446 228L452 252L398 244ZM386 286L462 298L470 324L378 312Z', fill: 'hazard' },
        { d: 'M406 150a24 24 0 1 1 48 0a24 24 0 1 1 -48 0Z', fill: 'glow' },
      ],
    },
    hazards: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          {
            d: 'M11 22a13 13 0 1 1 26 0a13 13 0 1 1 -26 0ZM59 22a13 13 0 1 1 26 0a13 13 0 1 1 -26 0Z',
            fill: 'accent',
          },
          {
            d: 'M12 54a36 36 0 1 1 72 0a36 36 0 1 1 -72 0ZM22 84L30 80L24 94L16 94ZM74 84L66 80L72 94L80 94Z',
            fill: 'hazard',
          },
          { d: 'M21 54a27 27 0 1 1 54 0a27 27 0 1 1 -54 0Z', fill: 'ink' },
          { d: 'M46 30H50V56H46ZM46 52H62V56H46Z', fill: 'bg' },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: 'M40 78L56 78L48 96Z', fill: 'glow' },
          { d: 'M34 58L34 80L22 86ZM62 58L62 80L74 86Z', fill: 'accent' },
          { d: 'M34 30H62V80H34Z', fill: 'hazard' },
          { d: 'M34 30L62 30L48 4Z', fill: 'accent' },
          { d: 'M34 44H62V49H34ZM34 58H62V63H34Z', fill: 'glow' },
        ],
      },
    ],
    pickups: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          {
            d: 'M48 6L58.6 35.4L89.8 36.4L65.1 55.6L73.9 85.6L48 68L22.1 85.6L30.9 55.6L6.2 36.4L37.4 35.4Z',
            fill: 'pickup',
          },
          {
            d: 'M48 28L53.3 42.7L68.9 43.2L56.6 52.8L60.9 67.8L48 59L35.1 67.8L39.4 52.8L27.1 43.2L42.7 42.7Z',
            fill: 'glow',
          },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: 'M8 80L66 26L78 40Z', fill: 'pickup' },
          { d: 'M26 63L36 54L42 61ZM46 45L56 36L61 43Z', fill: 'hazard' },
          {
            d: 'M73 22a9 9 0 1 1 18 0a9 9 0 1 1 -18 0ZM65 12a5 5 0 1 1 10 0a5 5 0 1 1 -10 0Z',
            fill: 'glow',
          },
        ],
      },
    ],
  },
  tagline: 'HAPPY NEW YEAR',
  // A bright fanfare for treats, a pop for the clear.
  cues: {
    pickup: [
      { type: 'square', f: 784, d: 0.06, g: 0.25 },
      { type: 'square', f: 1047, at: 0.06, d: 0.06, g: 0.25 },
      { type: 'square', f: 1568, at: 0.12, d: 0.12, g: 0.25 },
    ],
  },
};
