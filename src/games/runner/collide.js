// @ts-check
// Hitboxes and overlap tests. Boxes use height above the ground, so `top` > `bottom`.
// Results go into caller-supplied or module scratch boxes to keep the step allocation-free.

import {
  EVENT_PICKUP,
  HAZARD_INSET_TOP,
  HAZARD_INSET_X,
  HIT_INSET,
  KIND_FLYER,
  PICKUP_GRACE,
} from './tuning.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {import('./world.js').Obstacle} Obstacle */
/** @typedef {{ left: number, right: number, bottom: number, top: number }} Box */

/** @returns {Box} */
export const makeBox = () => ({ left: 0, right: 0, bottom: 0, top: 0 });

const benjoScratch = makeBox();
const otherScratch = makeBox();

/**
 * Benjo's hitbox: the sprite square inset by HIT_INSET. Ducking halves its height.
 * @param {World} w
 * @param {Box} [box]
 * @returns {Box}
 */
export function benjoBox(w, box = makeBox()) {
  const inset = HIT_INSET * w.unit;
  const half = w.benjoH / 2;
  const full = w.benjoH - 2 * inset;
  box.left = w.benjoX - half + inset;
  box.right = w.benjoX + half - inset;
  box.bottom = w.by + inset;
  box.top = box.bottom + (w.ducking ? full / 2 : full);
  return box;
}

/**
 * A hazard's hitbox, inset a little from its sprite so near misses read as misses.
 * Flyers keep their exact bottom so the duck clearance is what the tuning says.
 * @param {{ kind: number, x: number, y: number, w: number, h: number }} o
 * @param {Box} [box]
 * @returns {Box}
 */
export function obstacleBox(o, box = makeBox()) {
  const insetX = o.w * HAZARD_INSET_X;
  box.left = o.x + insetX;
  box.right = o.x + o.w - insetX;
  box.bottom = o.y;
  box.top = o.y + o.h * (o.kind === KIND_FLYER ? 1 : 1 - HAZARD_INSET_TOP);
  return box;
}

/**
 * @param {Box} a
 * @param {Box} b
 * @param {number} [margin] extra distance that still counts as touching
 */
export function overlaps(a, b, margin = 0) {
  return (
    a.left < b.right + margin &&
    a.right > b.left - margin &&
    a.bottom < b.top + margin &&
    a.top > b.bottom - margin
  );
}

/**
 * A pickup's box: its sprite square centered on x, y.
 * @param {number} x @param {number} y @param {number} size
 * @param {Box} [box]
 * @returns {Box}
 */
export function orbBox(x, y, size, box = makeBox()) {
  const half = size / 2;
  box.left = x - half;
  box.right = x + half;
  box.bottom = y - half;
  box.top = y + half;
  return box;
}

/**
 * First inactive entry of a pool, or null when the pool is full.
 * @template {{ active: boolean }} T
 * @param {T[]} pool
 * @returns {T | null}
 */
export function freeSlot(pool) {
  for (let i = 0; i < pool.length; i++) {
    const item = pool[i];
    if (!item.active) return item;
  }
  return null;
}

/** @param {World} w */
export function hitsObstacle(w) {
  const me = benjoBox(w, benjoScratch);
  for (let i = 0; i < w.obstacles.length; i++) {
    const o = w.obstacles[i];
    if (o.active && overlaps(me, obstacleBox(o, otherScratch))) return true;
  }
  return false;
}

/**
 * Take every pickup Benjo touches and start its pop. Mutates `w`, which is already a copy.
 * @param {World} w
 */
export function collectOrbs(w) {
  const me = benjoBox(w, benjoScratch);
  const grace = PICKUP_GRACE * w.unit;
  for (let i = 0; i < w.orbs.length; i++) {
    const orb = w.orbs[i];
    if (!orb.active || !overlaps(me, orbBox(orb.x, orb.y, orb.size, otherScratch), grace)) continue;
    orb.active = false;
    w.collected += 1;
    w.events |= EVENT_PICKUP;
    const pop = freeSlot(w.pops) ?? w.pops[0];
    pop.active = true;
    pop.x = orb.x;
    pop.y = orb.y;
    pop.size = orb.size;
    pop.t = 0;
  }
}
