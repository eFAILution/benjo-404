// @ts-check
// The Uptime Tower world and its fixed step (#95). No DOM, no host: tests drive it directly.
//
// Everything is in tower units with y up: floor n's top is at n * FLOOR_GAP, and `camY` is the
// height at the bottom of the view. Only layout() knows pixels, so a resize is a new layout.
// Floors live in a ring of FLOOR_POOL slots, floor n in slot n % FLOOR_POOL, allocated once.

import {
  AIR_FRICTION,
  BENJO_H,
  BENJO_HALF_W,
  BENJO_HIT_W,
  BOTTOM_PAD,
  BUG_FROM,
  BUG_H,
  BUG_HIT,
  BUG_MAX,
  BUG_SPEED,
  BUG_SPEED_CAP,
  BUG_SPEED_STEP,
  BUG_START,
  BUG_STEP,
  CEILING,
  CEILING_NARROW,
  COMBO_MIN,
  COMBO_T,
  EVENT_COMBO,
  EVENT_HIT,
  EVENT_JUMP,
  EVENT_LAND,
  EVENT_ORB,
  FLOOR_GAP,
  FLOOR_POOL,
  FLOOR_SCORE,
  FLOOR_SHIFT,
  FLOOR_W_JITTER,
  FLOOR_W_MIN,
  FLOOR_W_START,
  FLOOR_W_STEP,
  FOLLOW,
  GRACE_T,
  GRAVITY,
  GROUND_FRICTION,
  JUMP_BASE,
  JUMP_RUN,
  MAGNET_REACH,
  MAGNET_V,
  MIN_HEIGHT,
  MIN_WIDTH,
  NARROW_WIDTH,
  ORB_CHANCE,
  ORB_H,
  ORB_SCORE,
  RESCUE_V,
  REST_EVERY,
  RUN_ACCEL,
  RUN_MAX,
  SCROLL_CAP,
  SCROLL_CAP_REDUCED,
  SCROLL_EVERY,
  SCROLL_FLOOR,
  SCROLL_START,
  SCROLL_STEP,
  SIDE_PAD,
  START_GRACE,
  TOWER_FRAC,
  TOWER_W,
  WALL_KEEP,
  WALL_MIN,
} from './tuning.js';

/** @typedef {{ width: number, height: number }} Area */
/**
 * What the player asks for this step: `mx` runs (-1 left, 1 right), and `jump` is true on the
 * step a jump was pressed. While a finger is held, `px` is where it is in canvas px.
 * @typedef {{ mx: number, jump: boolean, px: number | null }} Intent
 */
/**
 * Floor `n` spans x to x + w. It may carry a bug crawling between its ends, and an orb.
 * @typedef {{ n: number, x: number, w: number, bug: boolean, bx: number, bdir: number,
 *   prevBx: number, orb: boolean, ox: number }} Floor
 */
/**
 * Power-up help from the host (#22), read during a step.
 * @typedef {{ magnet?: boolean, absorb?: () => boolean }} Powers
 */
/**
 * @typedef {object} World
 * @property {number} width
 * @property {number} height
 * @property {number} ceiling
 * @property {number} bottom
 * @property {number} ox screen x of the tower's left wall
 * @property {number} k px per tower unit
 * @property {number} viewH tower units the view shows
 * @property {number} x Benjo's middle, tower units
 * @property {number} y Benjo's feet
 * @property {number} prevX
 * @property {number} prevY
 * @property {number} vx
 * @property {number} vy
 * @property {number} on the floor Benjo stands on, or -1 in the air
 * @property {number} from the floor the last jump left
 * @property {number} spin turns left in a combo jump's spin, drawn only
 * @property {number} camY height at the bottom of the view
 * @property {number} prevCamY
 * @property {number} scrollT seconds the view has been climbing
 * @property {number} top highest floor made so far
 * @property {number} best highest floor Benjo has landed on
 * @property {number} combo floors in the combo so far
 * @property {number} comboJumps
 * @property {number} comboT seconds left to land the next combo jump
 * @property {number} score
 * @property {number} lastCombo floors in the combo that just ended, for the HUD
 * @property {number} time seconds since start
 * @property {boolean} dead
 * @property {'bug' | 'fall' | null} hit what ended the run
 * @property {number} deadT
 * @property {number} graceT seconds left of the Digital Twin's grace, 0 when none
 * @property {number} events EVENT_* bits raised by the last step
 * @property {boolean} reducedMotion
 * @property {() => number} random
 * @property {Floor[]} floors
 */

/** No power-ups: what a step gets from a host without them. @type {Powers} */
const NO_POWERS = {};
/** The ground floor sits this far above the bottom of the first view. */
const FLOOR_T_BELOW = 24;

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @param {Area} size */
export function layout(size) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const ceiling = size.width < NARROW_WIDTH ? CEILING_NARROW : CEILING;
  const bottom = height - BOTTOM_PAD;
  const towerPx = Math.min(width - 2 * SIDE_PAD, (bottom - ceiling) * TOWER_FRAC);
  const k = towerPx / TOWER_W;
  return {
    width,
    height,
    ceiling,
    bottom,
    k,
    ox: (width - towerPx) / 2,
    viewH: (bottom - ceiling) / k,
  };
}

/** Floor `n`'s slot. @param {World} w @param {number} n */
export const floorAt = (w, n) => w.floors[n % FLOOR_POOL];

/** How fast the view climbs, once it has started. @param {World} w */
export function scrollFor(w) {
  if (w.best < SCROLL_FLOOR) return 0;
  const cap = w.reducedMotion ? SCROLL_CAP_REDUCED : SCROLL_CAP;
  return Math.min(cap, SCROLL_START + SCROLL_STEP * Math.floor(w.scrollT / SCROLL_EVERY));
}

/**
 * Make floor `n` above the one below it: narrower as the tower rises, its middle within
 * FLOOR_SHIFT of the floor below's, so every floor can be reached with one jump. Every
 * REST_EVERY floors spans the tower.
 * @param {World} w @param {number} n
 */
function makeFloor(w, n) {
  const f = floorAt(w, n);
  const below = n > 0 ? floorAt(w, n - 1) : null;
  f.n = n;
  f.bug = false;
  f.orb = false;
  if (!below || n % REST_EVERY === 0) {
    f.x = 0;
    f.w = TOWER_W;
    return;
  }
  const jitter = FLOOR_W_JITTER * (2 * w.random() - 1);
  f.w = clamp(FLOOR_W_START - FLOOR_W_STEP * n + jitter, FLOOR_W_MIN, TOWER_W);
  const mid = below.x + below.w / 2 + FLOOR_SHIFT * (2 * w.random() - 1);
  f.x = clamp(mid - f.w / 2, 0, TOWER_W - f.w);
  const bugChance = n < BUG_FROM ? 0 : Math.min(BUG_MAX, BUG_START + BUG_STEP * (n - BUG_FROM));
  if (w.random() < bugChance) {
    f.bug = true;
    f.bx = f.x + f.w * w.random();
    f.prevBx = f.bx;
    f.bdir = w.random() < 0.5 ? -1 : 1;
  }
  if (w.random() < ORB_CHANCE) {
    f.orb = true;
    f.ox = f.x + 10 + (f.w - 20) * w.random();
  }
}

/**
 * @param {Area} size
 * @param {() => number} random
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {World}
 */
export function createWorld(size, random, options = {}) {
  /** @type {World} */
  const w = {
    ...layout(size),
    x: TOWER_W / 2,
    y: 0,
    prevX: TOWER_W / 2,
    prevY: 0,
    vx: 0,
    vy: 0,
    on: 0,
    from: 0,
    spin: 0,
    camY: -FLOOR_T_BELOW,
    prevCamY: -FLOOR_T_BELOW,
    scrollT: 0,
    top: -1,
    best: 0,
    combo: 0,
    comboJumps: 0,
    comboT: 0,
    score: 0,
    lastCombo: 0,
    time: 0,
    dead: false,
    hit: null,
    deadT: 0,
    graceT: 0,
    events: 0,
    reducedMotion: Boolean(options.reducedMotion),
    random,
    floors: Array.from({ length: FLOOR_POOL }, () => ({
      n: -1,
      x: 0,
      w: 0,
      bug: false,
      bx: 0,
      bdir: 1,
      prevBx: 0,
      orb: false,
      ox: 0,
    })),
  };
  fill(w);
  return w;
}

/** Make floors up to two above the top of the view. @param {World} w */
function fill(w) {
  while ((w.top + 1) * FLOOR_GAP < w.camY + w.viewH + 2 * FLOOR_GAP) {
    w.top += 1;
    makeFloor(w, w.top);
  }
}

/** Bugs speed up with the floor they're on. @param {number} n */
export const bugSpeedFor = (n) => Math.min(BUG_SPEED_CAP, BUG_SPEED + BUG_SPEED_STEP * n);

/** A combo scores once it has this many jumps of COMBO_MIN floors or more. */
const COMBO_JUMPS = 2;

/** End the combo, scoring its floors squared when it had COMBO_JUMPS jumps or more. @param {World} w */
function endCombo(w) {
  if (w.comboJumps >= COMBO_JUMPS) {
    w.score += w.combo * w.combo;
    w.lastCombo = w.combo;
    w.events |= EVENT_COMBO;
  }
  w.combo = 0;
  w.comboJumps = 0;
  w.comboT = 0;
}

/** Benjo lands on floor `n`: score new height, and grow or end the combo. @param {World} w @param {number} n */
function land(w, n) {
  w.on = n;
  w.y = n * FLOOR_GAP;
  w.vy = 0;
  w.spin = 0;
  w.events |= EVENT_LAND;
  if (n > w.best) {
    w.score += (n - w.best) * FLOOR_SCORE;
    w.best = n;
  }
  const gained = n - w.from;
  if (gained >= COMBO_MIN) {
    w.combo += gained;
    w.comboJumps += 1;
    w.comboT = COMBO_T;
  } else endCombo(w);
}

/**
 * Run, jump, bounce off the walls, fall, and land on floors from above; floors are one way, so
 * Benjo jumps up through them. A held finger runs him toward it.
 * @param {World} w @param {Intent} intent @param {number} dt
 */
function moveBenjo(w, intent, dt) {
  let mx = intent.mx;
  if (!mx && intent.px !== null) {
    const target = (intent.px - w.ox) / w.k;
    if (Math.abs(target - w.x) > 6) mx = Math.sign(target - w.x);
  }
  if (mx) w.vx = clamp(w.vx + mx * RUN_ACCEL * dt, -RUN_MAX, RUN_MAX);
  else {
    const drag = (w.on >= 0 ? GROUND_FRICTION : AIR_FRICTION) * dt;
    w.vx -= clamp(w.vx, -drag, drag);
  }
  if (intent.jump && w.on >= 0) {
    w.vy = JUMP_BASE + JUMP_RUN * Math.abs(w.vx);
    w.from = w.on;
    w.on = -1;
    w.spin = Math.abs(w.vx) > RUN_MAX * 0.8 ? 1 : 0;
    w.events |= EVENT_JUMP;
  }
  w.x += w.vx * dt;
  const lo = BENJO_HALF_W;
  const hi = TOWER_W - BENJO_HALF_W;
  if (w.x < lo || w.x > hi) {
    w.x = clamp(w.x, lo, hi);
    w.vx = Math.abs(w.vx) > WALL_MIN ? -w.vx * WALL_KEEP : 0;
  }
  if (w.on >= 0) {
    const f = floorAt(w, w.on);
    if (w.x < f.x - BENJO_HALF_W / 2 || w.x > f.x + f.w + BENJO_HALF_W / 2) {
      w.from = w.on;
      w.on = -1;
    }
    return;
  }
  w.vy -= GRAVITY * dt;
  w.y += w.vy * dt;
  if (w.vy > 0) return;
  // Landing: the floor whose top Benjo's feet crossed this step, with his middle over it.
  const n = Math.floor(w.prevY / FLOOR_GAP);
  if (n < 0 || n > w.top || n * FLOOR_GAP < w.y) return;
  const f = floorAt(w, n);
  if (w.x >= f.x - BENJO_HALF_W / 2 && w.x <= f.x + f.w + BENJO_HALF_W / 2) land(w, n);
}

/** Bugs crawl to their floor's ends and turn; orbs slide in under the Load Balancer. @param {World} w @param {number} dt @param {Powers} powers */
function moveFloors(w, dt, powers) {
  for (const f of w.floors) {
    f.prevBx = f.bx;
    if (f.bug) {
      f.bx += f.bdir * bugSpeedFor(f.n) * dt;
      const half = BUG_H / 2;
      if (f.bx < f.x + half || f.bx > f.x + f.w - half) {
        f.bx = clamp(f.bx, f.x + half, f.x + f.w - half);
        f.bdir = -f.bdir;
      }
    }
    if (f.orb && powers.magnet && Math.abs(f.n * FLOOR_GAP - w.y) < MAGNET_REACH) {
      f.ox += clamp(w.x - f.ox, -MAGNET_V * dt, MAGNET_V * dt);
    }
  }
}

/** Does Benjo's box touch a box of half size `h` centered at (x, y)? @param {World} w @param {number} x @param {number} y @param {number} h */
const touches = (w, x, y, h) =>
  Math.abs(x - w.x) < BENJO_HIT_W + h && y + h > w.y && y - h < w.y + BENJO_H * 0.85;

/**
 * Bugs end the run unless the twin takes them; orbs score.
 * @param {World} w @param {Powers} powers
 */
function contact(w, powers) {
  for (const f of w.floors) {
    if (f.n < 0) continue;
    const top = f.n * FLOOR_GAP;
    if (f.orb && touches(w, f.ox, top + ORB_H / 2 + 2, ORB_H / 2)) {
      f.orb = false;
      w.score += ORB_SCORE;
      w.events |= EVENT_ORB;
    }
    if (!f.bug || w.graceT > 0 || !touches(w, f.bx, top + BUG_H / 2, (BUG_H * BUG_HIT) / 2))
      continue;
    if (powers.absorb?.()) {
      w.graceT = GRACE_T;
      continue;
    }
    die(w, 'bug');
    return;
  }
}

/** @param {World} w @param {'bug' | 'fall'} what */
function die(w, what) {
  w.dead = true;
  w.hit = what;
  w.deadT = 0;
  w.events |= EVENT_HIT;
}

/**
 * Garbage Collector: every bug in the tower goes.
 * @param {World} w
 * @returns {number} bugs cleared
 */
export function clearBugs(w) {
  let n = 0;
  for (const f of w.floors) {
    if (!f.bug) continue;
    f.bug = false;
    n += 1;
  }
  return n;
}

/**
 * Advance the world one fixed step. Mutates and returns `w`.
 * @param {World} w
 * @param {Intent} intent
 * @param {number} dt
 * @param {Powers} [powers] power-up help; none by default
 * @returns {World}
 */
export function stepWorld(w, intent, dt, powers = NO_POWERS) {
  w.prevX = w.x;
  w.prevY = w.y;
  w.prevCamY = w.camY;
  w.events = 0;
  w.time += dt;
  if (w.dead) {
    w.deadT += dt;
    w.vy -= GRAVITY * dt;
    w.y += w.vy * dt;
    return w;
  }
  if (w.time > START_GRACE) moveBenjo(w, intent, dt);
  w.graceT = Math.max(0, w.graceT - dt);
  if (w.comboT > 0) {
    w.comboT = Math.max(0, w.comboT - dt);
    if (w.comboT === 0 && w.on >= 0) endCombo(w);
  }
  if (w.spin > 0 && !w.reducedMotion) w.spin = Math.max(0, w.spin - dt * 1.4);

  const speed = scrollFor(w);
  if (speed > 0) w.scrollT += dt;
  w.camY = Math.max(w.camY + speed * dt, w.y - w.viewH * FOLLOW);
  fill(w);
  moveFloors(w, dt, powers);
  contact(w, powers);
  if (w.dead) return w;
  if (w.y + BENJO_H < w.camY) {
    if (powers.absorb?.()) {
      // The twin throws Benjo back up into view.
      w.vy = RESCUE_V;
      w.on = -1;
      w.y = w.camY;
      w.graceT = GRACE_T;
    } else die(w, 'fall');
  }
  return w;
}

/**
 * Fit a running world to a new canvas size. Everything is in tower units, so only the layout
 * changes, and the view keeps its bottom where it was.
 * @param {World} w
 * @param {Area} size
 * @returns {World}
 */
export function resizeWorld(w, size) {
  Object.assign(w, layout(size));
  fill(w);
  return w;
}
