// @ts-check
// Benjo Flight tuning. Lengths are CSS px at the reference height, times are seconds, speeds
// are px/s. World code multiplies lengths and speeds by `unit`, which follows canvas height.

// Layout
export const GROUND_FRAC = 0.78;
export const REF_HEIGHT = 640;
export const UNIT_MIN = 0.6;
export const UNIT_MAX = 1.25;
export const BENJO_X_FRAC = 0.3;
export const BENJO_X_MAX = 360;
export const BENJO_H = 40;
/**
 * The HUD strip covers the top of the canvas while playing (--strip-h in the shell CSS: 56px,
 * 88px under 480px wide), so Benjo's ceiling sits just below it (A-13.4).
 */
export const CEILING = 64;
export const CEILING_NARROW = 96;
export const NARROW_WIDTH = 480;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;

// Flap feel. Screen y grows downward, so a flap sets a negative vy.
export const GRAVITY = 1600;
export const FLAP_V = 420;
export const MAX_FALL = 700;
/** Hitbox radius as a fraction of Benjo's height, so near misses read as misses. */
export const HIT_R = 0.34;
/** Inputs this early in a run are the press that started it, not a flap. */
export const START_GRACE = 0.12;
/** A host tap that echoes a pointer press within this window is the same press. */
export const TAP_ECHO = 0.4;
export const HOVER_AMP = 6;
export const HOVER_RATE = 4;

// Towers
export const TOWER_W = 64;
export const TOWER_SPACING = 260;
/** Wide screens space towers by width instead, so the pool always covers the screen. */
export const TOWERS_PER_SCREEN = 6;
export const TOWER_POOL = 10;
/** Gap centers keep this far from the ceiling and the ground. */
export const GAP_EDGE = 50;
/** Most a gap center may move from one tower to the next. */
export const GAP_SHIFT = 150;
export const GAP_START = 170;
export const GAP_MIN = 135;
export const GAP_STEP = 2;
export const BRICK_H = 16;
export const BRICK_W = 32;
export const CAP_H = 28;

// Speed and score
export const SPEED_START = 170;
export const SPEED_STEP = 4;
export const SPEED_CAP = 260;
export const SPEED_CAP_REDUCED = 210;
export const PICKUP_SCORE = 2;

// Pickups
export const PICKUP_CHANCE = 0.45;
export const PICKUP_H = 22;
/** How far a pickup may sit from the line between two gap centers, as a fraction of the gap. */
export const PICKUP_SPREAD = 0.3;
export const PICKUP_POOL = 4;
export const POP_POOL = 4;
export const POP_T = 0.14;
export const POP_GROW = 16;

// Feedback
/** Hit stop before the game over card so the player sees what got them. */
export const DEATH_PAUSE = 0.6;
export const SHAKE_PX = 6;
export const SHAKE_T = 0.25;
export const FLASH_EVERY = 0.06;
export const TILT_UP = -0.35;
export const TILT_DOWN = 0.6;
export const HINT_T = 3;
export const NEW_BEST_T = 1.5;

// Events raised by one step
export const EVENT_FLAP = 1;
export const EVENT_SCORE = 2;
export const EVENT_PICKUP = 4;
export const EVENT_HIT = 8;
