// @ts-check
// Fix the Link board: tile masks, rotation, the solvable generator, and the flood fill.
// A mask has one bit per arm: N=1, E=2, S=4, W=8. Every array is allocated once per board.

import { HERRING_CHANCE, MAX_CELLS } from './tuning.js';

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const STRAIGHT = N | S;
export const CORNER = N | E;
export const TEE = N | E | S;
export const CROSS = 15;
/** Kinds a filler tile may be. A cross never needs turning, so fillers skip it. */
const FILLERS = [STRAIGHT, CORNER, TEE];
const DIRS = [N, E, S, W];

/**
 * @typedef {object} Board
 * @property {number} cols
 * @property {number} rows
 * @property {number} startRow the start tile is (0, startRow), fed from the left edge
 * @property {number} endRow the end tile is (cols - 1, endRow), reaching the right edge
 * @property {Uint8Array} mask current arms per tile
 * @property {Uint8Array} solved arms of the generated solution per tile
 * @property {Uint8Array} lit 1 when the flood from the start reaches the tile
 * @property {Uint8Array} path 1 when the tile is on the carved path
 * @property {Int16Array} stack scratch: DFS stack, then flood queue
 * @property {Uint8Array} order scratch: shuffled directions, four per tile
 * @property {Uint8Array} next scratch: next direction index to try, per tile
 */

/** @returns {Board} */
export function createBoard() {
  return {
    cols: 0,
    rows: 0,
    startRow: 0,
    endRow: 0,
    mask: new Uint8Array(MAX_CELLS),
    solved: new Uint8Array(MAX_CELLS),
    lit: new Uint8Array(MAX_CELLS),
    path: new Uint8Array(MAX_CELLS),
    stack: new Int16Array(MAX_CELLS),
    order: new Uint8Array(MAX_CELLS * 4),
    next: new Uint8Array(MAX_CELLS),
  };
}

/** Turn a mask a quarter clockwise: N to E, E to S, S to W, W to N. @param {number} m */
export const rotate = (m) => ((m << 1) | (m >> 3)) & 15;

/** The arm on the far side of a shared edge. @param {number} dir */
export const opposite = (dir) => ((dir << 2) | (dir >> 2)) & 15;

/** @param {Board} b */
export const startCell = (b) => b.startRow * b.cols;

/** @param {Board} b */
export const endCell = (b) => b.endRow * b.cols + b.cols - 1;

/**
 * The tile across one edge, or -1 off the board.
 * @param {Board} b @param {number} cell @param {number} dir
 */
export function neighbor(b, cell, dir) {
  const col = cell % b.cols;
  if (dir === N) return cell >= b.cols ? cell - b.cols : -1;
  if (dir === S) return cell + b.cols < b.cols * b.rows ? cell + b.cols : -1;
  if (dir === E) return col < b.cols - 1 ? cell + 1 : -1;
  return col > 0 ? cell - 1 : -1;
}

/** @param {() => number} random @param {number} n */
const pick = (random, n) => Math.floor(random() * n);

/** @param {number} m @param {number} turns */
function turnBy(m, turns) {
  let out = m;
  for (let i = 0; i < turns; i++) out = rotate(out);
  return out;
}

/** Fisher-Yates the four directions for one tile. @param {Board} b @param {number} cell @param {() => number} random */
function shuffleDirs(b, cell, random) {
  const base = cell * 4;
  for (let i = 0; i < 4; i++) b.order[base + i] = DIRS[i];
  for (let i = 3; i > 0; i--) {
    const j = pick(random, i + 1);
    const t = b.order[base + i];
    b.order[base + i] = b.order[base + j];
    b.order[base + j] = t;
  }
  b.next[cell] = 0;
}

/**
 * Randomized depth-first search from start to end. Leaves the path in b.stack.
 * @param {Board} b @param {() => number} random
 * @returns {number} tiles on the path
 */
function carvePath(b, random) {
  const visited = b.path;
  visited.fill(0);
  const end = endCell(b);
  let depth = 0;
  b.stack[0] = startCell(b);
  visited[b.stack[0]] = 1;
  shuffleDirs(b, b.stack[0], random);
  while (depth >= 0) {
    const cell = b.stack[depth];
    if (cell === end) return depth + 1;
    if (b.next[cell] >= 4) {
      depth -= 1;
      continue;
    }
    const dir = b.order[cell * 4 + b.next[cell]];
    b.next[cell] += 1;
    const nb = neighbor(b, cell, dir);
    if (nb < 0 || visited[nb]) continue;
    visited[nb] = 1;
    shuffleDirs(b, nb, random);
    depth += 1;
    b.stack[depth] = nb;
  }
  return 0;
}

/** Direction from one tile to an adjacent one. @param {Board} b @param {number} from @param {number} to */
function dirTo(b, from, to) {
  if (to === from - b.cols) return N;
  if (to === from + b.cols) return S;
  return to === from + 1 ? E : W;
}

/** Give a two-arm tile one more arm, picked at random from the two it lacks. @param {number} m @param {() => number} random */
function addHerring(m, random) {
  let skip = pick(random, 2);
  for (let i = 0; i < 4; i++) {
    if (m & DIRS[i]) continue;
    if (skip === 0) return m | DIRS[i];
    skip -= 1;
  }
  return m;
}

/** Arm count of a mask. @param {number} m */
const arms = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

/**
 * Fill the board with a fresh solvable puzzle, scrambled so it does not start solved.
 * @param {Board} b mutated
 * @param {number} cols
 * @param {number} rows
 * @param {() => number} random
 * @returns {Board}
 */
export function generateBoard(b, cols, rows, random) {
  b.cols = cols;
  b.rows = rows;
  b.startRow = pick(random, rows);
  b.endRow = pick(random, rows);
  const cells = cols * rows;
  const length = carvePath(b, random);
  b.path.fill(0);
  b.solved.fill(0);
  for (let k = 0; k < length; k++) {
    const cell = b.stack[k];
    b.path[cell] = 1;
    let m = k === 0 ? W : dirTo(b, cell, b.stack[k - 1]);
    m |= k === length - 1 ? E : dirTo(b, cell, b.stack[k + 1]);
    if (arms(m) < 3 && random() < HERRING_CHANCE) m = addHerring(m, random);
    b.solved[cell] = m;
  }
  for (let cell = 0; cell < cells; cell++) {
    if (b.path[cell]) continue;
    b.solved[cell] = turnBy(FILLERS[pick(random, FILLERS.length)], pick(random, 4));
  }
  b.mask.fill(0);
  for (let cell = 0; cell < cells; cell++) b.mask[cell] = turnBy(b.solved[cell], pick(random, 4));
  // A tile with at most three arms has a turn without W, so this loop always ends.
  const start = startCell(b);
  while (flood(b)) b.mask[start] = rotate(b.mask[start]);
  return b;
}

/**
 * Light every tile the link reaches from the left edge. Two tiles join across an edge only
 * when both have the arm toward each other.
 * @param {Board} b mutated: b.lit
 * @returns {boolean} true when the link reaches the right edge
 */
export function flood(b) {
  b.lit.fill(0);
  const start = startCell(b);
  if (!(b.mask[start] & W)) return false;
  const queue = b.stack;
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  b.lit[start] = 1;
  while (head < tail) {
    const cell = queue[head++];
    for (let i = 0; i < 4; i++) {
      const dir = DIRS[i];
      if (!(b.mask[cell] & dir)) continue;
      const nb = neighbor(b, cell, dir);
      if (nb < 0 || b.lit[nb] || !(b.mask[nb] & opposite(dir))) continue;
      b.lit[nb] = 1;
      queue[tail++] = nb;
    }
  }
  const end = endCell(b);
  return b.lit[end] === 1 && (b.mask[end] & E) !== 0;
}
