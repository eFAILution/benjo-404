// @ts-check
// Break the 404 tuning. Lengths are CSS px at the reference height, times are seconds, speeds
// are px/s, angles are radians. World code multiplies lengths and speeds by `unit`.

// Layout (shared names and values with Benjo Flight, A-13.4)
export const REF_HEIGHT = 640;
export const UNIT_MIN = 0.6;
export const UNIT_MAX = 1.25;
/** The HUD strip covers the top of the canvas; nothing plays above this line. */
export const CEILING = 64;
export const CEILING_NARROW = 96;
export const NARROW_WIDTH = 600;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;
export const SIDE_PAD = 16;
/**
 * Widest play rect, times unit. A wider screen centers the field, so the 404 wall stays most of
 * its width and a fireball cannot wander far from the bricks.
 */
export const PLAY_W_MAX = 760;
export const BOTTOM_PAD = 16;
/**
 * Play rect height at the reference height. Speeds scale by `pace`, the larger of unit and
 * playH / REF_PLAY_H, so on tall screens (where unit caps) a ball still crosses in the same time.
 */
export const REF_PLAY_H = 560;

// Brick grid: a 17x5 bitmap that spells 404
export const GRID_COLS = 17;
export const GRID_ROWS = 5;
/** Largest grid cell, times unit. */
export const CELL_MAX = 40;
/** Space between bricks in a row, and between rows. */
export const BRICK_GAP = 2;
/** Brick height as a fraction of the cell, capped at BRICK_H_MAX times unit. */
export const BRICK_H_FRAC = 0.5;
export const BRICK_H_MAX = 20;
/** Gap between the HUD ceiling and the top row. */
export const GRID_TOP = 24;

// Paddle
export const PADDLE_W_START = 88;
/** Fewest px the starting paddle may be, so a small screen stays playable. */
export const PADDLE_W_START_PX = 64;
export const PADDLE_W_MIN = 56;
/** Floor under PADDLE_W_MIN on short screens. */
export const PADDLE_W_MIN_PX = 40;
/** Paddle narrows this much each round. */
export const PADDLE_W_STEP = 8;
export const PADDLE_H = 8;
/** Paddle top sits this far above the bottom of the play rect. */
export const PADDLE_Y = 40;
export const PADDLE_SPEED = 520;
/** Most the paddle moves toward the pointer per second, so a drag never teleports it. */
export const POINTER_SPEED = 1400;

// Benjo, holding the paddle from below
export const BENJO_DY = 18;
export const BENJO_H = 36;

// Ball
export const BALL_R = 6;
export const BALL_R_MIN = 4;
export const BALL_SPEED_START = 300;
export const BALL_SPEED_STEP = 30;
export const BALL_SPEED_CAP = 480;
export const BALL_SPEED_CAP_REDUCED = 400;
/** A serve leaves within this angle of straight up. */
export const SERVE_SPREAD = (20 * Math.PI) / 180;
/** A hit at the paddle's edge bounces at this angle from straight up. */
export const MAX_BOUNCE = (60 * Math.PI) / 180;
/** After a brick hit, vertical speed is at least this share of the speed. */
export const MIN_VY_FRAC = 0.25;
export const TRAIL = 4;
export const TRAIL_ALPHA_HI = 0.3;
export const TRAIL_ALPHA_LO = 0.1;
export const LIFE_R = 3;
export const LIFE_X = 8;
export const LIFE_SPACING = 14;
export const LIFE_Y = 6;

// Rules and score
export const LIVES = 3;
export const BRICK_SCORE = 10;
export const WALL_BONUS = 100;
/** Inputs this early in a run are the press that started it. */
export const START_GRACE = 0.12;

// Feedback
/** Hit stop after a lost ball that is not the last one. */
export const LOSE_T = 0.8;
/** Hit stop before the game over card so the player sees what happened. */
export const DEATH_PAUSE = 0.6;
export const SHAKE_PX = 6;
export const SHAKE_T = 0.25;
export const FLASH_EVERY = 0.06;
export const POP_POOL = 6;
export const POP_T = 0.15;
export const HINT_T = 3;
export const STATUS_T = 1.5;
export const NEW_BEST_T = 1.5;

// Events raised by one step
export const EVENT_SERVE = 1;
export const EVENT_BRICK = 2;
export const EVENT_BOUNCE = 4;
export const EVENT_LOST = 8;
export const EVENT_ROUND = 16;
export const EVENT_HIT = 32;
