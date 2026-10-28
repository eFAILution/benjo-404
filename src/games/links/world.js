// @ts-check
// The Fix the Link world and its fixed step. No DOM, no host: tests drive it directly.
// Tiles are logical (a board of masks); the layout only says where they sit on screen.

import { createBoard, flood, generateBoard, rotate } from './board.js';
import {
  BAR_GAP,
  BAR_H,
  BAR_ZONE,
  BOARD_COLS,
  BOARD_MARGIN,
  BOARD_ROWS,
  BOARD_SCORE,
  BOTTOM_PAD,
  CEILING,
  CEILING_NARROW,
  CLOCK_CAP,
  CLOCK_START,
  EVENT_SOLVED,
  EVENT_TIMEOUT,
  EVENT_TURN,
  MAX_CELLS,
  MIN_HEIGHT,
  MIN_WIDTH,
  NARROW_WIDTH,
  REF_HEIGHT,
  ROT_T,
  SIDE_PAD,
  SIDE_TILES,
  SOLVE_BONUS_T,
  SOLVED_T,
  START_GRACE,
  TILE_MAX,
  UNIT_MAX,
  UNIT_MIN,
} from './tuning.js';

/** @typedef {{ width: number, height: number }} Area */
/** @typedef {import('./board.js').Board} Board */
/** @typedef {{ dx: number, dy: number, turn: boolean, tapTile: number }} Intent */
/**
 * @typedef {object} World
 * @property {number} width
 * @property {number} height
 * @property {number} unit
 * @property {number} ceiling screen y nothing interactive goes above, just below the HUD strip
 * @property {number} tile tile size in px
 * @property {number} boardLeft
 * @property {number} boardTop
 * @property {number} barX timer bar left
 * @property {number} barY
 * @property {number} barW
 * @property {number} barH
 * @property {Board} board
 * @property {number} round 1 for the first board
 * @property {number} cursor tile index
 * @property {number} clock seconds left
 * @property {number} prevClock
 * @property {number} solvedT seconds left of the pause after a solve, 0 while playing
 * @property {boolean} connected the current board is solved
 * @property {number} score
 * @property {number} solves
 * @property {number} turns
 * @property {number} time seconds since start
 * @property {number} prevTime
 * @property {boolean} dead
 * @property {number} deadT
 * @property {number} events EVENT_* bits raised by the last step
 * @property {boolean} reducedMotion
 * @property {() => number} random
 * @property {Float32Array} rot seconds left of each tile's turn tween
 * @property {Float32Array} prevRot
 */

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Board columns and rows for a round, which counts from 1. @param {number} round */
export function boardSize(round) {
  const i = Math.min(round, BOARD_COLS.length) - 1;
  return { cols: BOARD_COLS[i], rows: BOARD_ROWS[i] };
}

/**
 * Where everything sits for this canvas and board size.
 * @param {Area} size @param {number} cols @param {number} rows
 */
function layout(size, cols, rows) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const unit = clamp(height / REF_HEIGHT, UNIT_MIN, UNIT_MAX);
  const ceiling = width < NARROW_WIDTH ? CEILING_NARROW : CEILING;
  const playW = width - SIDE_PAD * 2;
  const playH = height - ceiling - BOTTOM_PAD;
  const availH = playH - BAR_ZONE * unit - BOARD_MARGIN;
  const tile = Math.max(
    1,
    Math.floor(
      Math.min((playW - BOARD_MARGIN) / (cols + SIDE_TILES), availH / rows, TILE_MAX * unit),
    ),
  );
  return {
    width,
    height,
    unit,
    ceiling,
    tile,
    boardLeft: Math.round((width - cols * tile) / 2),
    boardTop: Math.round(
      ceiling + BAR_ZONE * unit + BOARD_MARGIN / 2 + Math.max(0, availH - rows * tile) / 2,
    ),
    barX: SIDE_PAD,
    barY: ceiling + BAR_GAP,
    barW: playW,
    barH: Math.max(1, Math.round(BAR_H * unit)),
  };
}

/**
 * @param {Area} size
 * @param {() => number} random
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {World}
 */
export function createWorld(size, random, options = {}) {
  const { cols, rows } = boardSize(1);
  const board = generateBoard(createBoard(), cols, rows, random);
  return {
    ...layout(size, cols, rows),
    board,
    round: 1,
    cursor: board.startRow * cols,
    clock: CLOCK_START,
    prevClock: CLOCK_START,
    solvedT: 0,
    connected: false,
    score: 0,
    solves: 0,
    turns: 0,
    time: 0,
    prevTime: 0,
    dead: false,
    deadT: 0,
    events: 0,
    reducedMotion: Boolean(options.reducedMotion),
    random,
    rot: new Float32Array(MAX_CELLS),
    prevRot: new Float32Array(MAX_CELLS),
  };
}

/** Tile index under a screen point, or -1. @param {World} w @param {number} x @param {number} y */
export function tileAt(w, x, y) {
  const col = Math.floor((x - w.boardLeft) / w.tile);
  const row = Math.floor((y - w.boardTop) / w.tile);
  const { cols, rows } = w.board;
  if (col < 0 || row < 0 || col >= cols || row >= rows) return -1;
  return row * cols + col;
}

/**
 * Turn one tile a quarter clockwise and re-run the flood.
 * @param {World} w @param {number} cell
 */
export function turnTile(w, cell) {
  const b = w.board;
  b.mask[cell] = rotate(b.mask[cell]);
  const tween = w.reducedMotion ? 0 : ROT_T;
  w.rot[cell] = tween;
  w.prevRot[cell] = tween;
  w.turns += 1;
  w.events |= EVENT_TURN;
  if (flood(b)) solve(w);
}

/** Score the board, bank time, and hold the lit path on screen. @param {World} w */
function solve(w) {
  w.score += BOARD_SCORE * w.round + Math.floor(w.clock);
  w.clock = Math.min(CLOCK_CAP, w.clock + SOLVE_BONUS_T);
  w.prevClock = w.clock;
  w.solvedT = SOLVED_T;
  w.connected = true;
  w.solves += 1;
  w.events |= EVENT_SOLVED;
}

/** Deal the next round's board and put the cursor back on the start tile. @param {World} w */
function nextBoard(w) {
  w.round += 1;
  const { cols, rows } = boardSize(w.round);
  generateBoard(w.board, cols, rows, w.random);
  Object.assign(w, layout(w, cols, rows));
  w.cursor = w.board.startRow * cols;
  w.connected = false;
  w.solvedT = 0;
  w.rot.fill(0);
  w.prevRot.fill(0);
}

/** @param {World} w @param {Intent} intent */
function applyIntent(w, intent) {
  if (intent.tapTile >= 0 && intent.tapTile < w.board.cols * w.board.rows) {
    w.cursor = intent.tapTile;
    turnTile(w, intent.tapTile);
    return;
  }
  const { cols, rows } = w.board;
  const col = clamp((w.cursor % cols) + intent.dx, 0, cols - 1);
  const row = clamp(Math.floor(w.cursor / cols) + intent.dy, 0, rows - 1);
  w.cursor = row * cols + col;
  if (intent.turn) turnTile(w, w.cursor);
}

/**
 * Advance the world one fixed step. Mutates and returns `w`.
 * @param {World} w
 * @param {Intent} intent
 * @param {number} dt
 * @returns {World}
 */
export function stepWorld(w, intent, dt) {
  w.prevTime = w.time;
  w.prevClock = w.clock;
  w.prevRot.set(w.rot);
  w.events = 0;
  w.time += dt;
  for (let i = 0; i < w.rot.length; i++) w.rot[i] = Math.max(0, w.rot[i] - dt);

  if (w.dead) {
    w.deadT += dt;
    return w;
  }
  if (w.solvedT > 0) {
    w.solvedT -= dt;
    if (w.solvedT <= 0) nextBoard(w);
    return w;
  }
  if (w.time > START_GRACE) applyIntent(w, intent);
  if (w.connected) return w;

  w.clock = Math.max(0, w.clock - dt);
  if (w.clock <= 0) {
    w.dead = true;
    w.deadT = 0;
    w.events |= EVENT_TIMEOUT;
  }
  return w;
}

/**
 * Fit a running world to a new canvas size. Tiles are logical, so only the layout changes.
 * @param {World} w
 * @param {Area} size
 * @returns {World}
 */
export function resizeWorld(w, size) {
  return Object.assign(w, layout(size, w.board.cols, w.board.rows));
}
