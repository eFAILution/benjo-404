// @ts-check
// Easter: soft violet night, pastel pink accent, warm yellow petals drifting down.
// Benjo wears bunny ears. Hazards are a hatching egg and a spring rain cloud;
// pickups are a painted egg and a tulip.
//
// Sprites are simple shapes: circles, ellipses, polygons, stars, and hearts (#12). Benjo's
// accessory is drawn in his own 620-unit viewBox, over the logo paths.
import { benjo as baseBenjo } from '../../assets/benjo.js';

/** @type {import('../../contracts').ThemePack} */
export default {
  id: 'easter',
  name: 'Easter',
  holiday: 'easter',
  palette: {
    bg: '#07060c',
    accent: '#ff9ecf',
    accentSoft: '#ff9ecf33',
    glow: '#fff3a8',
    ink: '#f2f2f2',
    muted: '#9e9e9e',
    hazard: '#7fc8ff',
    pickup: '#ffd166',
  },
  particles: {
    count: 140,
    color: '#fff3a8',
    size: [1, 2.5],
    speed: [6, 16],
    drift: 'down',
    twinkle: false,
  },
  sprites: {
    benjo: {
      ...baseBenjo,
      paths: [
        ...baseBenjo.paths,
        {
          d: 'M372 329.9a96 30 -78 1 1 39.9 -187.8a96 30 -78 1 1 -39.9 187.8ZM480 325.5a96 30 -96 1 1 -20.1 -190.9a96 30 -96 1 1 20.1 190.9Z',
          fill: 'ink',
        },
        {
          d: 'M377.4 304.5a70 14 -78 1 1 29.1 -136.9a70 14 -78 1 1 -29.1 136.9ZM477.3 299.6a70 14 -96 1 1 -14.6 -139.2a70 14 -96 1 1 14.6 139.2Z',
          fill: 'accent',
        },
      ],
    },
    hazards: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: 'M28 36a20 20 0 1 1 40 0a20 20 0 1 1 -40 0Z', fill: 'pickup' },
          { d: 'M39 32a3 3 0 1 1 6 0a3 3 0 1 1 -6 0Z', fill: 'bg' },
          { d: 'M56 36L66 40L56 44Z', fill: '#ff9f43' },
          {
            d: 'M14 52L24 44L32 54L42 46L50 56L60 46L70 54L82 46L82 64L78 84L66 94L30 94L18 84L14 64Z',
            fill: 'ink',
          },
          {
            d: 'M14 52L24 44L32 54L42 46L50 56L60 46L70 54L82 46L82 52L70 60L60 52L50 62L42 52L32 60L24 50L14 58Z',
            fill: 'muted',
          },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          {
            d: 'M10 40a20 20 0 1 1 40 0a20 20 0 1 1 -40 0ZM28 30a24 24 0 1 1 48 0a24 24 0 1 1 -48 0ZM54 42a18 18 0 1 1 36 0a18 18 0 1 1 -36 0ZM30 40H72V58H30Z',
            fill: 'hazard',
          },
          {
            d: 'M26.2 72.6a4 8 20 1 1 7.5 2.7a4 8 20 1 1 -7.5 -2.7ZM46.2 80.6a4 8 20 1 1 7.5 2.7a4 8 20 1 1 -7.5 -2.7ZM66.2 72.6a4 8 20 1 1 7.5 2.7a4 8 20 1 1 -7.5 -2.7Z',
            fill: '#b8e2ff',
          },
        ],
      },
    ],
    pickups: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: 'M48 16a34 44 90 1 1 0 68a34 44 90 1 1 0 -68Z', fill: 'accent' },
          {
            d: 'M14 44L24 36L34 46L44 36L54 46L64 36L74 46L82 40L82 52L74 58L64 48L54 58L44 48L34 58L24 48L14 56Z',
            fill: 'pickup',
          },
          {
            d: 'M31 24a5 5 0 1 1 10 0a5 5 0 1 1 -10 0ZM53 22a5 5 0 1 1 10 0a5 5 0 1 1 -10 0ZM42 74a6 6 0 1 1 12 0a6 6 0 1 1 -12 0Z',
            fill: 'hazard',
          },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          {
            d: 'M45 50H51V94H45ZM49.7 86.3a16 7 -40 1 1 24.5 -20.6a16 7 -40 1 1 -24.5 20.6Z',
            fill: '#3fb950',
          },
          { d: 'M24 18L36 34L48 14L60 34L72 18L72 48L60 60L36 60L24 48Z', fill: 'accent' },
        ],
      },
    ],
  },
  tagline: 'HOP TO IT',
  // A springy hop for jumps.
  cues: {
    jump: [{ type: 'sine', f: 330, to: 660, d: 0.14, g: 0.3 }],
  },
};
