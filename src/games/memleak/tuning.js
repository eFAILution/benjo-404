// @ts-check
// Memory Leak tuning (#106). The heap is a grid of cells; rows count up from the floor, so row 0
// is the bottom. Times are seconds, fall speeds are rows per second.

// Layout, with the same safe area as the other games (A-13.4). The grid never changes size; the
// cell size follows the canvas, so every screen plays the same heap.
export const COLS = 10;
export const ROWS = 12;
/** Rows of open air above the heap that a new block falls through before it can land. */
export const LANE = 2;
export const CEILING = 64;
export const CEILING_NARROW = 96;
export const NARROW_WIDTH = 600;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;
export const SIDE_PAD = 16;
export const BOTTOM_PAD = 16;
/** The compact meter stands beside the heap: its width and gap, in cells. */
export const METER_W = 0.4;
export const METER_GAP = 0.4;

// Blocks
export const MIN_W = 1;
export const MAX_W = 4;
/** Every cell can hold a 1-wide block, so the pool never runs out. */
export const BLOCK_POOL = COLS * ROWS;
/** Points when a block frees, by width. */
export const FREE_SCORE = [0, 1, 3, 6, 10];
export const ROW_BONUS = 20;

// Pace: it rises from the start values by the ramp each second, up to the caps.
export const FALL_START = 1;
export const FALL_RAMP = 0.012;
export const FALL_CAP = 2.4;
export const FALL_CAP_REDUCED = 1.8;
/** The wait between one block landing and the next one appearing. */
export const GAP_START = 0.7;
export const GAP_RAMP = 0.003;
export const GAP_MIN = 0.3;
/** How long a placed block lives, give or take LIFE_SPREAD of it. */
export const LIFE_START = 8;
export const LIFE_RAMP = 0.08;
export const LIFE_MAX = 18;
export const LIFE_SPREAD = 0.3;

// Compact
/** Freed cells it takes to fill the compact meter. */
export const COMPACT_CHARGE = 16;

// Keys: a held arrow moves once, waits, then repeats.
export const MOVE_DELAY = 0.17;
export const MOVE_GAP = 0.06;
/** A finger has to slide this far, in CSS px, before a press counts as a drag and not a tap. */
export const DRAG_PX = 12;

// Timing
/** Inputs this early in a run are the press that started it. */
export const START_GRACE = 0.12;
/** The first block appears this long after the start. */
export const FIRST_GAP = 0.4;
export const DEATH_PAUSE = 0.8;
export const HINT_T = 3;
export const STATUS_T = 1.5;
export const NEW_BEST_T = 1.5;

// Feedback and look
export const POP_POOL = 24;
export const POP_T = 0.35;
/** Blocks that compact slide down over this long; with reduced motion they jump. */
export const SETTLE_T = 0.15;
/** A block's life bar turns to the warning color for its last share of life. */
export const LIFE_WARN = 0.25;
export const SHAKE_PX = 5;
export const SHAKE_T = 0.3;

// Events raised by one step
export const EVENT_LAND = 1;
export const EVENT_FREE = 2;
export const EVENT_FLUSH = 4;
export const EVENT_COMPACT = 8;
export const EVENT_READY = 16;
export const EVENT_OVERFLOW = 32;
export const EVENT_SAVED = 64;

// Power-ups (#22)
/** Digital Twin: an overflow it absorbs clears this many rows off the top of the heap. */
export const TWIN_ROWS = 4;
