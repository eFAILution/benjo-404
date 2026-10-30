// @ts-check
// Benjo Pinball tuning (ADR-0076). Lengths are table units: every deck is 400 by 600 units and is
// scaled to fit the canvas. Times are seconds, speeds units per second.

// Layout (the same safe area as every game, A-13.4)
export const TABLE_W = 400;
export const TABLE_H = 600;
/** The HUD strip covers the top of the canvas: 56px, 88px under 600px wide. */
export const CEILING = 64;
export const CEILING_NARROW = 96;
export const NARROW_WIDTH = 600;
export const PAD = 8;
/** Width the twin health board needs beside the table, in CSS px. */
export const BOARD_W = 168;

// Physics
export const SUBSTEPS = 8;
export const BALL_R = 8;
export const GRAVITY = 1050;
/** Under one ball radius per substep, so a ball never passes through a wall. */
export const MAX_SPEED = 1900;
export const WALL_E = 0.45;
export const WALL_GRIP = 0.995;
export const BUMPER_KICK = 620;
export const SLING_KICK = 520;
/** A ball must hit a slingshot or drop target at least this hard to fire it. */
export const HIT_MIN = 90;
/** Under this far below the table, a ball has drained. */
export const DRAIN_Y = TABLE_H + 24;

// Flippers
export const FLIP_LEN = 58;
export const FLIP_BASE_R = 9;
export const FLIP_TIP_R = 5;
export const FLIP_REST = 0.52;
export const FLIP_UP = -0.42;
export const FLIP_UP_SPEED = 22;
export const FLIP_DOWN_SPEED = 14;
export const FLIP_E = 0.28;

// Plunger
export const PULL_T = 0.9;
export const LAUNCH_MIN = 1050;
export const LAUNCH_MAX = 1850;
/** Ball saves and twin balls launch at this pull. */
export const AUTO_PULL = 0.72;

// Table pieces
export const SPIN_PER_SPEED = 0.03;
export const SPIN_DECAY = 2.2;
export const SAUCER_HOLD = 1.2;
export const SAUCER_GRAB = 900;
export const RAMP_T = 0.6;
export const DROP_RESET_T = 1.2;
export const TARGET_COOLDOWN = 0.25;
export const DECK_SLIDE_T = 0.3;
/** A ball this still for this long with no flipper held gets a kick, like a real machine's ball search. */
export const STILL_SPEED = 12;
export const STILL_T = 3;

// Rules
export const BALLS = 3;
export const BALL_SAVE_T = 10;
export const SKILL_T = 4;
export const COMBO_T = 3;
export const COMBO_MAX = 3;
export const MULT_MAX = 5;
export const NUDGE_V = 70;
export const NUDGE_WINDOW = 4;
export const NUDGE_WARN = 3;
export const QUARTERS_T = 30;
export const QUARTERS_REPAIRS = 3;
export const EXTRA_BALL_AT = 500000;
export const DRAIN_PAUSE = 1.4;
export const END_PAUSE = 1.6;

// Scores
export const SCORE = {
  bumper: 1000,
  sling: 250,
  lane: 2500,
  spin: 150,
  drop: 3000,
  bank: 15000,
  stand: 5000,
  loop: 10000,
  ramp: 20000,
  lock: 25000,
  inlane: 1000,
  skill: 50000,
  repair: 25000,
  operational: 1000000,
  jackpot: 100000,
  jackpotStep: 50000,
  egg: 75000,
  letter: 20000,
  benjo: 250000,
  bug: 500,
  bonusRepair: 5000,
  bonusBug: 500,
};

/**
 * The twin health board (ADR-0076): each ship system and the shot that repairs it.
 * `need` hits of `kind`; with `ids`, that many different ones.
 * @type {Array<{ name: string, kind: string, need: number, ids?: boolean }>}
 */
export const SYSTEMS = [
  { name: 'Propulsion', kind: 'loop', need: 2, ids: true },
  { name: 'O2 Generation', kind: 'drop', need: 3, ids: true },
  { name: 'Cryogenic Cooling', kind: 'bumper', need: 15 },
  { name: 'Electrical Dist.', kind: 'spin', need: 40 },
  { name: 'Hangar Equipment', kind: 'lock', need: 1 },
  { name: 'Ship Access', kind: 'ramp', need: 1 },
  { name: 'Hull', kind: 'sling', need: 5 },
  { name: 'Fuel Service', kind: 'loopL', need: 3 },
  { name: 'Air Distribution', kind: 'ship', need: 1 },
  { name: 'Ship Control', kind: 'stand', need: 2, ids: true },
  { name: 'Electrolyte Hyd.', kind: 'inlane', need: 2, ids: true },
  { name: 'Virtual', kind: 'chair', need: 10 },
];

/** Bugs crawl out of the nose hatch: one more for every this many points, up to BUG_MAX. */
export const BUG_EVERY = 40000;
export const BUG_MAX = 4;
export const BUG_SPEED = 18;

// Look
export const SHAKE_T = 0.18;
export const SHAKE_PX = 4;
export const FLASH_T = 0.2;
export const POP_T = 0.9;
export const TRAIL = 5;
