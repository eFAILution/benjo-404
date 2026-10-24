// @ts-check
// Christmas: blue-black night, brand red stays, icy snow drifting down.
// Benjo wears a Santa hat. Hazards are a snowman and a stack of presents;
// pickups are a snowflake and a candy cane.
import { benjo as baseBenjo } from '../../assets/benjo.js';

// Santa hat in Benjo's own 620-unit viewBox: drooping cone, then trim and pom.
const HAT =
  'M345 356C350 280 380 215 440 200C490 190 532 215 550 262C520 240 490 244 474 266C466 300 466 340 466 376Z';
const HAT_TRIM =
  'M334 348a72 22 14 1 1 140 34a72 22 14 1 1 -140 -34ZM528 268a24 24 0 1 1 48 0a24 24 0 1 1 -48 0Z';

// Snowman: three snowballs, top hat, scarf, carrot nose, coal eyes and buttons.
const SNOWMAN_BODY =
  'M27 74a21 21 0 1 1 42 0a21 21 0 1 1 -42 0ZM33 45a15 15 0 1 1 30 0a15 15 0 1 1 -30 0ZM37 23a11 11 0 1 1 22 0a11 11 0 1 1 -22 0Z';
const SNOWMAN_HAT = 'M35 11H61V15H35ZM40 0H56V12H40Z';
const SNOWMAN_SCARF =
  'M34 31Q48 38 62 31V36Q48 43 34 36ZM53 35L61 48L55 51L49 37Z';
const SNOWMAN_NOSE = 'M48 21L63 25L48 27Z';
const SNOWMAN_COAL =
  'M42.2 19a1.8 1.8 0 1 1 3.6 0a1.8 1.8 0 1 1 -3.6 0ZM51.2 19a1.8 1.8 0 1 1 3.6 0a1.8 1.8 0 1 1 -3.6 0ZM45.8 45a2.2 2.2 0 1 1 4.4 0a2.2 2.2 0 1 1 -4.4 0ZM45.8 53a2.2 2.2 0 1 1 4.4 0a2.2 2.2 0 1 1 -4.4 0Z';

// Two stacked presents with gold ribbon and a bow.
const PRESENT_BOTTOM = 'M10 54H86V94H10Z';
const PRESENT_TOP = 'M24 22H72V54H24Z';
const PRESENT_RIBBON =
  'M44 22H52V94H44ZM10 70H86V77H10ZM24 34H72V40H24ZM48 22C40 4 25 9 34 21ZM48 22C56 4 71 9 62 21Z';

// Snowflake: six arms, each with a pair of branches.
const SNOWFLAKE =
  'M44.5 4L51.5 4L51.5 48L44.5 48ZM34.6 16.7L38.4 12.1L49.9 21.7L46.1 26.3ZM57.6 12.1L61.4 16.7L49.9 26.3L46.1 21.7ZM84.4 23L87.9 29L49.8 51L46.3 45ZM68.4 20.7L74.3 21.7L71.7 36.5L65.8 35.5ZM83.9 38.3L81.9 43.9L67.8 38.8L69.8 33.2ZM87.9 67L84.4 73L46.3 51L49.8 45ZM81.9 52.1L83.9 57.7L69.8 62.8L67.8 57.2ZM74.3 74.3L68.4 75.3L65.8 60.5L71.7 59.5ZM51.5 92L44.5 92L44.5 48L51.5 48ZM61.4 79.3L57.6 83.9L46.1 74.3L49.9 69.7ZM38.4 83.9L34.6 79.3L46.1 69.7L49.9 74.3ZM11.6 73L8.1 67L46.3 45L49.8 51ZM27.6 75.3L21.7 74.3L24.3 59.5L30.2 60.5ZM12.1 57.7L14.1 52.1L28.2 57.2L26.2 62.8ZM8.1 29L11.6 23L49.8 45L46.3 51ZM14.1 43.9L12.1 38.3L26.2 33.2L28.2 38.8ZM21.7 21.7L27.6 20.7L30.2 35.5L24.3 36.5Z';

// Candy cane: white hook with red stripes on the shaft and the curve.
const CANE =
  'M52 30V86A6 6 0 0 0 64 86V30A24 24 0 0 0 16 30V38A6 6 0 0 0 28 38V30A12 12 0 0 1 52 30Z';
const CANE_STRIPES =
  'M52 42L64 35V41L52 48ZM52 58L64 51V57L52 64ZM52 74L64 67V73L52 80ZM63.2 23.8A24 24 0 0 0 58.4 14.6L49.2 22.3A12 12 0 0 1 51.6 26.9ZM46.2 6.8A24 24 0 0 0 35.8 6.4L37.9 18.2A12 12 0 0 1 43.1 18.4ZM23 13A24 24 0 0 0 17.4 21.8L28.7 25.9A12 12 0 0 1 31.5 21.5Z';

/** @type {import('../../contracts').ThemePack} */
export default {
  id: 'christmas',
  name: 'Christmas',
  holiday: 'christmas',
  palette: {
    bg: '#040609',
    accent: '#d72228',
    accentSoft: '#d7222833',
    glow: '#dff3ff',
    ink: '#f2f2f2',
    muted: '#9e9e9e',
    hazard: '#2fa84f',
    pickup: '#8fd8ff',
  },
  particles: {
    count: 200,
    color: '#dff3ff',
    size: [1, 3],
    speed: [10, 28],
    drift: 'down',
    twinkle: true,
  },
  sprites: {
    benjo: {
      ...baseBenjo,
      paths: [
        ...baseBenjo.paths,
        { d: HAT, fill: 'accent' },
        { d: HAT_TRIM, fill: 'ink' },
      ],
    },
    hazards: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: SNOWMAN_BODY, fill: 'ink' },
          { d: SNOWMAN_HAT, fill: 'hazard' },
          { d: SNOWMAN_SCARF, fill: 'accent' },
          { d: SNOWMAN_NOSE, fill: '#ff8a3d' },
          { d: SNOWMAN_COAL, fill: 'bg' },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: PRESENT_BOTTOM, fill: 'accent' },
          { d: PRESENT_TOP, fill: 'hazard' },
          { d: PRESENT_RIBBON, fill: '#f5c542' },
        ],
      },
    ],
    pickups: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [{ d: SNOWFLAKE, fill: 'pickup' }],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: CANE, fill: 'ink' },
          { d: CANE_STRIPES, fill: 'accent' },
        ],
      },
    ],
  },
  tagline: 'HO HO HO',
};
