// @ts-check
// The Code Crossing world and its fixed step. No DOM, no host: tests drive it directly.
//
// Benjo lives on a grid of cells: `col` and `row` are where he is (or is hopping to), and
// `bx`/`by` are his drawn center in cells, tweened between hops. Lane offsets are in cells too,
// so a resize only changes the cell size and the column count.
// Power-ups come in through `powers`: the magnet flag and the Digital Twin's absorb(), which the
// step calls at the moment a block would cost Benjo a life.

import {
  createLane,
  cutLane,
  hitAt,
  orbNear,
  pullOrb,
  rerollLane,
  shuffledRanks,
} from './lanes.js';
import {
  BOTTOM_PAD,
  CEILING,
  CEILING_NARROW,
  CELL_MAX,
  COLS_MIN,
  CROSS_T,
  EVENT_HIT,
  EVENT_HOP,
  EVENT_LEVEL,
  EVENT_ORB,
  EVENT_SCORE,
  GOAL_ROW,
  GOAL_SCORE,
  GRACE_T,
  HIT_T,
  HOP_T,
  LANES,
  LIVES,
  MAGNET_ROWS,
  MAGNET_V,
  MIN_HEIGHT,
  MIN_WIDTH,
  NARROW_WIDTH,
  ORB_SCORE,
  REF_HEIGHT,
  ROW_SCORE,
  ROWS,
  SIDE_PAD,
  START_GRACE,
  TIMER_ROOM,
  UNIT_MAX,
  UNIT_MIN,
} from './tuning.js';

/** @typedef {import('./lanes.js').Lane} Lane */
/** @typedef {'up' | 'down' | 'left' | 'right'} Dir */
/** @typedef {{ hop: Dir | null }} Intent */
/** @typedef {{ width: number, height: number }} Area */
/**
 * @typedef {{ magnet?: boolean, absorb?: () => boolean }} Powers
 *   magnet pulls orbs in this step; absorb() is true when the Digital Twin takes a hit.
 */
/**
 * @typedef {object} World
 * @property {number} width
 * @property {number} height
 * @property {number} unit
 * @property {number} ceiling screen y of the bottom of the HUD strip
 * @property {number} cell px per cell (rows are square cells)
 * @property {number} cols odd column count
 * @property {number} bandX screen x of column 0's left edge
 * @property {number} bandBottom screen y of row 0's bottom edge
 * @property {number} col
 * @property {number} row
 * @property {number} fromCol where the current hop started
 * @property {number} fromRow
 * @property {number} hopT seconds left in the current hop
 * @property {Dir | null} queued one buffered hop
 * @property {Dir} facing
 * @property {number} bx Benjo's center in cells from the band's left edge
 * @property {number} by Benjo's center in cells from the band's bottom edge
 * @property {number} prevBx
 * @property {number} prevBy
 * @property {number} level
 * @property {number} lives
 * @property {number} clock seconds left in this crossing
 * @property {number} scoredRow highest row scored this crossing
 * @property {number} topRow highest row reached since the last respawn
 * @property {number} score
 * @property {number} orbs collected this run
 * @property {number} hitT hit stop left after a lost life
 * @property {number} hitAge seconds since the last hit, for shake and flash
 * @property {number} graceT seconds left in which blocks pass through Benjo (Digital Twin)
 * @property {boolean} dead
 * @property {number} deadT
 * @property {'block' | 'timeout' | null} hit what cost the last life
 * @property {number} events EVENT_* bits raised by the last step
 * @property {number} time seconds since start
 * @property {boolean} reducedMotion
 * @property {() => number} random
 * @property {Lane[]} lanes lanes[i] is row i + 1
 */

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @param {Area} size */
function layout(size) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const unit = clamp(height / REF_HEIGHT, UNIT_MIN, UNIT_MAX);
  const ceiling = size.width < NARROW_WIDTH ? CEILING_NARROW : CEILING;
  const top = ceiling + TIMER_ROOM;
  const playW = width - 2 * SIDE_PAD;
  const playH = height - top - BOTTOM_PAD;
  const cell = Math.min(playH / ROWS, CELL_MAX * unit, playW / COLS_MIN);
  const fit = Math.floor(playW / cell);
  const cols = Math.max(COLS_MIN, fit % 2 === 1 ? fit : fit - 1);
  return {
    width,
    height,
    unit,
    ceiling,
    cell,
    cols,
    bandX: (width - cols * cell) / 2,
    bandBottom: top + (playH + ROWS * cell) / 2,
  };
}

/**
 * @template T
 * @param {number} n
 * @param {(i: number) => T} make
 * @returns {T[]}
 */
const pool = (n, make) => Array.from({ length: n }, (_, i) => make(i));

/** Put Benjo on the start curb's middle column, standing still. @param {World} w */
function toCurb(w) {
  w.col = w.fromCol = Math.floor(w.cols / 2);
  w.row = w.fromRow = 0;
  w.hopT = 0;
  w.queued = null;
  w.facing = 'up';
  w.bx = w.prevBx = w.col + 0.5;
  w.by = w.prevBy = 0.5;
  w.clock = CROSS_T;
  w.topRow = 0;
}

/** New lanes for this level, with the speed ranks dealt out at random. @param {World} w */
function rerollAll(w) {
  const ranks = shuffledRanks(w.lanes.length, w.random);
  for (const [i, lane] of w.lanes.entries()) {
    rerollLane(lane, w.level, w.random, w.reducedMotion, ranks[i]);
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
    col: 0,
    row: 0,
    fromCol: 0,
    fromRow: 0,
    hopT: 0,
    queued: null,
    facing: 'up',
    bx: 0,
    by: 0,
    prevBx: 0,
    prevBy: 0,
    level: 1,
    lives: LIVES,
    clock: CROSS_T,
    scoredRow: 0,
    topRow: 0,
    score: 0,
    orbs: 0,
    hitT: 0,
    hitAge: Number.POSITIVE_INFINITY,
    graceT: 0,
    dead: false,
    deadT: 0,
    hit: null,
    events: 0,
    time: 0,
    reducedMotion: Boolean(options.reducedMotion),
    random,
    lanes: pool(LANES, (i) => createLane(i + 1)),
  };
  toCurb(w);
  rerollAll(w);
  return w;
}

/** The lane under Benjo, or null on a curb. @param {World} w */
export const laneUnder = (w) => (w.row >= 1 && w.row <= LANES ? w.lanes[w.row - 1] : null);

/** Begin a hop, or do nothing when it would leave the board. @param {World} w @param {Dir} dir */
function startHop(w, dir) {
  const col = w.col + (dir === 'left' ? -1 : dir === 'right' ? 1 : 0);
  const row = w.row + (dir === 'up' ? 1 : dir === 'down' ? -1 : 0);
  w.facing = dir;
  if (col < 0 || col >= w.cols || row < 0) return;
  w.fromCol = w.col;
  w.fromRow = w.row;
  w.col = col;
  w.row = row;
  w.hopT = HOP_T;
  w.events |= EVENT_HOP;
  w.topRow = Math.max(w.topRow, row);
  if (row > w.scoredRow && row <= LANES) {
    w.scoredRow = row;
    w.score += ROW_SCORE;
    w.events |= EVENT_SCORE;
  }
}

/** Benjo landed on the goal curb: next level. @param {World} w */
function levelUp(w) {
  w.score += GOAL_SCORE;
  w.level += 1;
  w.scoredRow = 0;
  w.events |= EVENT_SCORE | EVENT_LEVEL;
  rerollAll(w);
  toCurb(w);
}

/** @param {World} w @param {'block' | 'timeout'} what */
function loseLife(w, what) {
  w.lives -= 1;
  w.hit = what;
  w.hitAge = 0;
  w.queued = null;
  w.events |= EVENT_HIT;
  if (w.lives > 0) {
    w.hitT = HIT_T;
    return;
  }
  w.dead = true;
  w.deadT = 0;
}

/** Tweened center in cells; snaps with reduced motion are a draw choice, not a rule. @param {World} w */
function placeBenjo(w) {
  const t = w.hopT / HOP_T;
  w.bx = w.col + 0.5 + (w.fromCol - w.col) * t;
  w.by = w.row + 0.5 + (w.fromRow - w.row) * t;
}

/** @param {World} w @param {Lane} lane @param {number} car */
function takeOrb(w, lane, car) {
  lane.taken.add(car);
  w.orbs += 1;
  w.score += ORB_SCORE;
  w.events |= EVENT_ORB | EVENT_SCORE;
}

/**
 * Block hits and orb pickups on the lane under Benjo. The Digital Twin may take a block hit.
 * @param {World} w @param {Powers} [powers]
 */
function checkLane(w, powers) {
  const lane = laneUnder(w);
  if (!lane) return;
  const x = w.col + 0.5;
  if (w.graceT === 0 && hitAt(lane, x)) {
    if (!powers?.absorb?.()) {
      loseLife(w, 'block');
      return;
    }
    w.graceT = GRACE_T;
  }
  const car = orbNear(lane, x);
  if (car !== null) takeOrb(w, lane, car);
}

/**
 * Magnet: orbs on Benjo's lane and the lanes next to it slide along their lane to his column,
 * and he takes them when they get there. Mutates `w`.
 * @param {World} w @param {number} dt
 */
function pullOrbs(w, dt) {
  const x = w.col + 0.5;
  const step = MAGNET_V * dt;
  for (const lane of w.lanes) {
    if (Math.abs(lane.index - w.row) > MAGNET_ROWS) continue;
    const car = pullOrb(lane, x, step);
    if (car !== null) takeOrb(w, lane, car);
  }
}

/**
 * Garbage Collector: remove every block on the band now. Mutates `w`.
 * @param {World} w
 * @returns {number} how many were removed
 */
export function clearBlocks(w) {
  let cleared = 0;
  for (const lane of w.lanes) cleared += cutLane(lane, w.cols);
  return cleared;
}

/**
 * Advance the world one fixed step. Mutates and returns `w`.
 * @param {World} w
 * @param {Intent} intent
 * @param {number} dt
 * @param {Powers} [powers]
 * @returns {World}
 */
export function stepWorld(w, intent, dt, powers) {
  w.prevBx = w.bx;
  w.prevBy = w.by;
  for (const lane of w.lanes) lane.prevOffset = lane.offset;
  w.events = 0;
  w.time += dt;
  w.hitAge += dt;

  if (w.dead) {
    w.deadT += dt;
    return w;
  }
  if (w.hitT > 0) {
    w.hitT -= dt;
    if (w.hitT <= 0) toCurb(w);
    return w;
  }

  if (intent.hop && w.time > START_GRACE) {
    if (w.hopT > 0) w.queued = intent.hop;
    else startHop(w, intent.hop);
  }
  for (const lane of w.lanes) lane.offset += lane.dir * lane.speed * dt;

  if (w.hopT > 0) w.hopT = Math.max(0, w.hopT - dt);
  if (w.hopT === 0 && w.row === GOAL_ROW) {
    levelUp(w);
    return w;
  }
  if (w.hopT === 0 && w.queued) {
    startHop(w, w.queued);
    w.queued = null;
  }
  placeBenjo(w);
  w.graceT = Math.max(0, w.graceT - dt);
  checkLane(w, powers);
  if (w.hitT > 0 || w.dead) return w;
  if (powers?.magnet) pullOrbs(w, dt);
  w.clock -= dt;
  if (w.clock <= 0) loseLife(w, 'timeout');
  return w;
}

/**
 * Fit a running world to a new canvas size. Grid state is in cells, so only the column count
 * can move Benjo: he is clamped onto the band.
 * @param {World} w
 * @param {Area} size
 * @returns {World}
 */
export function resizeWorld(w, size) {
  Object.assign(w, layout(size));
  const last = w.cols - 1;
  w.col = Math.min(w.col, last);
  w.fromCol = Math.min(w.fromCol, last);
  placeBenjo(w);
  w.prevBx = clamp(w.prevBx, 0.5, last + 0.5);
  return w;
}

/** Screen x of a cell position. @param {World} w @param {number} x */
export const screenX = (w, x) => w.bandX + x * w.cell;

/** Screen y of a cell height above the band's bottom. @param {World} w @param {number} y */
export const screenY = (w, y) => w.bandBottom - y * w.cell;
