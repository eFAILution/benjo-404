// @ts-check
// Train math for Code Crossing. A lane is an endless train of blocks: `len` block cells, then
// `gap` empty cells, repeated forever and sliding by `offset` cells. No per-block objects.
// Car k is block k and the gap after it. Whether car k carries an orb, and where, is a hash of
// the lane's seed and k, so orbs scatter along the train and only taken cars are stored.

import {
  CELL_MAX,
  GAP_MAX,
  GAP_MIN,
  HIT_MARGIN,
  LANE_SPEED_BASE,
  LANE_SPEED_CAP,
  LANE_SPEED_CAP_REDUCED,
  LANE_SPEED_STEP,
  LANES,
  LEN_MAX,
  LEN_MIN,
  LEVEL_SPEED,
  ORB_CHANCE,
  ORB_REACH,
  SPEED_JITTER,
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
 * @property {number} seed 32-bit seed for this level's orbs
 * @property {number} orbChance chance that a car carries an orb
 * @property {Set<number>} taken cars whose orb Benjo has picked up this level
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
    seed: 0,
    orbChance: 0,
    taken: new Set(),
  });

/** px/s for a speed rank at a level, before jitter. @param {number} rank @param {number} level */
const rankPx = (rank, level) =>
  LANE_SPEED_BASE + LANE_SPEED_STEP * rank + LEVEL_SPEED * (level - 1);

/**
 * Cells per second for a speed rank at a level, scaled by `jitter`. No lane ever runs faster
 * than the top rank does unjittered at that level, so jitter never makes a level harder to
 * cross than its fastest lane already is. Then capped, lower with reduced motion.
 * @param {number} rank 1..LANES, higher is faster @param {number} level
 * @param {boolean} reducedMotion @param {number} [jitter]
 */
export function laneSpeed(rank, level, reducedMotion, jitter = 1) {
  const cap = reducedMotion ? LANE_SPEED_CAP_REDUCED : LANE_SPEED_CAP;
  const px = Math.min(rankPx(rank, level) * jitter, rankPx(LANES, level));
  return Math.min(cap, px) / CELL_MAX;
}

/** A whole number in [lo, hi]. @param {() => number} random @param {number} lo @param {number} hi */
const pick = (random, lo, hi) => lo + Math.floor(random() * (hi - lo + 1));

/**
 * New block length, gap, orbs, phase, and speed for a level. Mutates `lane`.
 * @param {Lane} lane @param {number} level @param {() => number} random
 * @param {boolean} reducedMotion @param {number} [rank] speed rank, the lane number by default
 */
export function rerollLane(lane, level, random, reducedMotion, rank = lane.index) {
  lane.len = pick(random, LEN_MIN, LEN_MAX);
  lane.gap = pick(random, GAP_MIN, GAP_MAX);
  lane.period = lane.len + lane.gap;
  lane.seed = Math.floor(random() * 2 ** 32);
  lane.orbChance = ORB_CHANCE;
  lane.taken.clear();
  lane.offset = random() * lane.period;
  lane.prevOffset = lane.offset;
  const jitter = 1 + SPEED_JITTER * (2 * random() - 1);
  lane.speed = laneSpeed(rank, level, reducedMotion, jitter);
}

/**
 * A random order of the speed ranks 1..count, so the fast lanes move around each level.
 * @param {number} count @param {() => number} random
 */
export function shuffledRanks(count, random) {
  const ranks = Array.from({ length: count }, (_, i) => i + 1);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ranks[i], ranks[j]] = [ranks[j], ranks[i]];
  }
  return ranks;
}

/**
 * Is cell position `x` covered by a block? Periodic in `period`.
 * @param {Lane} lane @param {number} x cells from the band's left edge @param {number} [offset]
 */
export const blockAt = (lane, x, offset = lane.offset) => mod(x - offset, lane.period) < lane.len;

/**
 * Does a Benjo centered at `x` get hit? Like blockAt with the block shrunk by HIT_MARGIN.
 * @param {Lane} lane @param {number} x @param {number} [offset]
 */
export function hitAt(lane, x, offset = lane.offset) {
  const r = mod(x - offset, lane.period);
  return r > HIT_MARGIN && r < lane.len - HIT_MARGIN;
}

/** Salt for the second hash, which places an orb inside its gap. */
const PLACE_SALT = 0x5bd1e995;

/**
 * A number in [0, 1) from a seed and a car index (a 32-bit integer mix).
 * @param {number} seed @param {number} k
 */
function hash01(seed, k) {
  let h = (seed ^ Math.imul(k, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/**
 * The cell inside car k's period where its orb rides, or -1 when it has none or it was taken.
 * Orbs always sit in the gap, so they never overlap a block.
 * @param {Lane} lane @param {number} k
 */
export function orbIn(lane, k) {
  if (lane.taken.has(k) || hash01(lane.seed, k) >= lane.orbChance) return -1;
  return lane.len + Math.floor(hash01(lane.seed ^ PLACE_SALT, k) * lane.gap);
}

/**
 * The car whose orb, still in play, is within reach of `x`, or null.
 * @param {Lane} lane @param {number} x
 */
export function orbNear(lane, x) {
  const k = Math.floor((x - lane.offset) / lane.period);
  const at = orbIn(lane, k);
  if (at < 0) return null;
  const d = x - lane.offset - k * lane.period - at - 0.5;
  return Math.abs(d) < ORB_REACH ? k : null;
}
