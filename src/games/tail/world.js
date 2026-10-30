// @ts-check
// The Dragon Tail world and its fixed step. No DOM, no host: tests drive it directly.
//
// The snake lives in two Int16Array ring buffers (xs, ys) with the head at `head`, and an
// occupancy map mirrors it so food spawns and tail checks never scan the body. Every buffer is
// allocated once in createWorld, and stepWorld only mutates.

import {
  BOTTOM_PAD,
  CEILING,
  CEILING_NARROW,
  CELL_MAX,
  CELL_MIN,
  COLS_MAX,
  COLS_MIN,
  FIT_COLS,
  FIT_ROWS,
  MIN_HEIGHT,
  MIN_WIDTH,
  MOVE_T_MIN,
  MOVE_T_MIN_REDUCED,
  MOVE_T_START,
  MOVE_T_STEP,
  NARROW_WIDTH,
  NONE,
  QUEUE_MAX,
  RIGHT,
  ROWS_MAX,
  ROWS_MIN,
  SIDE_PAD,
  START_GRACE,
  START_LEN,
} from './tuning.js';

/** @typedef {{ width: number, height: number }} Area */
/**
 * @typedef {object} World
 * @property {number} width
 * @property {number} height
 * @property {number} ceiling screen y of the play rect's top, just below the HUD strip
 * @property {number} cols
 * @property {number} rows
 * @property {number} cell px per grid cell
 * @property {number} originX screen x of the grid's left edge
 * @property {number} originY screen y of the grid's top edge
 * @property {Int16Array} xs ring buffer of segment columns
 * @property {Int16Array} ys ring buffer of segment rows
 * @property {Uint8Array} occupied 1 where a segment sits, indexed row * cols + col
 * @property {number} head ring index of the head
 * @property {number} length segments, head included
 * @property {number} dir heading of the last move (RIGHT, DOWN, LEFT, UP)
 * @property {Int8Array} queue turns waiting for the next moves
 * @property {number} queued
 * @property {number} tailFromX cell the tip slid from on the last move
 * @property {number} tailFromY
 * @property {number} foodX
 * @property {number} foodY
 * @property {number} foodIndex counts spawns, picks the pickup sprite
 * @property {number} moveT seconds per cell
 * @property {number} timer seconds since the last move
 * @property {number} progress how far the last move has slid, 0 to 1
 * @property {number} prevProgress
 * @property {number} time seconds since start
 * @property {boolean} ready true until the first turn: nothing moves
 * @property {boolean} dead true once the run is over, won or lost
 * @property {'wall' | 'tail' | 'full' | null} hit what ended the run
 * @property {number} deadT
 * @property {number} score pages eaten
 * @property {boolean} reducedMotion
 * @property {() => number} random
 */

/** Column and row steps for RIGHT, DOWN, LEFT, UP. */
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @param {number} d */
export const reverse = (d) => (d + 2) % 4;

/** The canvas and the play rect inside it. @param {Area} size */
function area(size) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const ceiling = width < NARROW_WIDTH ? CEILING_NARROW : CEILING;
  return {
    width,
    height,
    ceiling,
    playW: width - SIDE_PAD * 2,
    playH: height - ceiling - BOTTOM_PAD,
  };
}

/**
 * Cell size and origin that fit a fixed grid into the play rect, centered.
 * @param {ReturnType<typeof area>} a @param {number} cols @param {number} rows @param {number} cap
 */
function fit(a, cols, rows, cap) {
  const cell = Math.max(1, Math.min(cap, Math.floor(Math.min(a.playW / cols, a.playH / rows))));
  return {
    width: a.width,
    height: a.height,
    ceiling: a.ceiling,
    cell,
    originX: SIDE_PAD + Math.round((a.playW - cols * cell) / 2),
    originY: a.ceiling + Math.round((a.playH - rows * cell) / 2),
  };
}

/** @param {World} w */
export function moveTFor(w) {
  const floor = w.reducedMotion ? MOVE_T_MIN_REDUCED : MOVE_T_MIN;
  return Math.max(floor, MOVE_T_START - MOVE_T_STEP * w.score);
}

/** Screen x of a column's center. @param {World} w @param {number} col */
export const centerX = (w, col) => w.originX + (col + 0.5) * w.cell;

/** Screen y of a row's center. @param {World} w @param {number} row */
export const centerY = (w, row) => w.originY + (row + 0.5) * w.cell;

/** Ring index of segment i, counting from the head. @param {World} w @param {number} i */
export const segment = (w, i) => (w.head - i + w.xs.length) % w.xs.length;

/**
 * Index of the k-th free cell in row-major order, or -1 when there are not that many.
 * @param {Uint8Array} occupied @param {number} k
 */
export function nthFree(occupied, k) {
  let left = k;
  for (let i = 0; i < occupied.length; i++) {
    if (occupied[i]) continue;
    if (left === 0) return i;
    left -= 1;
  }
  return -1;
}

/** @param {World} w @param {'wall' | 'tail' | 'full'} what */
function die(w, what) {
  w.dead = true;
  w.hit = what;
  w.deadT = 0;
  w.progress = 1;
}

/** Put a page on a random free cell, or end the run as a win when none is left. @param {World} w */
export function spawnFood(w) {
  const free = w.cols * w.rows - w.length;
  const index = free > 0 ? nthFree(w.occupied, Math.floor(w.random() * free)) : -1;
  if (index < 0) {
    w.foodX = -1;
    w.foodY = -1;
    die(w, 'full');
    return;
  }
  w.foodX = index % w.cols;
  w.foodY = Math.floor(index / w.cols);
  w.foodIndex += 1;
}

/**
 * @param {Area} size
 * @param {() => number} random
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {World}
 */
export function createWorld(size, random, options = {}) {
  const a = area(size);
  const cell = clamp(
    Math.floor(Math.min(a.playW / FIT_COLS, a.playH / FIT_ROWS)),
    CELL_MIN,
    CELL_MAX,
  );
  const cols = clamp(Math.floor(a.playW / cell), COLS_MIN, COLS_MAX);
  const rows = clamp(Math.floor(a.playH / cell), ROWS_MIN, ROWS_MAX);
  const cap = cols * rows;
  /** @type {World} */
  const w = {
    ...fit(a, cols, rows, cell),
    cols,
    rows,
    xs: new Int16Array(cap),
    ys: new Int16Array(cap),
    occupied: new Uint8Array(cap),
    head: START_LEN - 1,
    length: START_LEN,
    dir: RIGHT,
    queue: new Int8Array(QUEUE_MAX),
    queued: 0,
    tailFromX: 0,
    tailFromY: 0,
    foodX: -1,
    foodY: -1,
    foodIndex: 0,
    moveT: MOVE_T_START,
    timer: 0,
    progress: 1,
    prevProgress: 1,
    time: 0,
    ready: true,
    dead: false,
    hit: null,
    deadT: 0,
    score: 0,
    reducedMotion: Boolean(options.reducedMotion),
    random,
  };
  const hx = Math.floor(cols / 2);
  const hy = Math.floor(rows / 2);
  for (let k = 0; k < START_LEN; k++) {
    w.xs[k] = hx - (START_LEN - 1 - k);
    w.ys[k] = hy;
    w.occupied[hy * cols + w.xs[k]] = 1;
  }
  w.tailFromX = w.xs[0];
  w.tailFromY = hy;
  w.moveT = moveTFor(w);
  spawnFood(w);
  return w;
}

/**
 * Queue a turn. While ready, any turn but a reverse starts the run.
 * @param {World} w @param {number} d
 */
function steer(w, d) {
  if (w.ready) {
    if (d === reverse(w.dir)) return;
    w.ready = false;
    w.timer = w.moveT;
  }
  const last = w.queued ? w.queue[w.queued - 1] : w.dir;
  if (w.queued >= QUEUE_MAX || d === last || d === reverse(last)) return;
  w.queue[w.queued] = d;
  w.queued += 1;
}

/** Move the head one cell, eating, growing, or ending the run. @param {World} w */
function move(w) {
  if (w.queued) {
    w.dir = w.queue[0];
    w.queue[0] = w.queue[1];
    w.queued -= 1;
  }
  const nx = w.xs[w.head] + DX[w.dir];
  const ny = w.ys[w.head] + DY[w.dir];
  if (nx < 0 || ny < 0 || nx >= w.cols || ny >= w.rows) {
    die(w, 'wall');
    return;
  }
  const eating = nx === w.foodX && ny === w.foodY;
  const tip = segment(w, w.length - 1);
  const intoTip = !eating && nx === w.xs[tip] && ny === w.ys[tip];
  if (w.occupied[ny * w.cols + nx] && !intoTip) {
    die(w, 'tail');
    return;
  }
  // When eating, the tip stays put, so it slides from where it is.
  w.tailFromX = w.xs[tip];
  w.tailFromY = w.ys[tip];
  if (!eating) w.occupied[w.tailFromY * w.cols + w.tailFromX] = 0;
  w.head = (w.head + 1) % w.xs.length;
  w.xs[w.head] = nx;
  w.ys[w.head] = ny;
  w.occupied[ny * w.cols + nx] = 1;
  if (!eating) return;
  w.length += 1;
  w.score += 1;
  w.moveT = moveTFor(w);
  spawnFood(w);
}

/**
 * Advance the world one fixed step. Mutates and returns `w`.
 * @param {World} w
 * @param {number} turn RIGHT, DOWN, LEFT, UP, or NONE
 * @param {number} dt
 * @returns {World}
 */
export function stepWorld(w, turn, dt) {
  w.prevProgress = w.progress;
  w.time += dt;
  if (w.dead) {
    w.deadT += dt;
    return w;
  }
  if (turn !== NONE && w.time > START_GRACE) steer(w, turn);
  if (w.ready) return w;
  w.timer += dt;
  if (w.timer >= w.moveT) {
    w.timer -= w.moveT;
    w.prevProgress = 0;
    move(w);
  }
  if (!w.dead) w.progress = Math.min(1, w.timer / w.moveT);
  return w;
}

/**
 * Fit a running world to a new canvas size. Cols and rows stay, so nothing on the grid moves;
 * only the cell size and origin change.
 * @param {World} w
 * @param {Area} size
 * @returns {World}
 */
export function resizeWorld(w, size) {
  return Object.assign(w, fit(area(size), w.cols, w.rows, Number.POSITIVE_INFINITY));
}
