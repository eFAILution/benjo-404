// @ts-check
// Uptime Tower tuning (#95). The tower is TOWER_W units wide, with y up from the ground floor.
// Times are seconds, speeds are units per second. The tower is drawn TOWER_FRAC of the play
// rect tall at most, so on a wide screen it doesn't stretch.

// Layout, with the same safe area as the other games (A-13.4).
export const CEILING = 64;
export const CEILING_NARROW = 96;
export const NARROW_WIDTH = 600;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;
export const SIDE_PAD = 16;
export const BOTTOM_PAD = 16;
export const TOWER_W = 320;
/** The tower is at most this share of the play rect's height wide. */
export const TOWER_FRAC = 0.8;

// Benjo
export const BENJO_H = 26;
export const BENJO_HALF_W = 8;
/** Half Benjo's hitbox width against bugs, a little under his drawn width. */
export const BENJO_HIT_W = 5;
export const RUN_MAX = 300;
export const RUN_ACCEL = 1200;
export const GROUND_FRICTION = 1000;
export const AIR_FRICTION = 250;
export const GRAVITY = 1800;
/** A jump's speed: this much from a standstill, plus JUMP_RUN of the running speed. */
export const JUMP_BASE = 640;
export const JUMP_RUN = 0.75;
/** Hitting a wall faster than WALL_MIN turns Benjo round with WALL_KEEP of his speed. */
export const WALL_MIN = 80;
export const WALL_KEEP = 0.85;

// Floors
export const FLOOR_GAP = 72;
export const FLOOR_POOL = 24;
export const FLOOR_W_START = 170;
export const FLOOR_W_MIN = 70;
/** Floors narrow by this much per floor, down to FLOOR_W_MIN, plus or minus FLOOR_W_JITTER. */
export const FLOOR_W_STEP = 0.8;
export const FLOOR_W_JITTER = 30;
/** Most a floor's middle moves from the floor below's. */
export const FLOOR_SHIFT = 140;
/** Every REST_EVERY floors is the full width of the tower, with no bug. */
export const REST_EVERY = 25;
export const FLOOR_T = 10;

// The view
/** The view starts climbing once Benjo reaches this floor. */
export const SCROLL_FLOOR = 5;
export const SCROLL_START = 30;
export const SCROLL_STEP = 8;
/** The view speeds up by SCROLL_STEP every SCROLL_EVERY seconds, up to a cap. */
export const SCROLL_EVERY = 15;
export const SCROLL_CAP = 110;
export const SCROLL_CAP_REDUCED = 85;
/** The view follows Benjo once he's above this share of its height. */
export const FOLLOW = 0.6;

// Bugs and orbs
/** Bugs start on this floor; each floor's chance grows to BUG_MAX. */
export const BUG_FROM = 8;
export const BUG_START = 0.15;
export const BUG_STEP = 0.004;
export const BUG_MAX = 0.45;
export const BUG_SPEED = 40;
export const BUG_SPEED_STEP = 0.25;
export const BUG_SPEED_CAP = 90;
export const BUG_H = 18;
/** A bug's hitbox is this share of its drawn size, so a near miss reads as a miss. */
export const BUG_HIT = 0.5;
export const ORB_CHANCE = 0.3;
export const ORB_H = 16;

// Score
export const FLOOR_SCORE = 10;
export const ORB_SCORE = 5;
/** A combo is jumps of COMBO_MIN floors or more, each within COMBO_T of the last landing. */
export const COMBO_MIN = 2;
export const COMBO_T = 3;

// Timing
/** Inputs this early in a run are the press that started it. */
export const START_GRACE = 0.12;
export const DEATH_PAUSE = 0.8;
export const HINT_T = 3;
export const STATUS_T = 1.5;
export const NEW_BEST_T = 1.5;

// Look
export const SPIN = 9;
export const BRICK_H = 18;
export const BRICK_W = 36;

// Events raised by one step
export const EVENT_JUMP = 1;
export const EVENT_LAND = 2;
export const EVENT_ORB = 4;
export const EVENT_HIT = 8;
export const EVENT_COMBO = 16;

// Power-ups (#22)
/** After the Digital Twin takes a hit or a fall, Benjo is safe from bugs for this long. */
export const GRACE_T = 1.5;
export const GRACE_BLINK = 0.1;
export const GRACE_ALPHA = 0.35;
/** A fall the twin takes throws Benjo back up at this speed. */
export const RESCUE_V = 950;
/** Load Balancer: orbs on floors within reach slide to Benjo this fast. */
export const MAGNET_REACH = 160;
export const MAGNET_V = 200;
