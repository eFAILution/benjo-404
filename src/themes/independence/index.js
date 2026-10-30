// @ts-check
// Independence Day: navy night, red accent, white sparks rising like fireworks.
// Benjo wears a striped top hat with a star band. Hazards are a firecracker and a
// rocket; pickups are a gold star and a sparkler.
//
// Sprites are simple shapes: circles, ellipses, polygons, stars, and hearts (#12). Benjo's
// accessory is drawn in his own 620-unit viewBox, over the logo paths.
import { benjo as baseBenjo } from '../../assets/benjo.js';

/** @type {import('../../contracts').ThemePack} */
export default {
  id: 'independence',
  name: 'Independence Day',
  holiday: 'independence',
  palette: {
    bg: '#04050c',
    accent: '#e63946',
    accentSoft: '#e6394633',
    glow: '#f1faee',
    ink: '#f2f2f2',
    muted: '#9e9e9e',
    hazard: '#4f7dff',
    pickup: '#ffd166',
  },
  particles: {
    count: 180,
    color: '#f1faee',
    size: [1, 2.5],
    speed: [10, 26],
    drift: 'up',
    twinkle: true,
  },
  sprites: {
    benjo: {
      ...baseBenjo,
      paths: [
        ...baseBenjo.paths,
        { d: 'M358 362L372 176L488 192L482 380Z', fill: 'ink' },
        { d: 'M367 222L484 238L483 262L365 246ZM364 270L482 286L481 310L362 294Z', fill: 'accent' },
        {
          d: 'M321 359.5a104 20 8 1 1 206 28.9a104 20 8 1 1 -206 -28.9ZM361 318L481 334L481 362L358 350Z',
          fill: 'hazard',
        },
        {
          d: 'M420 322L423.5 331.1L433.3 331.7L425.7 337.9L428.2 347.3L420 342L411.8 347.3L414.3 337.9L406.7 331.7L416.5 331.1Z',
          fill: 'glow',
        },
      ],
    },
    hazards: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: 'M30 34H66V94H30Z', fill: 'accent' },
          { d: 'M30 46H66V52H30ZM30 76H66V82H30Z', fill: 'glow' },
          { d: 'M47 34L49 34L58 18L56 16Z', fill: 'muted' },
          {
            d: 'M60 2L62.5 9.7L70.4 8L65 14L70.4 20L62.5 18.3L60 26L57.5 18.3L49.6 20L55 14L49.6 8L57.5 9.7Z',
            fill: 'pickup',
          },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: 'M40 78L56 78L48 96Z', fill: 'pickup' },
          { d: 'M34 58L34 80L22 86ZM62 58L62 80L74 86Z', fill: 'accent' },
          { d: 'M34 30H62V80H34Z', fill: 'hazard' },
          { d: 'M34 30L62 30L48 4Z', fill: 'glow' },
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
          { d: 'M14 90L18 94L56 50L52 46Z', fill: 'muted' },
          {
            d: 'M60 4L64.6 26.9L84 14L71.1 33.4L94 38L71.1 42.6L84 62L64.6 49.1L60 72L55.4 49.1L36 62L48.9 42.6L26 38L48.9 33.4L36 14L55.4 26.9Z',
            fill: 'pickup',
          },
          {
            d: 'M60 22L62.3 32.5L71.3 26.7L65.5 35.7L76 38L65.5 40.3L71.3 49.3L62.3 43.5L60 54L57.7 43.5L48.7 49.3L54.5 40.3L44 38L54.5 35.7L48.7 26.7L57.7 32.5Z',
            fill: 'glow',
          },
        ],
      },
    ],
  },
  tagline: 'LIGHT IT UP',
  // A crackle for treats: two quick noisy pops.
  cues: {
    pickup: [
      { type: 'sawtooth', f: 1400, to: 300, d: 0.06, g: 0.25 },
      { type: 'sawtooth', f: 1800, to: 400, at: 0.07, d: 0.08, g: 0.25 },
    ],
  },
};
