// @ts-check
// Train math for Code Crossing. A lane is an endless train of blocks: `len` block cells, then
// `gap` empty cells, repeated forever and sliding by `offset` cells. No per-block objects.
// Car k is block k and the gap after it. Whether car k carries an orb, and where, is a hash of
// the lane's seed and k, so orbs scatter along the train and only taken cars are stored.
// The Garbage Collector removes blocks k in cutLo..cutHi, the ones that were on screen, and
// the train refills from the edge. The magnet nudges an orb along its lane toward Benjo.

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
 * @property {Map<number, number>} nudge cells the magnet has moved car k's orb, by car
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
    seed: 0,
    orbChance: 0,
    taken: new Set(),
    nudge: new Map(),
    cutLo: 0,
    cutHi: -1,
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
  lane.nudge.clear();
  lane.offset = random() * lane.period;
  lane.prevOffset = lane.offset;
  const jitter = 1 + SPEED_JITTER * (2 * random() - 1);
  lane.speed = laneSpeed(rank, level, reducedMotion, jitter);
  lane.cutLo = 0;
  lane.cutHi = -1;
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
 * Where car k's orb is drawn, in cells from the band's left edge, magnet nudge included, or NaN
 * when the car has no orb in play.
 * @param {Lane} lane @param {number} k @param {number} [offset]
 */
export function orbX(lane, k, offset = lane.offset) {
  const at = orbIn(lane, k);
  return at < 0 ? Number.NaN : offset + k * lane.period + at + 0.5 + (lane.nudge.get(k) ?? 0);
}

/**
 * The car with an orb in play closest to `x`. A nudged orb may have slid into the next car's
 * period, so the cars either side are checked too.
 * @param {Lane} lane @param {number} x
 * @returns {{ car: number, d: number } | null} d is `x` less the orb's position
 */
function nearestOrb(lane, x) {
  const k = Math.floor((x - lane.offset) / lane.period);
  /** @type {{ car: number, d: number } | null} */
  let best = null;
  for (let car = k - 1; car <= k + 1; car++) {
    const d = x - orbX(lane, car);
    if (Math.abs(d) < Math.abs(best?.d ?? Number.POSITIVE_INFINITY)) best = { car, d };
  }
  return best;
}

/**
 * The car whose orb, still in play, is within reach of `x`, or null.
 * @param {Lane} lane @param {number} x
 */
export function orbNear(lane, x) {
  const near = nearestOrb(lane, x);
  return near && Math.abs(near.d) < ORB_REACH ? near.car : null;
}

/**
 * Magnet: slide the orb nearest `x` up to `step` cells toward it. Mutates `lane`.
 * @param {Lane} lane @param {number} x @param {number} step
 * @returns {number | null} the car whose orb arrived this step, or null
 */
export function pullOrb(lane, x, step) {
  const near = nearestOrb(lane, x);
  if (!near) return null;
  const move = Math.max(-step, Math.min(step, near.d));
  lane.nudge.set(near.car, (lane.nudge.get(near.car) ?? 0) + move);
  return Math.abs(near.d) <= step ? near.car : null;
}
