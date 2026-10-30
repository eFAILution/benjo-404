// @ts-check
// The Crack the Hash world and its fixed step (#104). No DOM, no host: tests drive it directly.
//
// Benjo runs around a ring. One tap while he is on the target pops it: he turns round and the
// next target appears ahead of him (ring.js). Tapping anywhere else, tapping on a bug, or letting
// him run past the target ends the run. A lock needs a number of pops; when it opens, the next
// one needs more and runs faster. The run is simulated in track px on every screen; only drawing
// scales it. Nothing in the step allocates.

import { wrap } from '../../shell/wrap.js';
import { addPop, along, clearBugs, hitHalf, placeTarget, stepPops, TRACK, toward } from './ring.js';
import {
  BENJO_DRAW,
  BOTTOM_PAD,
  BUG_HALF,
  CEILING,
  CEILING_NARROW,
  EDGE_PAD,
  EVENT_MISS,
  EVENT_OPEN,
  EVENT_POP,
  EVENT_SAVED,
  FIRST_ARC,
  MIN_HEIGHT,
  MIN_WIDTH,
  NARROW_WIDTH,
  OPEN_T,
  PINS_CAP,
  PINS_START,
  PINS_STEP,
  POP_POOL,
  RING_R,
  RING_W,
  SHAKE_T,
  SPEED_CAP,
  SPEED_CAP_REDUCED,
  SPEED_START,
  SPEED_STEP,
  START_GRACE,
  TARGET_SIZE,
} from './tuning.js';

/** @typedef {{ width: number, height: number }} Area */
/** @typedef {import('./ring.js').Mark} Mark */
/** @typedef {import('./ring.js').Pop} Pop */
/** What the player asks for this step: `press` is a fresh tap. @typedef {{ press: boolean }} Intent */
/**
 * Power-up help from the host (#22), read during a step.
 * @typedef {{ magnet?: boolean, absorb?: () => boolean }} Powers
 *   magnet widens the hit window this step; absorb() is true when the Digital Twin forgives a miss.
 */
/** How a run ended. @typedef {'' | 'early' | 'past' | 'bug'} Cause */
/**
 * @typedef {object} World
 * @property {number} width
 * @property {number} height
 * @property {number} unit canvas px per track px
 * @property {number} ceiling top of the field, just below the HUD strip
 * @property {number} bottom
 * @property {number} cx the ring's center on the canvas
 * @property {number} cy
 * @property {number} s Benjo's spot, track px clockwise from the top
 * @property {number} prevS
 * @property {number} dir +1 clockwise, -1 the other way
 * @property {number} v speed along the ring
 * @property {number} lock
 * @property {number} pins pops this lock still needs
 * @property {boolean} wide true while Load Balancer widens the hit window
 * @property {number} openT seconds left of an opened lock's flourish, 0 when none
 * @property {number} spawned targets and bugs made so far, for picking sprites
 * @property {number} score
 * @property {number} time seconds since start
 * @property {boolean} dead
 * @property {Cause} cause
 * @property {number} deadT
 * @property {number} shakeT
 * @property {number} events EVENT_* bits raised by the last step
 * @property {boolean} reducedMotion
 * @property {() => number} random
 * @property {Mark} target
 * @property {Mark} bug
 * @property {Pop[]} pops
 */

/** No power-ups: what a step gets from a host without them. @type {Powers} */
const NO_POWERS = {};
/** The farthest from the ring's center anything is drawn: the top of Benjo's head. */
const EXTENT = RING_R + RING_W / 2 + BENJO_DRAW + EDGE_PAD;

/** @param {Area} size */
export function layout(size) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const ceiling = size.width < NARROW_WIDTH ? CEILING_NARROW : CEILING;
  const bottom = height - BOTTOM_PAD;
  const unit = Math.min(width, bottom - ceiling) / 2 / EXTENT;
  return { width, height, unit, ceiling, bottom, cx: width / 2, cy: (ceiling + bottom) / 2 };
}

/** Pops lock `n` needs. @param {number} n */
export const pinsFor = (n) => Math.min(PINS_CAP, PINS_START + PINS_STEP * (n - 1));

/**
 * Speed in lock `n`: faster each lock, up to a cap that is lower with reduced motion.
 * @param {number} n @param {boolean} reducedMotion
 */
export const speedFor = (n, reducedMotion) =>
  Math.min(reducedMotion ? SPEED_CAP_REDUCED : SPEED_CAP, SPEED_START + SPEED_STEP * (n - 1));

/**
 * @param {Area} size
 * @param {() => number} random
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {World}
 */
export function createWorld(size, random, options = {}) {
  const reducedMotion = Boolean(options.reducedMotion);
  /** @type {World} */
  const w = {
    ...layout(size),
    s: 0,
    prevS: 0,
    dir: 1,
    v: speedFor(1, reducedMotion),
    lock: 1,
    pins: pinsFor(1),
    wide: false,
    openT: 0,
    spawned: 0,
    score: 0,
    time: 0,
    dead: false,
    cause: '',
    deadT: 0,
    shakeT: 0,
    events: 0,
    reducedMotion,
    random,
    target: { active: false, s: 0, sprite: 0 },
    bug: { active: false, s: 0, sprite: 0 },
    pops: Array.from({ length: POP_POOL }, () => ({ active: false, s: 0, t: 0, r: 0 })),
  };
  placeTarget(w, FIRST_ARC);
  return w;
}

/**
 * A miss ends the run, unless the Digital Twin forgives it.
 * @param {World} w @param {Powers} powers @param {Cause} cause
 * @returns {boolean} true when forgiven
 */
function miss(w, powers, cause) {
  if (powers.absorb?.()) {
    w.events |= EVENT_SAVED;
    return true;
  }
  w.dead = true;
  w.cause = cause;
  w.deadT = 0;
  w.shakeT = SHAKE_T;
  w.events |= EVENT_MISS;
  return false;
}

/** The last pin of a lock: it opens, and the next lock waits out the flourish. @param {World} w */
function open(w) {
  w.events |= EVENT_OPEN;
  w.lock += 1;
  w.pins = pinsFor(w.lock);
  w.v = speedFor(w.lock, w.reducedMotion);
  w.openT = OPEN_T;
  w.target.active = false;
  w.bug.active = false;
}

/**
 * A tap: on a bug it ends the run, on the target it pops it, anywhere else it is a miss.
 * @param {World} w @param {Powers} powers
 */
function tap(w, powers) {
  if (w.bug.active && Math.abs(toward(w.s, w.bug.s)) < BUG_HALF) {
    if (miss(w, powers, 'bug')) clearBugs(w);
    return;
  }
  if (Math.abs(toward(w.s, w.target.s)) > hitHalf(w.wide)) {
    miss(w, powers, 'early');
    return;
  }
  w.score += 1;
  w.pins -= 1;
  w.events |= EVENT_POP;
  addPop(w, w.target.s, TARGET_SIZE / 2);
  w.dir = -w.dir;
  if (w.pins === 0) open(w);
  else placeTarget(w);
}

/**
 * Benjo runs on. Running all the way past the target is a miss; a forgiven one turns him round.
 * @param {World} w @param {Powers} powers @param {number} dt
 */
function run(w, powers, dt) {
  w.s = wrap(w.s + w.dir * w.v * dt, TRACK);
  const d = along(w, w.s, w.target.s);
  const past = d > TRACK / 2 && TRACK - d > hitHalf(w.wide);
  if (past && miss(w, powers, 'past')) w.dir = -w.dir;
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
  w.prevS = w.s;
  w.events = 0;
  w.time += dt;
  w.shakeT = Math.max(0, w.shakeT - dt);
  w.wide = Boolean(powers.magnet);
  stepPops(w, dt);
  if (w.dead) {
    w.deadT += dt;
    return w;
  }
  if (w.openT > 0) {
    w.openT = Math.max(0, w.openT - dt);
    if (w.openT === 0) placeTarget(w, FIRST_ARC);
    return w;
  }
  if (intent.press && w.time > START_GRACE) tap(w, powers);
  if (!w.dead && w.target.active) run(w, powers, dt);
  return w;
}

/**
 * Fit a running world to a new canvas size. The run is in track px, so only the layout changes.
 * @param {World} w
 * @param {Area} size
 * @returns {World}
 */
export function resizeWorld(w, size) {
  return Object.assign(w, layout(size));
}

/** Where Benjo is between steps, for drawing. @param {World} w @param {number} blend */
export const blendS = (w, blend) => wrap(w.prevS + toward(w.prevS, w.s) * blend, TRACK);
