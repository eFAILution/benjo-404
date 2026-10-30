// @ts-check
// Stack the Server tuning. Lengths are CSS px at the reference height, times are seconds, speeds
// are px/s. World code multiplies lengths and speeds by `unit`, which follows canvas height.

// Layout
export const REF_HEIGHT = 640;
export const UNIT_MIN = 0.6;
export const UNIT_MAX = 1.25;
/** The HUD strip covers the top of the canvas, so play starts below it (A-13.4). */
export const CEILING = 64;
export const CEILING_NARROW = 96;
export const NARROW_WIDTH = 600;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;
export const SIDE_PAD = 16;
export const BOTTOM_PAD = 16;
export const BLOCK_H = 22;
/** Blocks never get thinner than this, whatever the unit. */
export const BLOCK_H_MIN = 14;
export const BASE_W = 160;
/** The base block is never wider than this share of the play width. */
export const BASE_W_FRAC = 0.5;
/** The moving block slides this many block heights above its landing level, for the drop. */
export const SLIDE_LIFT = 0.5;

// Camera and blocks
/** The camera follows once the stack is taller than this share of the play height. */
export const CAM_FRAC = 0.4;
export const CAM_T = 0.15;
export const MAX_BLOCKS = 40;
/** Levels the ring keeps beyond the visible stack, so a block never vanishes on screen. */
export const CAM_SPARE = 4;

// Slide speed
export const SLIDE_START = 180;
export const SLIDE_STEP = 8;
/** Caps are plain px/s, not scaled: at most 7 px per step, so every pass offers a perfect. */
export const SLIDE_CAP = 420;
export const SLIDE_CAP_REDUCED = 340;

// Drop
/** Inputs this early in a run are the press that started it, not a drop. */
export const START_GRACE = 0.12;
/** The landed block's fall, for the eye only; the landing itself is instant. */
export const DROP_T = 0.1;
export const PERFECT_TOL = 4;
/** Just over half the fastest step (SLIDE_CAP / 60 / 2 = 3.5 px), so a perfect always exists. */
export const PERFECT_MIN = 3.6;
export const PERFECT_STREAK = 3;
export const WIDEN = 8;
export const PERFECT_T = 0.6;

// Cut pieces
export const CUT_POOL = 4;
export const CUT_GRAVITY = 1400;
export const CUT_T = 0.5;

// Benjo, sized and placed in block heights
export const BENJO_H = 1.8;
export const BENJO_LIFT = 1.1;
export const BOB_PX = 3;
export const BOB_RATE = 4;
/** How fast Benjo glides to the next block, as a share of the distance per second. */
export const BENJO_EASE = 18;

// Feedback
/** Hit stop before the game over card so the player sees the miss. */
export const DEATH_PAUSE = 0.6;
export const SHAKE_PX = 6;
export const SHAKE_T = 0.25;
export const FLASH_EVERY = 0.06;
export const HINT_T = 3;
export const NEW_BEST_T = 1.5;

// Power-ups (#22)
/** After the Digital Twin saves a miss, the next block waits this long and drops are ignored. */
export const TWIN_GRACE = 1;
/** Benjo blinks at this alpha while the twin's grace runs. */
export const GRACE_ALPHA = 0.4;

// Events raised by one step
export const EVENT_LAND = 1;
export const EVENT_PERFECT = 2;
export const EVENT_WIDEN = 4;
export const EVENT_MISS = 8;
