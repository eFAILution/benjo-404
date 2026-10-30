// @ts-check
// Whack-a-Bug tuning. Lengths are CSS px at the reference height, times are seconds.
// World code multiplies lengths by `unit`, which follows canvas height.

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
/** Timer bar sits this far below the ceiling. */
export const TIMER_GAP = 8;
export const TIMER_H = 4;
/** Room kept above the grid for the timer bar. */
export const TIMER_ROOM = 24;
export const CELL_MAX = 160;
/** Grid column and row of each hole: center, up, right, down, left. */
export const HOLE_COL = [1, 1, 2, 1, 0];
export const HOLE_ROW = [1, 0, 1, 2, 1];
/** Slot size as a fraction of the cell. */
export const SLOT_W = 0.7;
export const SLOT_H = 0.28;
/** Code line bars above and below each slot. */
export const CODE_BAR_H = 4;
export const CODE_BAR_GAP = 0.08;
export const BUG_H = 0.5;
export const BENJO_H = 0.55;
/** How far above a hole's center Benjo hovers, as a fraction of the cell. */
export const BENJO_LIFT = 0.45;
export const BOB_AMP = 3;
export const BOB_RATE = 4;
export const STOMP_SCALE = 1.2;
export const STOMP_T = 0.1;

// Round
export const ROUND_T = 45;
/** Inputs this early in a run are the press that started it, not a whack. */
export const START_GRACE = 0.12;
export const SPAWN_T_START = 0.9;
export const SPAWN_T_MIN = 0.45;
export const UP_T_START = 1.1;
export const UP_T_MIN = 0.55;
/** Rise and sink time. */
export const POP_T = 0.12;
export const DECOY_CHANCE = 0.15;
/** Things up at once: one at the start, one more every MAX_UP_STEP_T, up to MAX_UP_CAP. */
export const MAX_UP_START = 1;
export const MAX_UP_STEP_T = 15;
export const MAX_UP_CAP = 3;

// Score
export const BUG_SCORE = 10;
export const COMBO_BONUS = 2;
export const COMBO_MAX = 10;
export const DECOY_COST = 5;
/** Combos this long and up are announced. */
export const COMBO_SHOW = 3;
export const COMBO_T = 0.6;
export const DECOY_T = 0.8;

// Feedback
/** Pause after the clock runs out so the last squash shows. */
export const END_T = 0.4;
export const WARN_T = 10;
export const SHAKE_PX = 6;
export const SHAKE_T = 0.25;
export const FLASH_EVERY = 0.06;
export const HINT_T = 3;
export const NEW_BEST_T = 1.5;

// Events raised by one step
export const EVENT_SQUASH = 1;
export const EVENT_DECOY = 2;
export const EVENT_WHIFF = 4;
export const EVENT_MISS = 8;
