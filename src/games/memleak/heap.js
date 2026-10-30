// @ts-check
// The heap (#106): the grid of cells, the placed blocks, and what happens to them. No DOM, no
// host. world.js runs the step and owns the falling block.
//
// `cells` holds, for each cell, the pool index of the block in it, or -1 for a free cell. Row 0
// is the floor. A block that frees leaves a hole, and blocks above it stay where they are until
// a compact settles them. Nothing here allocates.

import {
  BLOCK_POOL,
  COLS,
  COMPACT_CHARGE,
  EVENT_FLUSH,
  EVENT_FREE,
  EVENT_READY,
  FREE_SCORE,
  POP_T,
  ROW_BONUS,
  ROWS,
  SETTLE_T,
} from './tuning.js';

/** @typedef {import('./world.js').World} World */
/**
 * A placed block: `w` cells wide and one tall, its left cell at column `x`, on row `y`. It frees
 * itself when `life` runs out. `fromY` is where it stood before the last compact, for drawing.
 * @typedef {{ active: boolean, x: number, y: number, w: number, life: number, maxLife: number,
 *   fromY: number }} Block
 */
/** Where a block freed, for a short fading outline. @typedef {{ active: boolean, x: number, y: number, w: number, t: number }} Pop */

/** @returns {Block} */
export const emptyBlock = () => ({
  active: false,
  x: 0,
  y: 0,
  w: 1,
  life: 0,
  maxLife: 1,
  fromY: 0,
});

/** The block index in a cell, or -1. @param {World} w @param {number} col @param {number} row */
export const cellAt = (w, col, row) => w.cells[row * COLS + col];

/** How high a column is filled: one above its highest used cell, 0 when empty. @param {World} w @param {number} col */
export function colTop(w, col) {
  for (let row = ROWS - 1; row >= 0; row--) if (cellAt(w, col, row) >= 0) return row + 1;
  return 0;
}

/**
 * The row a block `width` wide at column `x` lands on: just above the highest used cell under
 * any of its columns. ROWS or more means it would stick out of the top.
 * @param {World} w @param {number} x @param {number} width
 */
export function landing(w, x, width) {
  let top = 0;
  for (let col = x; col < x + width; col++) top = Math.max(top, colTop(w, col));
  return top;
}

/** Does a block `width` wide land inside the heap somewhere? @param {World} w @param {number} width */
export function fits(w, width) {
  for (let x = 0; x + width <= COLS; x++) if (landing(w, x, width) < ROWS) return true;
  return false;
}

/** @param {World} w @param {Block} b @param {number} id the block's pool index, or -1 to clear */
function mark(w, b, id) {
  for (let col = b.x; col < b.x + b.w; col++) w.cells[b.y * COLS + col] = id;
}

/**
 * Put a block in the heap. The caller checked the row is inside it.
 * @param {World} w @param {number} x @param {number} y @param {number} width @param {number} life
 * @returns {Block | null} null only if the pool is full, which a full grid prevents
 */
export function place(w, x, y, width, life) {
  const id = w.blocks.findIndex((b) => !b.active);
  if (id < 0) return null;
  const b = w.blocks[id];
  Object.assign(b, { active: true, x, y, w: width, life, maxLife: life, fromY: y });
  mark(w, b, id);
  return b;
}

/** @param {World} w @param {Block} b */
function addPop(w, b) {
  const p = w.pops.find((it) => !it.active) ?? w.pops[w.popNext];
  w.popNext = (w.popNext + 1) % w.pops.length;
  Object.assign(p, { active: true, x: b.x, y: b.y, w: b.w, t: 0 });
}

/**
 * Free a block and leave a hole. A scored free adds its points and charges the compact meter.
 * @param {World} w @param {Block} b @param {boolean} scored
 */
export function freeBlock(w, b, scored) {
  if (!b.active) return;
  b.active = false;
  mark(w, b, -1);
  addPop(w, b);
  if (!scored) return;
  w.score += FREE_SCORE[b.w];
  const before = w.charge;
  w.charge = Math.min(COMPACT_CHARGE, w.charge + b.w);
  if (before < COMPACT_CHARGE && w.charge === COMPACT_CHARGE) w.events |= EVENT_READY;
  w.events |= EVENT_FREE;
}

/** Count down every block's life and free the ones that run out. @param {World} w @param {number} dt */
export function stepLives(w, dt) {
  for (const b of w.blocks) {
    if (!b.active) continue;
    b.life -= dt;
    if (b.life <= 0) freeBlock(w, b, true);
  }
}

/** Fade the outlines of freed blocks. @param {World} w @param {number} dt */
export function stepPops(w, dt) {
  for (const p of w.pops) {
    if (!p.active) continue;
    p.t += dt;
    if (p.t >= POP_T) p.active = false;
  }
}

/** A full row frees every block in it, for their points and a bonus. @param {World} w @param {number} row */
export function flushRow(w, row) {
  for (let col = 0; col < COLS; col++) if (cellAt(w, col, row) < 0) return false;
  for (let col = 0; col < COLS; col++) {
    const id = cellAt(w, col, row);
    if (id >= 0) freeBlock(w, w.blocks[id], true);
  }
  w.score += ROW_BONUS;
  w.flushes += 1;
  w.events |= EVENT_FLUSH;
  return true;
}

/** @param {World} w */
function flushAll(w) {
  for (let row = 0; row < ROWS; row++) flushRow(w, row);
}

/**
 * Compact: every block falls straight down, as one piece, until it rests on the floor or on a
 * block under any of its cells. Blocks settle from the bottom up, so each one rests on blocks
 * that have already settled. Full rows that form then flush.
 * @param {World} w
 */
export function compact(w) {
  let n = 0;
  for (let i = 0; i < BLOCK_POOL; i++) {
    if (!w.blocks[i].active) continue;
    // Insertion sort by row keeps the order without allocating.
    let k = n++;
    while (k > 0 && w.blocks[w.order[k - 1]].y > w.blocks[i].y) {
      w.order[k] = w.order[k - 1];
      k--;
    }
    w.order[k] = i;
  }
  w.cells.fill(-1);
  w.tops.fill(0);
  for (let k = 0; k < n; k++) {
    const id = w.order[k];
    const b = w.blocks[id];
    let rest = 0;
    for (let col = b.x; col < b.x + b.w; col++) rest = Math.max(rest, w.tops[col]);
    b.fromY = b.y;
    b.y = rest;
    mark(w, b, id);
    for (let col = b.x; col < b.x + b.w; col++) w.tops[col] = rest + 1;
  }
  w.settleT = SETTLE_T;
  flushAll(w);
}

/** Free, without points, every block on the top `rows` rows. @param {World} w @param {number} rows */
export function clearTop(w, rows) {
  for (const b of w.blocks) if (b.active && b.y >= ROWS - rows) freeBlock(w, b, false);
}

/** Garbage Collector: free every block now, for its points. @param {World} w @returns {number} how many */
export function freeAll(w) {
  let count = 0;
  for (const b of w.blocks) {
    if (!b.active) continue;
    freeBlock(w, b, true);
    count += 1;
  }
  return count;
}
