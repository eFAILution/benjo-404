// @ts-check
// The 404 brick wall: the bitmap, where each brick sits for the current layout, and the
// circle-against-brick test that picks which side the fireball hit.

import { BRICK_GAP, GRID_COLS, MIN_VY_FRAC } from './tuning.js';

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */
/**
 * What brick code needs from the world.
 * @typedef {object} Wall
 * @property {number} gridLeft
 * @property {number} gridTop
 * @property {number} cell
 * @property {number} brickW
 * @property {number} brickH
 * @property {Uint8Array} alive one flag per brick
 * @property {Rect[]} rects one per brick, rebuilt by layoutBricks
 */

/**
 * Rows as 17-bit masks, bit 16 the leftmost column: "4", a gap column, "0", a gap, "4".
 */
const PATTERN = [
  0b10001011111010001, 0b10001010001010001, 0b11111010001011111, 0b00001010001000001,
  0b00001011111000001,
];

/** @type {number[]} */
const cols = [];
/** @type {number[]} */
const rows = [];
PATTERN.forEach((mask, row) => {
  for (let col = 0; col < GRID_COLS; col++) {
    if ((mask >> (GRID_COLS - 1 - col)) & 1) {
      cols.push(col);
      rows.push(row);
    }
  }
});

/** Bricks in a full wall (38). */
export const BRICK_COUNT = cols.length;

/** @returns {Rect[]} */
export const createRects = () =>
  Array.from({ length: BRICK_COUNT }, () => ({ x: 0, y: 0, w: 0, h: 0 }));

/** Place every brick rect from the grid sizes on the wall. @param {Wall} w */
export function layoutBricks(w) {
  for (let i = 0; i < BRICK_COUNT; i++) {
    const r = w.rects[i];
    r.x = w.gridLeft + cols[i] * w.cell + BRICK_GAP / 2;
    r.y = w.gridTop + rows[i] * (w.brickH + BRICK_GAP);
    r.w = w.brickW;
    r.h = w.brickH;
  }
}

/** Bring every brick back. @param {Wall} w */
export const refillBricks = (w) => w.alive.fill(1);

/** @param {Wall} w */
export function bricksLeft(w) {
  let n = 0;
  for (let i = 0; i < BRICK_COUNT; i++) n += w.alive[i];
  return n;
}

/**
 * Find the first live brick the ball touches, bounce the ball off its nearer side, and kill it.
 * The side with the smaller penetration is the one hit, and the velocity points away from it.
 * @param {Wall & { bx: number, by: number, vx: number, vy: number, ballR: number }} w mutated
 * @param {number} speed current ball speed, kept unchanged
 * @returns {number} the brick index, or -1 when nothing was hit
 */
export function hitBrick(w, speed) {
  const { bx, by, ballR: r } = w;
  for (let i = 0; i < BRICK_COUNT; i++) {
    if (!w.alive[i]) continue;
    const { x, y, w: rw, h: rh } = w.rects[i];
    const dx = bx - Math.min(x + rw, Math.max(x, bx));
    const dy = by - Math.min(y + rh, Math.max(y, by));
    if (dx * dx + dy * dy >= r * r) continue;
    const overlapX = Math.min(bx + r - x, x + rw - (bx - r));
    const overlapY = Math.min(by + r - y, y + rh - (by - r));
    if (overlapX < overlapY) w.vx = bx < x + rw / 2 ? -Math.abs(w.vx) : Math.abs(w.vx);
    else w.vy = by < y + rh / 2 ? -Math.abs(w.vy) : Math.abs(w.vy);
    w.alive[i] = 0;
    keepVertical(w, speed);
    return i;
  }
  return -1;
}

/**
 * Lift a too-flat path so |vy| is at least MIN_VY_FRAC of the speed, keeping the speed.
 * @param {{ vx: number, vy: number }} w mutated
 * @param {number} speed
 */
export function keepVertical(w, speed) {
  const least = speed * MIN_VY_FRAC;
  if (Math.abs(w.vy) >= least) return;
  w.vy = w.vy > 0 ? least : -least;
  w.vx = (w.vx < 0 ? -1 : 1) * Math.sqrt(speed * speed - least * least);
}
