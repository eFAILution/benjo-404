// @ts-check
// Train math for Code Crossing. A lane is an endless train of blocks: `len` block cells, then
// `gap` empty cells, repeated forever and sliding by `offset` cells. No per-block objects.
// Block k starts at offset + k * period. The Garbage Collector removes blocks k in
// cutLo..cutHi, the ones that were on screen, and the train refills from the edge.

import {
  CELL_MAX,
  GAP_MAX,
  GAP_MIN,
  HIT_MARGIN,
  LANE_SPEED_BASE,
  LANE_SPEED_CAP,
  LANE_SPEED_CAP_REDUCED,
  LANE_SPEED_STEP,
  LEN_MAX,
  LEN_MIN,
  LEVEL_SPEED,
  ORB_CHANCE,
  ORB_REACH,
} from './tuning.js';

/**
 * @typedef {object} Lane
 * @property {number} index lane number, 1 is the lowest
 * @property {1 | -1} dir +1 moves right
 * @property {number} speed cells per second
 * @property {number} len block cells
 * @property {number} gap empty cells after each block
 * @property {number} period len + gap
 * @property {number} offset cells; a block starts at offset + k * period
 * @property {number} prevOffset
 * @property {number} orbAt cell inside the period where an orb rides, or -1
 * @property {boolean} orbTaken
 * @property {number} cutLo first removed block index
 * @property {number} cutHi last removed block index; below cutLo means none
 */

/** Positive remainder. @param {number} a @param {number} n */
export const mod = (a, n) => ((a % n) + n) % n;

/** @param {number} index */
export const createLane = (index) =>
  /** @type {Lane} */ ({
    index,
    dir: index % 2 === 1 ? 1 : -1,
    speed: 0,
    len: LEN_MIN,
    gap: GAP_MIN,
    period: LEN_MIN + GAP_MIN,
    offset: 0,
    prevOffset: 0,
    orbAt: -1,
    orbTaken: false,
    cutLo: 0,
    cutHi: -1,
  });

/**
 * Cells per second for a lane at a level, capped (lower with reduced motion).
 * @param {number} index @param {number} level @param {boolean} reducedMotion
 */
export function laneSpeed(index, level, reducedMotion) {
  const cap = reducedMotion ? LANE_SPEED_CAP_REDUCED : LANE_SPEED_CAP;
  const px = LANE_SPEED_BASE + LANE_SPEED_STEP * index + LEVEL_SPEED * (level - 1);
  return Math.min(cap, px) / CELL_MAX;
}

/** A whole number in [lo, hi]. @param {() => number} random @param {number} lo @param {number} hi */
const pick = (random, lo, hi) => lo + Math.floor(random() * (hi - lo + 1));

/**
 * New block length, gap, orb, and phase for a level. Mutates `lane`.
 * @param {Lane} lane @param {number} level @param {() => number} random @param {boolean} reducedMotion
 */
export function rerollLane(lane, level, random, reducedMotion) {
  lane.len = pick(random, LEN_MIN, LEN_MAX);
  lane.gap = pick(random, GAP_MIN, GAP_MAX);
  lane.period = lane.len + lane.gap;
  lane.orbAt = random() < ORB_CHANCE ? lane.len + pick(random, 0, lane.gap - 1) : -1;
  lane.orbTaken = false;
  lane.offset = random() * lane.period;
  lane.prevOffset = lane.offset;
  lane.speed = laneSpeed(lane.index, level, reducedMotion);
  lane.cutLo = 0;
  lane.cutHi = -1;
}

/** Was block k removed by the Garbage Collector? @param {Lane} lane @param {number} k */
export const isCut = (lane, k) => k >= lane.cutLo && k <= lane.cutHi;

/** Index of the block whose period holds `x`. @param {Lane} lane @param {number} x @param {number} offset */
const blockIndex = (lane, x, offset) => Math.floor((x - offset) / lane.period);

/**
 * Is cell position `x` covered by a block? Periodic in `period`, less any removed blocks.
 * @param {Lane} lane @param {number} x cells from the band's left edge @param {number} [offset]
 */
export const blockAt = (lane, x, offset = lane.offset) =>
  mod(x - offset, lane.period) < lane.len && !isCut(lane, blockIndex(lane, x, offset));

/**
 * Does a Benjo centered at `x` get hit? Like blockAt with the block shrunk by HIT_MARGIN.
 * @param {Lane} lane @param {number} x @param {number} [offset]
 */
export function hitAt(lane, x, offset = lane.offset) {
  const r = mod(x - offset, lane.period);
  return r > HIT_MARGIN && r < lane.len - HIT_MARGIN && !isCut(lane, blockIndex(lane, x, offset));
}

/**
 * Remove every block that overlaps the band (0 to `cols` cells). Mutates `lane`.
 * @param {Lane} lane @param {number} cols
 * @returns {number} how many were removed that were not already gone
 */
export function cutLane(lane, cols) {
  const lo = Math.floor((-lane.len - lane.offset) / lane.period) + 1;
  const hi = Math.ceil((cols - lane.offset) / lane.period) - 1;
  let removed = 0;
  for (let k = lo; k <= hi; k++) if (!isCut(lane, k)) removed += 1;
  lane.cutLo = lo;
  lane.cutHi = hi;
  return removed;
}

/**
 * Is an orb, still in play, within reach of `x`?
 * @param {Lane} lane @param {number} x
 */
export function orbNear(lane, x) {
  if (lane.orbAt < 0 || lane.orbTaken) return false;
  const d = mod(x - lane.offset - lane.orbAt - 0.5, lane.period);
  return d < ORB_REACH || d > lane.period - ORB_REACH;
}
