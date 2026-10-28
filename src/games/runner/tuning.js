// @ts-check
// Benjo Run tuning. Lengths are CSS px at desktop scale, times are seconds, speeds are px/s.
// World code multiplies lengths by `unit` (smaller Benjo on narrow screens) and slows time by
// `pace` on narrow screens (speeds times pace, gravity times pace squared).

// Layout
export const GROUND_FRAC = 0.78;
export const BENJO_X_FRAC = 0.18;
export const BENJO_H = 48;
export const BENJO_H_SMALL = 40;
export const SMALL_WIDTH = 480;
/** Below this width the run plays slower so phones keep more reaction time. */
export const PACE_REF_WIDTH = 960;
export const PACE_MIN = 0.7;
export const SPAWN_MARGIN = 24;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;

// Jump feel
export const GRAVITY = 2200;
export const JUMP_V = 760;
export const JUMP_CUT_V = 260;
/** Gravity multiplier while ducking in the air, so a duck doubles as a dive. */
export const FAST_FALL = 3;
export const COYOTE = 0.08;
export const JUMP_BUFFER = 0.1;
/** How long a swipe down keeps Benjo ducked. */
export const DUCK_TAP = 0.45;
/** Inputs this early in a run are the press that started it, not a jump. */
export const START_GRACE = 0.12;
/** A host tap that echoes a pointer press within this window is the same press. */
export const TAP_ECHO = 0.4;

// Collision
export const HIT_INSET = 6;
/** Hazard hitboxes are inset by these fractions so near misses read as misses. */
export const HAZARD_INSET_X = 0.12;
export const HAZARD_INSET_TOP = 0.08;
export const ASPECT_MIN = 0.5;
export const ASPECT_MAX = 1.6;

// Speed and score
export const SPEED_START = 320;
export const SPEED_STEP = 14;
export const SPEED_STEP_EVERY = 2;
export const SPEED_CAP = 720;
export const SPEED_CAP_REDUCED = 480;
export const SCORE_DIVISOR = 10;
export const PICKUP_SCORE = 25;

// Obstacles
export const KIND_GROUND = 0;
export const KIND_TALL = 1;
export const KIND_FLYER = 2;
export const GAP_MIN_S = 0.9;
export const GAP_MAX_S = 1.6;
/** Seconds taken off the gap at top speed ("minus a bit as speed grows"). */
export const GAP_TIGHTEN_S = 0.25;
export const GAP_MIN_PX = 260;
/** The first obstacle arrives about three seconds in, as the hint fades. */
export const FIRST_GAP_S = 0.6;
export const GROUND_H_MIN = 36;
export const GROUND_H_MAX = 56;
export const TALL_H = 72;
export const TALL_AFTER = 4;
export const FLYER_H = 30;
/** Gap between a ducked Benjo's hitbox top and a flyer's bottom. */
export const FLYER_CLEAR = 4;
export const FLYERS_AFTER = 15;
export const TALL_CHANCE = 0.22;
export const FLYER_CHANCE = 0.25;
export const OBSTACLE_POOL = 8;

// Pickups
export const PICKUP_EVERY_MIN = 3;
export const PICKUP_EVERY_MAX = 6;
export const PICKUP_FIRST = 1.5;
export const PICKUP_RETRY = 0.25;
export const PICKUP_COUNT_MIN = 3;
export const PICKUP_COUNT_MAX = 5;
export const PICKUP_SIZE = 18;
export const PICKUP_SPACING = 34;
/** Orb centers sit this high at the ends of an arc, about Benjo's middle. */
export const PICKUP_BASE = 24;
export const PICKUP_ARC_MIN = 60;
export const PICKUP_ARC_MAX = 110;
export const PICKUP_FLAT_CHANCE = 0.35;
export const PICKUP_GRACE = 4;
export const PICKUP_CLEARANCE = 10;
export const PICKUP_POOL = 16;
export const POP_POOL = 8;
export const POP_T = 0.12;

// Feedback
export const LAND_SQUASH = 0.85;
export const LAND_SQUASH_T = 0.08;
export const DUCK_SCALE = 0.55;
/** Hit stop before the game over card so the player sees what got them. */
export const DEATH_PAUSE = 0.4;
export const SHAKE_PX = 6;
export const SHAKE_T = 0.25;
export const HINT_T = 3;
export const NEW_BEST_T = 1.5;
export const TRAIL_COUNT = 6;
export const TRAIL_EVERY = 3;
export const DUST_COUNT = 4;
export const DUST_T = 0.22;

// Power-ups (#22)
/** Digital Twin grace after an absorbed hit: hazards pass through Benjo while he blinks. */
export const GRACE_T = 1;
export const GRACE_BLINK = 0.08;
export const GRACE_ALPHA = 0.35;
/** Magnet: pickups this close to Benjo's middle fly to him at this speed. */
export const MAGNET_R = 300;
export const MAGNET_V = 900;

// Events raised by one step
export const EVENT_JUMP = 1;
export const EVENT_LAND = 2;
export const EVENT_PICKUP = 4;
export const EVENT_HIT = 8;
