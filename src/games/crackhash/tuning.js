// @ts-check
// Crack the Hash tuning (#104). The run is simulated in track px, the same on every screen:
// lengths here are track px, and only drawing scales them by `unit`. Times are seconds, speeds
// are track px per second.

// Layout, with the same safe area as the other games (A-13.4).
export const CEILING = 64;
export const CEILING_NARROW = 96;
export const NARROW_WIDTH = 600;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;
export const BOTTOM_PAD = 16;
/** Room kept between Benjo's head at the ring's edge and the edge of the field. */
export const EDGE_PAD = 6;

// The ring. Benjo runs on its outside edge; targets and bugs sit just inside it.
export const RING_R = 140;
/** The ring's line, and the band that marks a hit window or a bug on it. */
export const RING_W = 6;
export const BAND_W = 14;
/** Benjo is drawn this tall, standing on the ring with his head pointing out. */
export const BENJO_DRAW = 46;

// Targets
export const TARGET_SIZE = 30;
/** Benjo is on the target while his middle is within this of its middle, along the ring. */
export const HIT_HALF = 30;
/** Each next target appears this far ahead of Benjo, along the way he now runs. */
export const ARC_MIN = 140;
export const ARC_MAX = 400;
/** The first target of a run, and of each lock, gives a little longer to get ready. */
export const FIRST_ARC = 300;

// Bugs, from lock BUG_LOCK on
export const BUG_LOCK = 2;
export const BUG_CHANCE = 0.4;
export const BUG_SIZE = 30;
/** Tapping while Benjo's middle is within this of a bug's middle ends the run. */
export const BUG_HALF = 15;
/** Free ring kept between a bug and the edge of the hit window, even a widened one. */
export const BUG_GAP = 20;
/** A bug before the target appears at least this far ahead of Benjo. */
export const BUG_FROM = 50;
/** A bug past the target sits up to this much farther past its nearest legal spot. */
export const BUG_PAST = 60;

// Locks. Lock n needs PINS_START + PINS_STEP * (n - 1) pops, up to PINS_CAP.
export const PINS_START = 5;
export const PINS_STEP = 2;
export const PINS_CAP = 15;
/** Each lock runs faster, up to a cap that is lower with reduced motion. */
export const SPEED_START = 300;
export const SPEED_STEP = 25;
export const SPEED_CAP = 450;
export const SPEED_CAP_REDUCED = 380;
/** An opened lock flashes this long, with Benjo standing still, before the next one starts. */
export const OPEN_T = 0.9;
export const FLASH_EVERY = 0.15;

// Timing
/** Inputs this early in a run are the press that started it. */
export const START_GRACE = 0.12;
/** Hit stop before the game over card so the player sees what got them. */
export const DEATH_PAUSE = 0.6;
export const HINT_T = 3;
export const STATUS_T = 1.5;
export const NEW_BEST_T = 1.5;

// Feedback
export const POP_POOL = 6;
export const POP_T = 0.3;
export const POP_GROW = 16;
export const SHAKE_PX = 6;
export const SHAKE_T = 0.3;

// Events raised by one step
export const EVENT_POP = 1;
export const EVENT_OPEN = 2;
export const EVENT_MISS = 4;
export const EVENT_SAVED = 8;

// Power-ups (#22)
/** Load Balancer: while it runs, the hit window is this much wider. */
export const MAGNET_WIDEN = 1.5;
