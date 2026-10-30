// @ts-check
// A floor's maze (#100): COLS x ROWS cells, each with a bit per open side. Carved as a perfect
// maze by a random depth-first walk, then LOOPS walls are knocked out so there are ways round.

import { COLS, LOOPS, ROWS } from './tuning.js';

/** Up, right, down, left: the bit for each side, and its step. */
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const CELLS = COLS * ROWS;

/** @param {number} d */
export const back = (d) => (d + 2) % 4;

/** Is side `d` of cell `i` open? @param {number[]} open @param {number} i @param {number} d */
export const isOpen = (open, i, d) => d >= 0 && (open[i] & (1 << d)) !== 0;

/** The cell through side `d` of cell `i`, or -1 off the edge. @param {number} i @param {number} d */
export function step(i, d) {
  const c = (i % COLS) + DX[d];
  const r = Math.floor(i / COLS) + DY[d];
  return c < 0 || c >= COLS || r < 0 || r >= ROWS ? -1 : r * COLS + c;
}

/** @param {number[]} open @param {number} i @param {number} d */
function knock(open, i, d) {
  open[i] |= 1 << d;
  open[step(i, d)] |= 1 << back(d);
}

/**
 * @param {() => number} random
 * @returns {number[]} each cell's open sides as bits
 */
export function carve(random) {
  const open = new Array(CELLS).fill(0);
  const seen = new Array(CELLS).fill(false);
  const stack = [Math.floor(random() * CELLS)];
  seen[stack[0]] = true;
  while (stack.length) {
    const i = stack[stack.length - 1];
    const ways = [0, 1, 2, 3].filter((d) => step(i, d) >= 0 && !seen[step(i, d)]);
    if (!ways.length) {
      stack.pop();
      continue;
    }
    const d = ways[Math.floor(random() * ways.length)];
    knock(open, i, d);
    seen[step(i, d)] = true;
    stack.push(step(i, d));
  }
  for (let n = 0; n < LOOPS; n++) {
    const i = Math.floor(random() * CELLS);
    const d = Math.floor(random() * 4);
    if (step(i, d) >= 0) knock(open, i, d);
  }
  return open;
}

/**
 * Steps from `from` to every cell along the maze.
 * @param {number[]} open @param {number} from
 * @returns {number[]}
 */
export function distances(open, from) {
  const dist = new Array(CELLS).fill(-1);
  const queue = [from];
  dist[from] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    for (let d = 0; d < 4; d++) {
      const j = step(i, d);
      if (isOpen(open, i, d) && dist[j] < 0) {
        dist[j] = dist[i] + 1;
        queue.push(j);
      }
    }
  }
  return dist;
}
