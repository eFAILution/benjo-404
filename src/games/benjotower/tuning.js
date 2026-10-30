// @ts-check
// Tower of Benjo tuning (#100). The floor is a maze of COLS x ROWS cells; positions and speeds
// are in cells and cells per second. Times are seconds.

// Layout, with the same safe area as the other games (A-13.4).
export const CEILING = 64;
export const CEILING_NARROW = 96;
export const NARROW_WIDTH = 600;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;
export const SIDE_PAD = 16;
export const BOTTOM_PAD = 24;

// The maze
export const COLS = 11;
export const ROWS = 9;
/** Walls knocked out after carving, so the maze has loops to dodge round. */
export const LOOPS = 14;

// Benjo
export const BENJO_SPEED = 3.2;
/** Closer than this, in cells, Benjo and an enemy or a bolt touch. */
export const CONTACT = 0.7;
export const BOLT_CONTACT = 0.45;
/** An enemy is "in front" of a walking Benjo when it lies within this angle's cosine of his way. */
export const FRONT = 0.5;
/** The key and the door count once Benjo is this close to their cell's middle. */
export const REACH = 0.35;

// Enemies
export const SLIME_SPEED = 1.3;
export const KNIGHT_SPEED = 1.7;
/** Enemies get this much faster each floor, up to SPEED_GROWTH_MAX times their start. */
export const SPEED_GROWTH = 0.05;
export const SPEED_GROWTH_MAX = 1.5;
export const KNIGHT_HP = 2;
/** After a hit an enemy is stunned, and neither hurts nor is hurt, for this long. */
export const HURT_T = 0.6;
/** Enemies start at least this many steps from Benjo along the maze. */
export const SPAWN_GAP = 4;
export const MAGE_HIDE = 3;
export const MAGE_HIDE_JITTER = 2;
export const MAGE_CAST = 0.7;
export const MAGE_LINGER = 0.9;
export const BOLT_SPEED = 5;
export const ENEMY_POOL = 10;
export const BOLT_POOL = 4;

// Score, lives, and the clock
export const SLIME_SCORE = 5;
export const KNIGHT_SCORE = 15;
export const MAGE_SCORE = 10;
export const KEY_SCORE = 10;
export const FLOOR_SCORE = 50;
export const TIME_SCORE = 1;
export const FLOOR_T = 60;
export const LIVES = 3;

// Timing
/** Inputs this early in a run are the press that started it. */
export const START_GRACE = 0.12;
export const HIT_T = 1.2;
export const CLEAR_T = 1.4;
export const DEATH_PAUSE = 0.8;
export const HINT_T = 3;
export const STATUS_T = 1.5;
export const NEW_BEST_T = 1.5;

// Look
export const SHAKE_PX = 6;
export const SHAKE_T = 0.3;

// Events raised by one step
export const EVENT_SLAY = 1;
export const EVENT_KEY = 2;
export const EVENT_HIT = 4;
export const EVENT_CLEAR = 8;
export const EVENT_BLOCK = 16;
export const EVENT_CAST = 32;

// Power-ups (#22)
/** After the Digital Twin takes a hit, enemies and bolts pass through Benjo for this long. */
export const GRACE_T = 1.5;
export const GRACE_BLINK = 0.1;
export const GRACE_ALPHA = 0.35;
