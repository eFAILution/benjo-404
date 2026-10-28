// @ts-check
// Fix the Link tuning. Lengths are CSS px at the reference height, times are seconds.
// World code multiplies lengths by `unit`, which follows canvas height.

// Layout (shared safe area, copied from flight, A-13.4)
export const REF_HEIGHT = 640;
export const UNIT_MIN = 0.6;
export const UNIT_MAX = 1.25;
export const CEILING = 64;
export const CEILING_NARROW = 96;
export const NARROW_WIDTH = 600;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;
export const SIDE_PAD = 16;
export const BOTTOM_PAD = 16;
/** Room left around the board inside the play rect. */
export const BOARD_MARGIN = 16;
/** The timer bar sits this far under the ceiling, BAR_H tall, inside BAR_ZONE of space. */
export const BAR_GAP = 8;
export const BAR_H = 4;
export const BAR_ZONE = 24;
/** Largest tile, before unit scaling. */
export const TILE_MAX = 72;
/** Tiles of width kept free beside the board for Benjo on the left and home on the right. */
export const SIDE_TILES = 2.2;
/** Benjo and home sit this many tiles out from the board edge. */
export const SIDE_OFFSET = 0.6;
export const SPRITE_FRAC = 0.9;

// Board
/** Board size per round; the last entry repeats for every later round. */
export const BOARD_COLS = [4, 5, 5, 6];
export const BOARD_ROWS = [4, 4, 5, 5];
/** Largest board, so every array is allocated once. */
export const MAX_CELLS = 30;
/** Chance a path tile gains a dead-end arm, so the solved board has red herrings. */
export const HERRING_CHANCE = 0.2;

// Clock and score
export const CLOCK_START = 60;
export const SOLVE_BONUS_T = 15;
export const CLOCK_CAP = 90;
export const BOARD_SCORE = 100;
/** The bar turns hazard colored under this many seconds. */
export const CLOCK_LOW = 10;
/** Pause with the whole path lit before the next board. */
export const SOLVED_T = 0.8;

// Input
/** Inputs this early in a run are the press that started it. */
export const START_GRACE = 0.12;
/** A host tap that echoes a pointer press within this window is the same press. */
export const TAP_ECHO = 0.4;

// Motion
export const ROT_T = 0.12;
export const BOB_AMP = 2;
export const BOB_RATE = 3;
export const PULSE_AMP = 0.08;
export const PULSE_RATE = 7;
export const HOME_DIM = 0.5;

// Drawing
export const ARM_FRAC = 0.22;
export const TILE_INSET = 4;
export const TILE_RADIUS = 6;
export const TILE_ALPHA = 0.08;
export const TRACK_ALPHA = 0.16;
export const CURSOR_W = 2;
/** Flame triangle: where it starts left of the board, its tip inside, and its half height. */
export const FLAME_BACK = 0.16;
export const FLAME_TIP = 0.08;
export const FLAME_HALF = 0.08;

// Feedback
/** Hit stop before the game over card when the clock runs out. */
export const END_T = 0.4;
export const SHAKE_PX = 6;
export const SHAKE_T = 0.25;
export const FLASH_EVERY = 0.06;
export const HINT_T = 3;
export const NEW_BEST_T = 1.5;

// Power-ups (#22)
/** Seconds the Digital Twin puts back on the clock when it runs out. */
export const TWIN_CLOCK = 10;
/** Most wrong path tiles one Garbage Collector sets right, nearest the start first. */
export const GC_FIX = 3;

// Events raised by one step
export const EVENT_TURN = 1;
export const EVENT_SOLVED = 2;
export const EVENT_TIMEOUT = 4;
