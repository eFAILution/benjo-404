// @ts-check
// The Memory Leak world and its fixed step (#106). No DOM, no host: tests drive it directly.
//
// One block falls at a time. It appears above the heap, in the middle, and falls through the
// lane; the player slides it and drops it. It lands on the highest used cell under any of its
// columns, and a block that would land above the top row overflows the heap. Every new block
// fits somewhere when it appears: if its planned width fits nowhere it shrinks, and only when a
// 1-wide block fits nowhere is the run honestly over (ADR-0106).
// Pools are allocated once in createWorld, and stepWorld only mutates.

import {
  clearTop,
  compact,
  emptyBlock,
  fits,
  flushRow,
  landing,
  place,
  stepLives,
  stepPops,
} from './heap.js';
import {
  BLOCK_POOL,
  BOTTOM_PAD,
  CEILING,
  CEILING_NARROW,
  CEILING_STATUS,
  COLS,
  COMPACT_CHARGE,
  EVENT_COMPACT,
  EVENT_LAND,
  EVENT_OVERFLOW,
  EVENT_SAVED,
  FALL_CAP,
  FALL_CAP_REDUCED,
  FALL_RAMP,
  FALL_START,
  FIRST_GAP,
  GAP_MIN,
  GAP_RAMP,
  GAP_START,
  LANE,
  LIFE_MAX,
  LIFE_RAMP,
  LIFE_SPREAD,
  LIFE_START,
  MAX_W,
  METER_GAP,
  METER_W,
  MIN_HEIGHT,
  MIN_W,
  MIN_WIDTH,
  MOVE_DELAY,
  MOVE_GAP,
  NARROW_WIDTH,
  POP_POOL,
  ROWS,
  SHAKE_T,
  SIDE_PAD,
  START_GRACE,
  STATUS_WIDTH,
  TWIN_ROWS,
} from './tuning.js';

/** @typedef {{ width: number, height: number }} Area */
/** @typedef {import('./heap.js').Block} Block */
/** @typedef {import('./heap.js').Pop} Pop */
/**
 * The falling block: `w` wide, its left cell at column `x`, its bottom at row `y` (a fraction
 * while it falls). `prevY` is last step's, for render(alpha).
 * @typedef {{ active: boolean, x: number, y: number, w: number, prevY: number }} Fall
 */
/**
 * What the player asks for this step. `dir` is the held arrow, -1 left, 1 right, and `fresh` is
 * true on the step it went down. `target` is the column a dragging finger wants the block at.
 * @typedef {{ dir: number, fresh: boolean, target: number | null, drop: boolean,
 *   compact: boolean }} Intent
 */
/**
 * Power-up help from the host (#22), read during a step.
 * @typedef {{ absorb?: () => boolean }} Powers absorb() is true when the Digital Twin takes an overflow.
 */
/**
 * @typedef {object} World
 * @property {number} width
 * @property {number} height
 * @property {number} ceiling top of the play area, just below the HUD strip
 * @property {number} bottom
 * @property {number} cell side of one cell, px
 * @property {number} left screen x of the heap's left edge
 * @property {number} floor screen y of the heap's floor
 * @property {number[]} cells block index per cell, -1 when free; row 0 is the floor
 * @property {number[]} tops scratch column heights for compact
 * @property {number[]} order scratch block order for compact
 * @property {Block[]} blocks
 * @property {Pop[]} pops
 * @property {number} popNext the pop reused when every one is showing
 * @property {Fall} fall
 * @property {number} spawnT seconds until the next block appears, while none falls
 * @property {number} spawned blocks made so far
 * @property {number} moveT seconds until a held arrow moves the block again
 * @property {number} charge freed cells toward the next compact, up to COMPACT_CHARGE
 * @property {number} flushes full rows flushed so far
 * @property {number} score
 * @property {number} time seconds since start
 * @property {boolean} dead
 * @property {number} deadT
 * @property {number} shakeT
 * @property {number} settleT seconds left of the last compact's slide
 * @property {number} events EVENT_* bits raised by the last step
 * @property {boolean} reducedMotion
 * @property {() => number} random
 */

/** No power-ups: what a step gets from a host without them. @type {Powers} */
const NO_POWERS = {};

/**
 * Top of the play area: below the HUD strip, and below the status line where it drops under the
 * strip. @param {number} width the canvas width as the host reports it
 */
export function ceilingFor(width) {
  if (width < NARROW_WIDTH) return CEILING_NARROW;
  return width < STATUS_WIDTH ? CEILING_STATUS : CEILING;
}

/**
 * The heap keeps its COLS x ROWS grid at every size, with LANE rows of air above it; the cell
 * is as big as fits under the HUD with the compact meter beside the heap.
 * @param {Area} size
 */
export function layout(size) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const ceiling = ceilingFor(size.width);
  const bottom = height - BOTTOM_PAD;
  const across = (width - SIDE_PAD * 2) / (COLS + METER_GAP + METER_W);
  const cell = Math.max(1, Math.floor(Math.min(across, (bottom - ceiling) / (ROWS + LANE))));
  const left = Math.round((width - cell * (COLS + METER_GAP + METER_W)) / 2);
  return { width, height, ceiling, bottom, cell, left, floor: bottom };
}

/**
 * @param {Area} size
 * @param {() => number} random
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {World}
 */
export function createWorld(size, random, options = {}) {
  return {
    ...layout(size),
    cells: Array.from({ length: COLS * ROWS }, () => -1),
    tops: Array.from({ length: COLS }, () => 0),
    order: Array.from({ length: BLOCK_POOL }, () => 0),
    blocks: Array.from({ length: BLOCK_POOL }, emptyBlock),
    pops: Array.from({ length: POP_POOL }, () => ({ active: false, x: 0, y: 0, w: 1, t: 0 })),
    popNext: 0,
    fall: { active: false, x: 0, y: 0, w: 1, prevY: 0 },
    spawnT: FIRST_GAP,
    spawned: 0,
    moveT: 0,
    charge: 0,
    flushes: 0,
    score: 0,
    time: 0,
    dead: false,
    deadT: 0,
    shakeT: 0,
    settleT: 0,
    events: 0,
    reducedMotion: Boolean(options.reducedMotion),
    random,
  };
}

/** Rows per second the block falls now: faster over time, up to a cap that is lower with reduced motion. @param {World} w */
export const fallSpeed = (w) =>
  Math.min(w.reducedMotion ? FALL_CAP_REDUCED : FALL_CAP, FALL_START + FALL_RAMP * w.time);

/** Seconds between a landing and the next block, shorter over time. @param {World} w */
export const gapFor = (w) => Math.max(GAP_MIN, GAP_START - GAP_RAMP * w.time);

/** A new block's life, longer over time, give or take LIFE_SPREAD. @param {World} w */
export function lifeFor(w) {
  const base = Math.min(LIFE_MAX, LIFE_START + LIFE_RAMP * w.time);
  return base * (1 + LIFE_SPREAD * (2 * w.random() - 1));
}

/** The column a new block `width` wide appears at: the middle. @param {number} width */
export const spawnX = (width) => Math.floor((COLS - width) / 2);

/** The row a new block appears at, its top touching the top of the lane. */
export const SPAWN_Y = ROWS + LANE - 1;

/**
 * The heap overflows. The Digital Twin takes it by clearing the top rows; otherwise the run ends.
 * @param {World} w @param {Powers} powers
 */
function overflow(w, powers) {
  if (powers.absorb?.()) {
    clearTop(w, TWIN_ROWS);
    w.events |= EVENT_SAVED;
    return;
  }
  w.dead = true;
  w.deadT = 0;
  w.shakeT = SHAKE_T;
  w.events |= EVENT_OVERFLOW;
}

/**
 * A new block, as wide as planned or narrower, so that it fits somewhere. When not even a
 * 1-wide block fits, the heap overflows.
 * @param {World} w @param {Powers} powers
 */
function spawn(w, powers) {
  let width = MIN_W + Math.floor(w.random() * (MAX_W - MIN_W + 1));
  while (width >= MIN_W && !fits(w, width)) width -= 1;
  if (width < MIN_W) return overflow(w, powers);
  const x = spawnX(width);
  Object.assign(w.fall, { active: true, x, y: SPAWN_Y, w: width, prevY: SPAWN_Y });
  w.spawned += 1;
}

/** Slide the falling block a column, unless the wall or a taller column is in the way. @param {World} w @param {number} dir */
function slide(w, dir) {
  const f = w.fall;
  const x = f.x + dir;
  if (x < 0 || x + f.w > COLS || landing(w, x, f.w) >= f.y) return;
  f.x = x;
}

/**
 * Arrows move once on the press, then repeat while held. A dragging finger moves the block a
 * column a step toward its column. Arrows win.
 * @param {World} w @param {Intent} intent @param {number} dt
 */
function steer(w, intent, dt) {
  if (intent.dir !== 0) {
    if (intent.fresh) w.moveT = MOVE_DELAY;
    else w.moveT -= dt;
    if (intent.fresh || w.moveT <= 0) slide(w, intent.dir);
    if (w.moveT <= 0) w.moveT += MOVE_GAP;
    return;
  }
  if (intent.target !== null && intent.target !== w.fall.x) {
    slide(w, Math.sign(intent.target - w.fall.x));
  }
}

/** The block becomes part of the heap; its row flushes if that filled it. @param {World} w @param {number} row */
function land(w, row) {
  const f = w.fall;
  f.active = false;
  place(w, f.x, row, f.w, lifeFor(w));
  w.spawnT = gapFor(w);
  w.events |= EVENT_LAND;
  flushRow(w, row);
}

/** @param {World} w @param {Intent} intent @param {number} dt @param {Powers} powers */
function stepFall(w, intent, dt, powers) {
  const f = w.fall;
  f.prevY = f.y;
  if (!f.active) {
    w.spawnT -= dt;
    if (w.spawnT <= 0) spawn(w, powers);
    return;
  }
  const live = w.time > START_GRACE;
  if (live) steer(w, intent, dt);
  const rest = landing(w, f.x, f.w);
  f.y = live && intent.drop ? rest : f.y - fallSpeed(w) * dt;
  if (f.y > rest) return;
  f.y = rest;
  if (rest >= ROWS) overflow(w, powers);
  else land(w, rest);
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
  w.events = 0;
  w.time += dt;
  w.shakeT = Math.max(0, w.shakeT - dt);
  w.settleT = Math.max(0, w.settleT - dt);
  stepPops(w, dt);
  if (w.dead) {
    w.deadT += dt;
    w.fall.prevY = w.fall.y;
    return w;
  }
  stepLives(w, dt);
  if (w.time > START_GRACE && intent.compact && w.charge >= COMPACT_CHARGE) {
    w.charge = 0;
    compact(w);
    w.events |= EVENT_COMPACT;
  }
  stepFall(w, intent, dt, powers);
  return w;
}

/**
 * Fit a running world to a new canvas size. The heap is kept in cells, so only the layout moves.
 * @param {World} w
 * @param {Area} size
 * @returns {World}
 */
export const resizeWorld = (w, size) => Object.assign(w, layout(size));

/** The share of the canvas the heap's grid fills, for tests. @param {World} w */
export const heapRect = (w) => ({
  x: w.left,
  y: w.floor - (ROWS + LANE) * w.cell,
  width: COLS * w.cell,
  height: (ROWS + LANE) * w.cell,
});
