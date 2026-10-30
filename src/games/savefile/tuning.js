// @ts-check
// Save the File tuning (#92). The level is drawn in level units, LEVEL_W by LEVEL_H with y down,
// scaled to the play rect. Times are seconds, speeds are level units per second.

// Layout, with the same safe area as the other games (A-13.4).
export const CEILING = 64;
export const CEILING_NARROW = 96;
export const NARROW_WIDTH = 600;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;
export const SIDE_PAD = 16;
export const BOTTOM_PAD = 16;
export const LEVEL_W = 448;
export const LEVEL_H = 512;
/** On a tall screen the level may stretch this much taller than wide; sprites keep their shape. */
export const STRETCH_MAX = 1.4;

// Benjo
export const BENJO_H = 28;
/** Hitbox half width and height, so a near miss reads as a miss. */
export const BENJO_HALF_W = 6;
export const BENJO_HIT_H = 22;
export const WALK = 72;
export const CLIMB = 54;
export const JUMP_V = 250;
export const GRAVITY = 700;
/** Benjo can start up or down a ladder this far from it. */
export const LADDER_REACH = 10;
/** A held finger only walks Benjo after this long, so a tap to jump does not also step. */
export const HOLD_T = 0.15;

// Bugs
export const BUG_R = 9;
export const BUG_POOL = 12;
export const BUG_SPEED = 62;
export const BUG_SPEED_LEVEL = 0.1;
export const BUG_SPEED_CAP = 100;
export const BUG_SPEED_CAP_REDUCED = 84;
/** A bug falling off a girder end drifts on at this share of its speed. */
export const FALL_DRIFT = 0.3;
export const THROW_T = 2.6;
export const THROW_T_STEP = 0.25;
export const THROW_T_MIN = 1.3;
/** Each throw gap is the level's interval times 1 plus or minus this. */
export const THROW_JITTER = 0.3;
/** The first bug of a life comes this long after it starts. */
export const FIRST_THROW = 1.2;
export const LADDER_CHANCE = 0.25;
export const LADDER_CHANCE_STEP = 0.08;
export const LADDER_CHANCE_MAX = 0.5;
/** Bugs climb down a ladder at this share of their rolling speed. */
export const LADDER_PACE = 0.7;
/**
 * A bug skips a ladder while another rolls this close to its foot, so bugs never land in a pair
 * too tight to jump one at a time.
 */
export const LADDER_GAP = 72;

// Score, lives, and the clock
export const JUMP_SCORE = 10;
export const ORB_SCORE = 5;
export const CLEAR_SCORE = 50;
/** Points per whole second left on the clock when the file is saved. */
export const TIME_SCORE = 1;
export const TIME_START = 60;
export const LIVES = 3;
export const ORB_R = 8;

// Timing
/** Inputs this early in a run are the press that started it. */
export const START_GRACE = 0.12;
/** Pause after a lost life, and after a saved file, before the level starts again. */
export const HIT_T = 1.2;
export const CLEAR_T = 1.6;
export const DEATH_PAUSE = 0.8;
export const HINT_T = 3;
export const STATUS_T = 1.5;
export const NEW_BEST_T = 1.5;

// Look
export const GIRDER_T = 8;
export const RUNG_GAP = 8;
export const SHAKE_PX = 6;
export const SHAKE_T = 0.3;

// Events raised by one step
export const EVENT_JUMP = 1;
export const EVENT_HOP = 2;
export const EVENT_ORB = 4;
export const EVENT_HIT = 8;
export const EVENT_CLEAR = 16;
export const EVENT_THROW = 32;

// Power-ups (#22)
/** After the Digital Twin takes a hit, bugs pass through Benjo for this long. */
export const GRACE_T = 1.5;
export const GRACE_BLINK = 0.1;
export const GRACE_ALPHA = 0.35;
/** Load Balancer: orbs on Benjo's girder slide to him this fast. */
export const MAGNET_V = 140;
