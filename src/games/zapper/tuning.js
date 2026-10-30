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

// Formation
export const COLS = 6;
export const ROWS = 3;
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
/** How much faster the last bug moves than a full formation (0.6 = 60% faster). */
export const FORM_SPEED_RAMP = 0.6;
export const FORM_SPEED_CAP = 160;
export const FORM_SPEED_CAP_REDUCED = 120;
export const BOB_AMP = 2;
export const BOB_RATE = 3;

// Fire
export const BOLT_POOL = 3;
export const BOLT_SPEED = 520;
export const BOLT_W = 6;
export const BOLT_H = 14;
export const FIRE_COOLDOWN = 0.25;

// Bites
export const BITE_POOL = 4;
export const BITE_T = 1.4;
export const BITE_T_STEP = 0.1;
export const BITE_T_MIN = 0.7;
export const BITE_SPEED = 180;
export const BITE_SPEED_WAVE = 15;
export const BITE_SPEED_CAP = 240;
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
