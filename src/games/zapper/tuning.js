// @ts-check
// Bug Zapper tuning. Lengths are CSS px at the reference height, times are seconds, speeds
// are px/s. World code multiplies lengths and speeds by `unit`, which follows canvas height.

// Layout, copied from flight so every game keeps the same safe area (A-13.4).
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

// Benjo
export const BENJO_H = 40;
/** Benjo's center sits this far above the bottom of the play rect. */
export const BENJO_RISE = 26;
/** Hitbox radius as a fraction of Benjo's height, so near misses read as misses. */
export const HIT_R = 0.34;
export const BENJO_SPEED = 360;
/** Drag speed toward the pointer: fast, but never a teleport. */
export const POINTER_SPEED = 1400;

// Formation. Wave 1 is COLS x ROWS; later waves grow toward COLS_MAX x ROWS_MAX (#83).
export const COLS = 6;
export const ROWS = 3;
export const COLS_MAX = 8;
export const ROWS_MAX = 5;
/** A wave adds a column every 2 waves and a row every 2 waves, offset by one. */
export const GROW_EVERY = 2;
/** A new formation's lowest row stays at least this many drops above the front line. */
export const DROPS_CLEAR = 6;
/**
 * Columns past COLS are only added while the block spans at most this share of the play width,
 * so it still has room to slide before each drop. A narrow screen keeps COLS.
 */
export const BLOCK_SHARE = 0.65;
export const COL_STEP = 56;
export const ROW_STEP = 40;
/** The first column starts this far in from the left edge (px, not scaled). */
export const FORM_INSET = 16;
/** The top row starts this far below the ceiling. */
export const FORM_TOP = 24;
export const BUG_H = 26;
/** A bug's hit square, as a fraction of its height. */
export const BUG_BOX = 0.8;
export const DROP = 14;
export const FORM_SPEED = 30;
export const FORM_SPEED_WAVE = 8;
/** How much faster the last bug moves than a full formation (1.5 = 150% faster, #83). */
export const FORM_SPEED_RAMP = 1.5;
export const FORM_SPEED_CAP = 220;
export const FORM_SPEED_CAP_REDUCED = 150;
export const BOB_AMP = 2;
export const BOB_RATE = 3;

// Fire
export const BOLT_POOL = 8;
export const BOLT_SPEED = 520;
export const BOLT_W = 6;
export const BOLT_H = 14;
export const FIRE_COOLDOWN = 0.18;

// Bites. Each gap and each bite's speed is drawn around the wave's base value (#83).
export const BITE_POOL = 6;
export const BITE_T = 1.4;
export const BITE_T_STEP = 0.1;
export const BITE_T_MIN = 0.7;
/** The gap to the next bite is the base interval times 1 plus or minus this. */
export const BITE_T_JITTER = 0.5;
export const BITE_SPEED = 180;
export const BITE_SPEED_WAVE = 15;
export const BITE_SPEED_CAP = 240;
/** A bite falls at the base speed times a pace drawn from this range. */
export const BITE_PACE_MIN = 0.75;
export const BITE_PACE_MAX = 1.3;
/** From wave 2, this share of bites per wave past the first comes from the column nearest Benjo. */
export const AIM_STEP = 0.12;
export const AIM_MAX = 0.45;
/** From wave 3, a bite can start a burst: the next one follows after BURST_GAP. */
export const BURST_STEP = 0.1;
export const BURST_MAX = 0.3;
export const BURST_GAP = 0.3;
export const BITE_W = 5;
export const BITE_H = 10;

// Score and lives
export const BUG_SCORE = 10;
export const WAVE_BONUS = 50;
export const LIVES = 3;

// Timing
/** Inputs this early in a run are the press that started it, not a shot. */
export const START_GRACE = 0.12;
/** Hit stop after a bite that costs a life. */
export const HIT_T = 0.8;
/** Gap between a cleared wave and the next formation. */
export const WAVE_PAUSE = 1;
/** Hit stop before the game over card so the player sees what got them. */
export const DEATH_PAUSE = 0.6;
export const HINT_T = 3;
export const STATUS_T = 1.5;
export const NEW_BEST_T = 1.5;

// Feedback
export const SHAKE_PX = 6;
export const SHAKE_T = 0.25;
export const FLASH_EVERY = 0.06;
export const POP_POOL = 4;
export const POP_T = 0.2;
export const POP_GROW = 10;
export const FLAME_R = 3;
export const FLAME_GAP = 10;

// Events raised by one step
export const EVENT_FIRE = 1;
export const EVENT_KILL = 2;
export const EVENT_HIT = 4;
export const EVENT_WAVE = 8;

// Power-ups (#22)
/** After the Digital Twin takes a hit, further hits miss Benjo for this long. */
export const GRACE_T = 1;
export const GRACE_BLINK = 0.1;
export const GRACE_ALPHA = 0.35;
