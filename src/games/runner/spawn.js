// @ts-check
// Obstacle and pickup spawning. The next obstacle is rolled one spawn ahead, so pickups can
// check it before it exists and gaps are exact edge-to-edge distances.

import { freeSlot, makeBox, obstacleBox, orbBox, overlaps } from './collide.js';
import {
  FLYER_CHANCE,
  FLYER_CLEAR,
  FLYER_H,
  FLYERS_AFTER,
  GAP_MAX_S,
  GAP_MIN_PX,
  GAP_MIN_S,
  GAP_TIGHTEN_S,
  GROUND_H_MAX,
  GROUND_H_MIN,
  HIT_INSET,
  KIND_FLYER,
  KIND_GROUND,
  KIND_TALL,
  PICKUP_ARC_MAX,
  PICKUP_ARC_MIN,
  PICKUP_BASE,
  PICKUP_CLEARANCE,
  PICKUP_COUNT_MAX,
  PICKUP_COUNT_MIN,
  PICKUP_EVERY_MAX,
  PICKUP_EVERY_MIN,
  PICKUP_FLAT_CHANCE,
  PICKUP_RETRY,
  PICKUP_SIZE,
  PICKUP_SPACING,
  SPAWN_MARGIN,
  SPEED_START,
  TALL_AFTER,
  TALL_CHANCE,
  TALL_H,
} from './tuning.js';

/** @typedef {import('./world.js').World} World */

/** @param {number} a @param {number} b @param {number} t */
const lerp = (a, b, t) => a + (b - a) * t;

const orbScratch = makeBox();
const hazardScratch = makeBox();
const pending = { kind: 0, x: 0, y: 0, w: 0, h: 0 };

/** @param {World} w */
export const spawnX = (w) => w.width + SPAWN_MARGIN * w.unit;

/**
 * Height of a flyer's bottom: just above a ducked Benjo, well inside a standing one.
 * @param {World} w
 */
export function flyerBottom(w) {
  const inset = HIT_INSET * w.unit;
  return inset + (w.benjoH - 2 * inset) / 2 + FLYER_CLEAR * w.unit;
}

/**
 * Obstacle kind for a roll in [0,1). Tall hazards after TALL_AFTER s, flyers after FLYERS_AFTER s.
 * @param {number} time
 * @param {number} roll
 */
export function pickKind(time, roll) {
  let r = roll;
  if (time >= FLYERS_AFTER) {
    if (r < FLYER_CHANCE) return KIND_FLYER;
    r = (r - FLYER_CHANCE) / (1 - FLYER_CHANCE);
  }
  if (time >= TALL_AFTER && r < TALL_CHANCE) return KIND_TALL;
  return KIND_GROUND;
}

/**
 * Edge-to-edge gap before the next obstacle: rand(0.9, 1.6) s of travel, a little less as
 * speed rises, never under GAP_MIN_PX.
 * @param {World} w
 * @param {number} roll in [0,1)
 */
export function gapPx(w, roll) {
  const start = SPEED_START * w.unit * w.pace;
  const progress = w.speedCap > start ? Math.min(1, (w.speed - start) / (w.speedCap - start)) : 1;
  const seconds = lerp(GAP_MIN_S, GAP_MAX_S, roll) - GAP_TIGHTEN_S * progress;
  // Seconds are on the unscaled clock: a slower pace keeps the same spacing a jump needs.
  return Math.max(GAP_MIN_PX, (seconds * w.speed) / w.pace);
}

/**
 * Roll the next obstacle and the scroll distance until it spawns.
 * @param {World} w
 * @param {number} carry scroll px the obstacle just spawned still needs to clear the spawn point
 */
export function rollNext(w, carry) {
  const kind = pickKind(w.time, w.random());
  const u = w.unit;
  let h = TALL_H * u;
  let y = 0;
  if (kind === KIND_GROUND) h = lerp(GROUND_H_MIN, GROUND_H_MAX, w.random()) * u;
  if (kind === KIND_FLYER) {
    h = FLYER_H * u;
    y = flyerBottom(w);
  }
  // Each kind uses the theme hazard at its own index; the pack wraps it modulo its length.
  w.nextKind = kind;
  w.nextSprite = kind;
  w.nextH = h;
  w.nextY = y;
  w.nextW = h * w.hazardAspects[kind % w.hazardAspects.length];
  w.gapLeft = carry + gapPx(w, w.random());
}

/**
 * Count down the gap and spawn the rolled obstacle once it is due. Mutates `w`.
 * @param {World} w
 * @param {number} scroll px moved this step
 */
export function spawnObstacles(w, scroll) {
  w.gapLeft -= scroll;
  if (w.gapLeft > 0) return;
  const slot = freeSlot(w.obstacles);
  if (!slot) {
    w.gapLeft = 0;
    return;
  }
  slot.active = true;
  slot.kind = w.nextKind;
  slot.sprite = w.nextSprite;
  slot.x = spawnX(w) + w.gapLeft;
  slot.y = w.nextY;
  slot.w = w.nextW;
  slot.h = w.nextH;
  rollNext(w, slot.w + w.gapLeft);
}

/**
 * Center of orb i in an arc of `count`, starting at the spawn point.
 * @param {World} w @param {number} i @param {number} count @param {number} peak
 * @param {{ x: number, y: number }} out
 */
function orbAt(w, i, count, peak, out) {
  const size = PICKUP_SIZE * w.unit;
  out.x = spawnX(w) + size / 2 + i * PICKUP_SPACING * w.unit;
  out.y = PICKUP_BASE * w.unit + peak * Math.sin((Math.PI * i) / (count - 1));
  return out;
}

const point = { x: 0, y: 0 };

/**
 * True when no orb of the arc comes near a live obstacle or the one rolled next.
 * Obstacles after that are at least GAP_MIN_PX away, farther than an arc is long.
 * @param {World} w @param {number} count @param {number} peak
 */
export function arcFits(w, count, peak) {
  const size = PICKUP_SIZE * w.unit;
  const margin = PICKUP_CLEARANCE * w.unit;
  pending.kind = w.nextKind;
  pending.x = spawnX(w) + Math.max(0, w.gapLeft);
  pending.y = w.nextY;
  pending.w = w.nextW;
  pending.h = w.nextH;
  for (let i = 0; i < count; i++) {
    orbAt(w, i, count, peak, point);
    const box = orbBox(point.x, point.y, size, orbScratch);
    if (overlaps(box, obstacleBox(pending, hazardScratch), margin)) return false;
    for (let j = 0; j < w.obstacles.length; j++) {
      const o = w.obstacles[j];
      if (o.active && overlaps(box, obstacleBox(o, hazardScratch), margin)) return false;
    }
  }
  return true;
}

/** @param {World} w */
function freeOrbs(w) {
  let free = 0;
  for (let i = 0; i < w.orbs.length; i++) {
    const orb = w.orbs[i];
    if (!orb.active) free += 1;
  }
  return free;
}

/**
 * Every 3 to 6 seconds, place a line of 3 to 5 orbs, flat or in a jump arc. If the arc would
 * touch a hazard, try again shortly. Mutates `w`.
 * @param {World} w
 * @param {number} dt
 */
export function spawnPickups(w, dt) {
  w.pickupT -= dt;
  if (w.pickupT > 0) return;
  const span = PICKUP_COUNT_MAX - PICKUP_COUNT_MIN + 1;
  const count = PICKUP_COUNT_MIN + Math.floor(w.random() * span);
  const peak =
    w.random() < PICKUP_FLAT_CHANCE ? 0 : lerp(PICKUP_ARC_MIN, PICKUP_ARC_MAX, w.random()) * w.unit;
  if (freeOrbs(w) < count || !arcFits(w, count, peak)) {
    w.pickupT = PICKUP_RETRY;
    return;
  }
  for (let i = 0; i < count; i++) {
    const orb = freeSlot(w.orbs);
    if (!orb) break;
    orbAt(w, i, count, peak, point);
    orb.active = true;
    orb.sprite = w.arcs;
    orb.x = point.x;
    orb.y = point.y;
    orb.size = PICKUP_SIZE * w.unit;
  }
  w.arcs += 1;
  w.pickupT = lerp(PICKUP_EVERY_MIN, PICKUP_EVERY_MAX, w.random());
}
