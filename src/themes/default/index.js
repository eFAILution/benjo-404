// @ts-check
// Brand look: near black, red accent, orange particle glow from the globe
// video. Hazards are broken links, pickups are glowing orbs.
import { benjo } from '../../assets/benjo.js';
import { BRAND_RED, BRAND_RED_SOFT } from '../../assets/brand.js';

// Broken chain link: two U halves pulled apart, with a spark in the gap.
const LINK_HALVES =
  'M33.2 43.1L21.1 55.1A14 14 0 0 0 40.9 74.9L52.9 62.8L48 57.9L36 69.9A7 7 0 0 1 26.1 60L38.1 48ZM43.1 33.2L55.1 21.1A14 14 0 0 1 74.9 40.9L62.8 52.9L57.9 48L69.9 36A7 7 0 0 0 60 26.1L48 38.1Z';
const LINK_SPARK = 'M59 48L49.8 49.8L48 59L46.2 49.8L37 48L46.2 46.2L48 37L49.8 46.2Z';

// Missing file: a page with a folded corner and a red X.
const FILE_PAGE = 'M18 10Q18 4 24 4H58L80 26V86Q80 92 74 92H24Q18 92 18 86Z';
const FILE_FOLD = 'M58 4V20Q58 26 64 26H80Z';
const FILE_X =
  'M59.3 38L67 45.7L56.8 56L67 66.3L59.3 74L49 63.8L38.7 74L31 66.3L41.2 56L31 45.7L38.7 38L49 48.2Z';

// Glowing orb: halo rings around a bright core.
const ORB_HALO = 'M2 48a46 46 0 1 1 92 0a46 46 0 1 1 -92 0Z';
const ORB_RING = 'M14 48a34 34 0 1 1 68 0a34 34 0 1 1 -68 0Z';
const ORB_CORE = 'M26 48a22 22 0 1 1 44 0a22 22 0 1 1 -44 0Z';
const ORB_SHINE = 'M34 43a9 9 0 1 1 18 0a9 9 0 1 1 -18 0Z';

// HUD diamond: an outlined diamond around a solid one.
const DIAMOND_FRAME = 'M48 2L94 48L48 94L2 48ZM82 48L48 82L14 48L48 14Z';
const DIAMOND_CORE = 'M48 26L70 48L48 70L26 48Z';

/** @type {import('../../contracts').ThemePack} */
export default {
  id: 'default',
  name: 'Beast Code',
  holiday: 'default',
  palette: {
    bg: '#040404',
    accent: BRAND_RED,
    accentSoft: BRAND_RED_SOFT,
    glow: '#ff8a3d',
    ink: '#f2f2f2',
    muted: '#9e9e9e',
    hazard: BRAND_RED,
    pickup: '#ff8a3d',
  },
  particles: {
    count: 220,
    color: '#ff8a3d',
    size: [1, 2.5],
    speed: [4, 14],
    drift: 'up',
    twinkle: true,
  },
  sprites: {
    benjo,
    hazards: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: LINK_HALVES, fill: 'hazard' },
          { d: LINK_SPARK, fill: 'glow' },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: FILE_PAGE, fill: 'ink' },
          { d: FILE_FOLD, fill: 'muted' },
          { d: FILE_X, fill: 'hazard' },
        ],
      },
    ],
    pickups: [
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: ORB_HALO, fill: '#ff8a3d26' },
          { d: ORB_RING, fill: '#ff8a3d4d' },
          { d: ORB_CORE, fill: 'pickup' },
          { d: ORB_SHINE, fill: '#ffd9b8' },
        ],
      },
      {
        viewBox: [0, 0, 96, 96],
        paths: [
          { d: DIAMOND_FRAME, fill: 'pickup' },
          { d: DIAMOND_CORE, fill: '#ffc08a' },
        ],
      },
    ],
  },
  tagline: 'ONE TEAM',
};
