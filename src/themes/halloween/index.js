// @ts-check
// Halloween: purple-black night, orange accent, amber embers falling.
// Benjo wears a witch hat. Hazards are a jack-o'-lantern, a tombstone, and
// a ghost; pickups are wrapped candy and a bat.
import { benjo as baseBenjo } from '../../assets/benjo.js';

// Witch hat in Benjo's own 620-unit viewBox: crooked cone plus brim, band.
const HAT =
  'M356 368C376 316 390 236 418 148L340 188C380 192 402 208 410 222C430 282 448 334 466 388ZM300.5 347.1a115 24 12 1 1 225 47.8a115 24 12 1 1 -225 -47.8Z';
const HAT_BAND = 'M364 334L454 356L460 376L359 356Z';

// Jack-o'-lantern: three lobes, ribs, stem, and a lit face.
const PUMPKIN_BODY =
  'M6 59a24 31 0 1 1 48 0a24 31 0 1 1 -48 0ZM42 59a24 31 0 1 1 48 0a24 31 0 1 1 -48 0ZM20 57a28 34 0 1 1 56 0a28 34 0 1 1 -56 0Z';
const PUMPKIN_RIBS = 'M36 26Q26 58 36 91Q31 58 36 26ZM60 26Q70 58 60 91Q65 58 60 26Z';
const PUMPKIN_STEM = 'M43 26L44 12Q45 5 52 3L56 7Q51 9 51 14L53 26Z';
const PUMPKIN_FACE =
  'M25 50H41L33 37ZM55 50H71L63 37ZM44 61H52L48 54ZM20 66L31 70V77H37V72H59V77H65V70L76 66C71 89 25 89 20 66Z';

// Tombstone on a mound, with a carved cross and a crack.
const TOMB_MOUND = 'M6 96Q48 76 90 96Z';
const TOMB_STONE = 'M20 90V36A28 28 0 0 1 76 36V90Z';
const TOMB_CARVING =
  'M45 24H51V34H60V40H51V60H45V40H36V34H45ZM66 50L60 58L64 64L58 74L61 75L67 64L63 58L69 51Z';

// Ghost with a ragged hem.
const GHOST_BODY =
  'M14 92V44A34 34 0 0 1 82 44V92Q74 80 66 92Q58 80 50 92Q42 80 34 92Q26 80 18 92Q16 88 14 92Z';
const GHOST_FACE =
  'M32 46a5 8 0 1 1 10 0a5 8 0 1 1 -10 0ZM54 46a5 8 0 1 1 10 0a5 8 0 1 1 -10 0ZM42 66a6 8 0 1 1 12 0a6 8 0 1 1 -12 0Z';

// Wrapped candy: twisted ends, striped middle.
const CANDY_ENDS = 'M30 48L6 28Q12 48 6 68ZM66 48L90 28Q84 48 90 68Z';
const CANDY_BODY = 'M26 48a22 18 0 1 1 44 0a22 18 0 1 1 -44 0Z';
const CANDY_STRIPES =
  'M38 33Q34 48 38 63L43 64.5Q39 48 43 31.5ZM50 31Q46 48 50 65L55 64Q51 48 55 32Z';

// Bat with scalloped wings.
const BAT =
  'M48 26L52 26L55 16L57 28Q66 22 78 14Q86 18 94 32Q84 32 80 40Q72 36 66 44Q60 42 56 50Q52 46 48 58Q44 46 40 50Q36 42 30 44Q24 36 16 40Q12 32 2 32Q10 18 18 14Q30 22 39 28L41 16L44 26Z';

/** @type {import('../../contracts').ThemePack} */
export default {
  id: 'halloween',
  name: 'Halloween',
  holiday: 'halloween',
  palette: {
    bg: '#07040a',
    accent: '#ff7a1a',
    accentSoft: '#ff7a1a33',
    glow: '#ffb347',
    ink: '#f2f2f2',
    muted: '#9e9e9e',
    hazard: '#7a3cff',
    pickup: '#ffb347',
  },
  particles: {
    count: 160,
    color: '#ffb347',
    size: [1, 2.5],
    speed: [6, 18],
    drift: 'down',
    twinkle: true,
  },
  sprites: {
    benjo: {
      ...baseBenjo,
      paths: [...baseBenjo.paths, { d: HAT, fill: 'hazard' }, { d: HAT_BAND, fill: 'accent' }],
    },
    hazards: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: PUMPKIN_BODY, fill: 'accent' },
          { d: PUMPKIN_RIBS, fill: '#c4520f' },
          { d: PUMPKIN_STEM, fill: '#6b8e23' },
          { d: PUMPKIN_FACE, fill: '#ffd36b' },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: TOMB_MOUND, fill: '#3d2466' },
          { d: TOMB_STONE, fill: 'hazard' },
          { d: TOMB_CARVING, fill: '#3b1d80' },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: GHOST_BODY, fill: 'ink' },
          { d: GHOST_FACE, fill: 'bg' },
        ],
      },
    ],
    pickups: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: CANDY_ENDS, fill: 'accent' },
          { d: CANDY_BODY, fill: 'pickup' },
          { d: CANDY_STRIPES, fill: '#fff1d6' },
        ],
      },
      {
        viewBox: [0, 0, 96, 72],
        paths: [{ d: BAT, fill: 'pickup' }],
      },
    ],
  },
  tagline: 'BOO',
};
