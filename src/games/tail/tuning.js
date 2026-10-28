// @ts-check
// Dragon Tail tuning. Lengths are CSS px or fractions of a grid cell, times are seconds.

// Layout. The play rect sits below the HUD strip (A-13.4) inside the side and bottom pads.
export const CEILING = 64;
export const CEILING_NARROW = 96;
export const NARROW_WIDTH = 600;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;
export const SIDE_PAD = 16;
export const BOTTOM_PAD = 16;

// Grid. Picked once per run from the play rect; a resize keeps cols and rows.
/** The cell aims to fit this many columns and rows into the play rect. */
export const FIT_COLS = 20;
export const FIT_ROWS = 14;
export const CELL_MIN = 12;
export const CELL_MAX = 32;
export const COLS_MAX = 40;
export const ROWS_MAX = 30;
export const COLS_MIN = 8;
export const ROWS_MIN = 6;

// Directions, clockwise from right. NONE means no turn this step.
export const RIGHT = 0;
export const DOWN = 1;
export const LEFT = 2;
export const UP = 3;
export const NONE = -1;

// Rules
export const START_LEN = 3;
export const MOVE_T_START = 0.16;
/** Each page eaten shaves this off the time per cell, down to the floor. */
export const MOVE_T_STEP = 0.005;
export const MOVE_T_MIN = 0.07;
export const MOVE_T_MIN_REDUCED = 0.09;
/** Turns a player may queue ahead of the snake. */
export const QUEUE_MAX = 2;
/** Inputs this early in a run are the press that started it, not a turn. */
export const START_GRACE = 0.12;
/** A host tap within this long of a pointer press is that press, so it turns. */
export const TAP_ECHO = 0.4;

// Drawing, as fractions of a cell
export const SEG_SIZE = 0.8;
export const SEG_SIZE_SMALL = 0.7;
export const SEG_ROUND = 0.25;
export const TIP_ALPHA = 0.45;
export const HEAD_H = 1.6;
export const FOOD_H = 1.1;
export const FOOD_PULSE = 0.25;
export const FOOD_PULSE_RATE = 3;
export const DOT_ALPHA = 0.15;
export const BORDER_ALPHA = 0.16;

// Feedback
/** Hit stop before the game over card so the player sees what got them. */
export const DEATH_PAUSE = 0.6;
export const SHAKE_PX = 6;
export const SHAKE_T = 0.25;
export const FLASH_EVERY = 0.06;
export const HINT_T = 3;
export const NEW_BEST_T = 1.5;
