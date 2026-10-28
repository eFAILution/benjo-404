// @ts-check
// Code Crossing tuning. Lengths are CSS px at the reference height or cells, times are seconds.
// Lane speeds are px/s at the reference cell, so a lane moves the same cells per second at any size.

// Layout (copied from flight so every game keeps the same safe area, A-13.4)
export const REF_HEIGHT = 640;
export const UNIT_MIN = 0.6;
export const UNIT_MAX = 1.25;
/** The HUD strip covers the top of the canvas: 56px, 88px under 600px wide. */
export const CEILING = 64;
export const CEILING_NARROW = 96;
export const NARROW_WIDTH = 600;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;
export const BOTTOM_PAD = 16;
export const SIDE_PAD = 16;

// Board
/** Row 0 is the start curb, rows 1..7 are lanes, row 8 is the goal curb. */
export const ROWS = 9;
export const LANES = 7;
export const GOAL_ROW = 8;
/** Largest cell at unit 1, in px; also the reference cell for lane speeds. */
export const CELL_MAX = 64;
export const COLS_MIN = 5;
/** Timer bar sits this far below the ceiling (as in whack). */
export const TIMER_GAP = 8;
export const TIMER_H = 4;
/** Room kept above the rows for the timer bar. */
export const TIMER_ROOM = 24;

// Sizes as fractions of a cell
export const BENJO_H = 0.8;
export const BLOCK_H = 0.7;
export const BLOCK_R = 0.12;
export const BLOCK_SPRITE_H = 0.55;
export const ORB_H = 0.6;
/** Code line bars inside a block: left inset, heights, and widths per block cell. */
export const CODE_INSET = 0.15;
export const CODE_BAR_H = 0.08;
export const CODE_BAR_W = [0.5, 0.3];
export const CODE_BAR_Y = [0.32, 0.58];
export const CODE_ALPHA = 0.5;
export const BLOCK_ALPHA = 0.85;
export const CURB_ALPHA = 0.08;
export const LINE_ALPHA = 0.16;
export const DASH = 8;
export const DASH_GAP = 6;
export const LIFE_R = 3;
export const LIFE_SPACING = 14;

// Lanes
export const LEN_MIN = 1;
export const LEN_MAX = 3;
export const GAP_MIN = 2;
export const GAP_MAX = 4;
export const ORB_CHANCE = 0.5;
export const LANE_SPEED_BASE = 60;
export const LANE_SPEED_STEP = 18;
export const LEVEL_SPEED = 15;
export const LANE_SPEED_CAP = 260;
export const LANE_SPEED_CAP_REDUCED = 200;
/** A block's hit interval is shrunk by this many cells on each side, so near misses miss. */
export const HIT_MARGIN = 0.3;
/** Benjo picks an orb up within this many cells of its center. */
export const ORB_REACH = 0.5;

// Rules and score
export const LIVES = 3;
export const CROSS_T = 20;
export const HOP_T = 0.12;
export const ROW_SCORE = 10;
export const GOAL_SCORE = 100;
export const ORB_SCORE = 25;
/** Inputs this early in a run are the press that started it. */
export const START_GRACE = 0.12;
/** A host tap that echoes a pointer press within this window is the same press. */
export const TAP_ECHO = 0.4;
/** The timer bar turns hazard colored below this many seconds. */
export const CLOCK_LOW = 5;

// Feedback
/** Hit stop after a lost life, with Benjo tinted. */
export const HIT_T = 0.8;
/** Hit stop before the game over card so the player sees what got them. */
export const DEATH_PAUSE = 0.6;
export const SHAKE_PX = 6;
export const SHAKE_T = 0.25;
export const FLASH_EVERY = 0.06;
export const HINT_T = 3;
export const STATUS_T = 1.5;
export const NEW_BEST_T = 1.5;

// Events raised by one step
export const EVENT_HOP = 1;
export const EVENT_SCORE = 2;
export const EVENT_ORB = 4;
export const EVENT_HIT = 8;
export const EVENT_LEVEL = 16;
