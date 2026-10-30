// @ts-check
// Never Sleeps Run tuning (#88). The trench's cross-section is 2 units wide and 2 tall, from -1
// to 1 on each axis, and depth is in the same units ahead of the ship. Times are seconds, speeds
// are units per second. Pixel sizes are CSS px at the reference height, scaled by `unit`.

// Layout, with the same safe area as the other games (A-13.4).
export const REF_HEIGHT = 640;
export const UNIT_MIN = 0.6;
export const UNIT_MAX = 1.25;
export const CEILING = 64;
export const CEILING_NARROW = 96;
export const NARROW_WIDTH = 600;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;
export const BOTTOM_PAD = 16;
/** The trench is at most this much wider than tall on screen, so wide screens keep it square-ish. */
export const TRENCH_ASPECT = 1.3;

// Camera: a point at depth z is drawn at scale CAM / (z + CAM) toward the trench's center.
export const CAM = 1.2;
/** Gates appear this far ahead. */
export const FAR = 14;

// The ship
export const SHIP_H = 34;
/** The ship sprite's width over its height. */
export const SHIP_ASPECT = 1.9;
/** Hitbox as a share of the drawn ship, so near misses read as misses. */
export const HIT_FRAC = 0.75;
/** Key steering speed, units per second. */
export const SHIP_SPEED = 3.2;
/** A drag moves the ship toward the finger's spot this fast, units per second. */
export const DRAG_SPEED = 7;
/** Bank angle per unit/s of sideways speed, radians. */
export const BANK = 0.08;
export const BANK_MAX = 0.35;

// Gates. Each is a 3 x 3 grid across the trench; some cells are blocked.
export const GRID = 3;
export const GATE_GAP = 4.6;
export const GATE_GAP_MIN = 4;
export const GATE_GAP_STEP = 0.02;
export const GATE_POOL = 6;
/** Open cells in a gate: OPEN_START at first, one fewer every OPEN_EVERY gates, down to OPEN_MIN. */
export const OPEN_START = 6;
export const OPEN_MIN = 2;
export const OPEN_EVERY = 12;
export const ORB_CHANCE = 0.45;
/** Every PORT_EVERY gates, a gate is a port: nothing blocked, one lit cell worth a bonus. */
export const PORT_EVERY = 8;

// Speed
export const SPEED_START = 6;
export const SPEED_STEP = 0.1;
export const SPEED_CAP = 10;
export const SPEED_CAP_REDUCED = 8;

// Score
export const GATE_SCORE = 1;
export const ORB_SCORE = 3;
export const PORT_SCORE = 10;

// Timing
/** Inputs this early in a run are the press that started it. */
export const START_GRACE = 0.12;
export const DEATH_PAUSE = 0.8;
export const HINT_T = 3;
export const STATUS_T = 1.5;
export const NEW_BEST_T = 1.5;

// Feedback and look
export const RIB_GAP = 1.5;
export const STAR_COUNT = 40;
export const SHAKE_PX = 8;
export const SHAKE_T = 0.3;
export const ORB_H = 26;
export const FLASH_T = 0.35;

// Events raised by one step
export const EVENT_PASS = 1;
export const EVENT_ORB = 2;
export const EVENT_PORT = 4;
export const EVENT_HIT = 8;

// Power-ups (#22)
/** After the Digital Twin takes a hit, gates pass through the ship for this long. */
export const GRACE_T = 1.2;
export const GRACE_BLINK = 0.1;
export const GRACE_ALPHA = 0.35;
/** Load Balancer: orbs within this many units of the ship slide to it this fast. */
export const MAGNET_REACH = 1.6;
export const MAGNET_V = 3;
