// @ts-check
// Bug Belt tuning (#94). Distances are CSS px at the reference height, scaled by `unit`. Times
// are seconds, speeds are px per second at that height, angles are radians with 0 pointing right.

// Layout, with the same safe area as the other games (A-13.4).
export const REF_HEIGHT = 640;
export const UNIT_MIN = 0.6;
export const UNIT_MAX = 1.25;
export const CEILING = 64;
export const CEILING_NARROW = 96;
export const NARROW_WIDTH = 600;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;
export const BOTTOM_PAD = 16;

// The ship
export const SHIP_H = 30;
/** Hit radius as a share of the drawn ship's height, so near misses read as misses. */
export const SHIP_HIT = 0.4;
export const TURN_RATE = 4.4;
export const THRUST = 420;
/** Speed lost per second while coasting, as a decay rate. */
export const DRAG = 0.7;
export const MAX_V = 360;
/** A held finger farther than this from the ship flies it there; nearer, the ship only aims. */
export const THRUST_NEAR = 90;

// Shots
export const SHOT_V = 520;
export const SHOT_LIFE = 0.7;
export const SHOT_POOL = 5;
export const SHOT_R = 2.5;
/** Seconds between shots while fire is held. */
export const FIRE_GAP = 0.2;

// Bugs, by size: 0 big, 1 medium, 2 small. A shot splits a bug into SPLIT of the next size.
export const BUG_R = [34, 20, 11];
/** A bug's hitbox as a share of its drawn radius. */
export const BUG_HIT = 0.8;
export const BUG_V_MIN = [32, 50, 75];
export const BUG_V_MAX = [56, 85, 115];
export const BUG_SPIN = 1.2;
export const SPLIT = 2;
export const WAVE_START = 4;
export const WAVE_MAX = 10;
/** Bugs move this much faster each wave, up to a cap that is lower with reduced motion. */
export const WAVE_SPEEDUP = 0.08;
export const SPEEDUP_CAP = 1.6;
export const SPEEDUP_CAP_REDUCED = 1.3;
export const BUG_POOL = WAVE_MAX * SPLIT * SPLIT;
/** New bugs and a returning ship keep at least this far apart, capped by the field's size. */
export const SAFE_R = 160;
export const SAFE_SHARE = 0.45;
/** A new wave's bugs head ways that miss a still ship for this long, checked every SAFE_STEP. */
export const SAFE_T = 3;
export const SAFE_STEP = 0.05;

// Orbs
export const ORB_CHANCE = 0.25;
export const ORB_POOL = 4;
export const ORB_H = 22;
export const ORB_LIFE = 6;
/** Orbs blink for their last seconds. */
export const ORB_FADE = 1.5;
export const ORB_DRIFT = 0.3;

// Score and lives
export const BUG_SCORE = [5, 10, 20];
export const ORB_SCORE = 10;
export const WAVE_BONUS = 50;
export const LIVES = 3;

// Timing
/** Inputs this early in a run are the press that started it. */
export const START_GRACE = 0.12;
/** A lost ship waits at least this long, then until the middle is clear, to come back. */
export const RESPAWN_T = 1;
/** A ship that comes back, or that the Digital Twin saved, is safe this long. */
export const GRACE_T = 2;
export const GRACE_BLINK = 0.1;
export const GRACE_ALPHA = 0.35;
export const WAVE_PAUSE = 1.2;
export const DEATH_PAUSE = 0.8;
export const HINT_T = 3;
export const STATUS_T = 1.5;
export const NEW_BEST_T = 1.5;

// Feedback and look
export const POP_POOL = 8;
export const POP_T = 0.3;
export const POP_GROW = 14;
export const SHAKE_PX = 6;
export const SHAKE_T = 0.3;
export const STAR_COUNT = 50;
export const LIFE_H = 10;
export const LIFE_GAP = 16;

// Events raised by one step
export const EVENT_SHOT = 1;
export const EVENT_POP = 2;
export const EVENT_ORB = 4;
export const EVENT_WAVE = 8;
export const EVENT_HIT = 16;

// Power-ups (#22)
/** Load Balancer: orbs within this reach slide to the ship this fast. */
export const MAGNET_REACH = 220;
export const MAGNET_V = 260;
