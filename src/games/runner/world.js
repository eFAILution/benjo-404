// @ts-check
// Benjo Run world state. No DOM, no canvas: everything here runs on Node.
//
// Purity versus allocation: stepWorld never mutates the world it is given. With no `out` it
// returns a fresh copy (what tests use). With `out` it writes the next state into that spare
// world and returns it, so the game double-buffers two worlds and a step allocates nothing.
// The previous buffer doubles as the interpolation source for render(alpha).
// `random` is the host's seeded generator, so a step is deterministic for a given seed.
// Power-ups come in through `powers`: the magnet flag and the Digital Twin's absorb(), which the
// step calls at the moment a hit would kill Benjo.

import { collectOrbs, freeSlot, hitsObstacle } from './collide.js';
import { pullOrbs, scrollAll, stepBenjo } from './physics.js';
import { rollNext, spawnObstacles, spawnPickups } from './spawn.js';
import {
  ASPECT_MAX,
  ASPECT_MIN,
  BENJO_H,
  BENJO_H_SMALL,
  BENJO_X_FRAC,
  COYOTE,
  EVENT_HIT,
  FIRST_GAP_S,
  GRACE_T,
  GRAVITY,
  JUMP_CUT_V,
  JUMP_V,
  MIN_HEIGHT,
  MIN_WIDTH,
  OBSTACLE_POOL,
  PACE_MIN,
  PACE_REF_WIDTH,
  PICKUP_FIRST,
  PICKUP_POOL,
  PICKUP_SCORE,
  POP_POOL,
  SCORE_DIVISOR,
  SMALL_WIDTH,
  SPEED_CAP,
  SPEED_CAP_REDUCED,
  SPEED_START,
  SPEED_STEP,
  SPEED_STEP_EVERY,
} from './tuning.js';

/**
 * @typedef {{ active: boolean, kind: number, sprite: number, x: number, y: number, w: number, h: number }} Obstacle
 *   x is the left edge in canvas px; y is the bottom edge as height above the ground.
 * @typedef {{ active: boolean, sprite: number, x: number, y: number, size: number }} Orb
 *   x and y are the center; y is height above the ground.
 * @typedef {{ active: boolean, x: number, y: number, size: number, t: number }} Pop
 * @typedef {{ jumpPressed: boolean, jumpHeld: boolean, duckHeld: boolean, duckTap: boolean }} RunnerInput
 * @typedef {{ width: number, height: number }} WorldSize
 * @typedef {{ reducedMotion?: boolean, hazardAspects?: number[], immortal?: boolean }} WorldOptions
 *   immortal turns off hazard collisions; tests use it to simulate long runs.
 * @typedef {{ magnet?: boolean, absorb?: () => boolean }} Powers
 *   magnet pulls pickups in this step; absorb() is true when the Digital Twin takes a hit.
 */

/**
 * @typedef {object} World
 * @property {() => number} random
 * @property {number[]} hazardAspects width/height of each hazard sprite, clamped
 * @property {boolean} reducedMotion
 * @property {boolean} immortal
 * @property {number} width
 * @property {number} height
 * @property {number} unit length scale: 1, or 40/48 on narrow screens
 * @property {number} pace time scale on narrow screens: speeds times pace, gravity times pace²,
 *   so jumps keep their shape against obstacles while the whole run plays a little slower
 * @property {number} gravity
 * @property {number} jumpV jump impulse, upward
 * @property {number} jumpCutV upward speed a released jump is capped to
 * @property {number} benjoX center x of Benjo
 * @property {number} benjoH
 * @property {number} speedCap
 * @property {number} time seconds since start, frozen at death
 * @property {number} speed
 * @property {number} distance px scrolled
 * @property {number} score
 * @property {number} collected pickups taken
 * @property {number} by Benjo's bottom as height above the ground
 * @property {number} vy upward velocity
 * @property {boolean} grounded
 * @property {boolean} ducking
 * @property {boolean} rising true while a jump can still be cut short
 * @property {number} duckT
 * @property {number} coyoteT
 * @property {number} bufferT
 * @property {number} landT
 * @property {number} gapLeft scroll px until the next obstacle spawns
 * @property {number} nextKind
 * @property {number} nextSprite
 * @property {number} nextY
 * @property {number} nextW
 * @property {number} nextH
 * @property {number} pickupT seconds until the next pickup arc
 * @property {number} arcs pickup arcs spawned so far
 * @property {boolean} dead
 * @property {number} deadT
 * @property {number} graceT seconds left in which hazards pass through Benjo (Digital Twin)
 * @property {number} events EVENT_* bits raised by the last step
 * @property {Obstacle[]} obstacles fixed-size pool
 * @property {Orb[]} orbs fixed-size pool
 * @property {Pop[]} pops fixed-size pool
 */

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @param {WorldSize} size */
export function layoutOf(size) {
  const width = Math.max(size.width || 0, MIN_WIDTH);
  const height = Math.max(size.height || 0, MIN_HEIGHT);
  return { width, height, benjoX: Math.round(width * BENJO_X_FRAC) };
}

/**
 * Scroll speed at a time. Steps up every SPEED_STEP_EVERY seconds.
 * @param {number} time @param {number} cap already scaled @param {number} scale unit * pace
 */
export function speedAt(time, cap, scale) {
  return Math.min(cap, (SPEED_START + SPEED_STEP * Math.floor(time / SPEED_STEP_EVERY)) * scale);
}

/** @param {World} world */
export function scoreOf(world) {
  const distanceScore = Math.floor(world.distance / (SCORE_DIVISOR * world.unit * world.pace));
  return distanceScore + PICKUP_SCORE * world.collected;
}

/**
 * @param {WorldSize} size
 * @param {() => number} random
 * @param {WorldOptions} [options]
 * @returns {World}
 */
export function createWorld(size, random, options = {}) {
  const { width, height, benjoX } = layoutOf(size);
  const unit = width < SMALL_WIDTH ? BENJO_H_SMALL / BENJO_H : 1;
  const pace = clamp(width / PACE_REF_WIDTH, PACE_MIN, 1);
  const reducedMotion = Boolean(options.reducedMotion);
  const aspects = options.hazardAspects?.length ? options.hazardAspects : [1];
  /** @type {World} */
  const world = {
    random,
    hazardAspects: aspects.map((a) => clamp(a || 1, ASPECT_MIN, ASPECT_MAX)),
    reducedMotion,
    immortal: Boolean(options.immortal),
    width,
    height,
    unit,
    pace,
    gravity: GRAVITY * unit * pace * pace,
    jumpV: JUMP_V * unit * pace,
    jumpCutV: JUMP_CUT_V * unit * pace,
    benjoX,
    benjoH: BENJO_H * unit,
    speedCap: (reducedMotion ? SPEED_CAP_REDUCED : SPEED_CAP) * unit * pace,
    time: 0,
    speed: SPEED_START * unit * pace,
    distance: 0,
    score: 0,
    collected: 0,
    by: 0,
    vy: 0,
    grounded: true,
    ducking: false,
    rising: false,
    duckT: 0,
    coyoteT: COYOTE,
    bufferT: 0,
    landT: 0,
    gapLeft: 0,
    nextKind: 0,
    nextSprite: 0,
    nextY: 0,
    nextW: 0,
    nextH: 0,
    pickupT: PICKUP_FIRST,
    arcs: 0,
    dead: false,
    deadT: 0,
    graceT: 0,
    events: 0,
    obstacles: Array.from({ length: OBSTACLE_POOL }, () => ({
      active: false,
      kind: 0,
      sprite: 0,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    })),
    orbs: Array.from({ length: PICKUP_POOL }, () => ({
      active: false,
      sprite: 0,
      x: 0,
      y: 0,
      size: 0,
    })),
    pops: Array.from({ length: POP_POOL }, () => ({ active: false, x: 0, y: 0, size: 0, t: 0 })),
  };
  rollNext(world, 0);
  world.gapLeft = (FIRST_GAP_S * world.speed) / pace;
  return world;
}

/**
 * Deep copy with fresh pools. Allocates; used outside the hot loop.
 * @param {World} world
 * @returns {World}
 */
export function cloneWorld(world) {
  return {
    ...world,
    obstacles: world.obstacles.map((o) => ({ ...o })),
    orbs: world.orbs.map((o) => ({ ...o })),
    pops: world.pops.map((p) => ({ ...p })),
  };
}

/**
 * Copy src into dst without allocating. dst keeps its own pools.
 * @param {World} src
 * @param {World} dst
 * @returns {World}
 */
export function copyWorld(src, dst) {
  const { obstacles, orbs, pops } = dst;
  Object.assign(dst, src);
  dst.obstacles = obstacles;
  dst.orbs = orbs;
  dst.pops = pops;
  for (let i = 0; i < obstacles.length; i++) Object.assign(obstacles[i], src.obstacles[i]);
  for (let i = 0; i < orbs.length; i++) Object.assign(orbs[i], src.orbs[i]);
  for (let i = 0; i < pops.length; i++) Object.assign(pops[i], src.pops[i]);
  return dst;
}

/**
 * A copy of the world laid out for a new canvas size. Physics scale stays fixed for the run.
 * @param {World} world
 * @param {WorldSize} size
 * @returns {World}
 */
export function resizeWorld(world, size) {
  return { ...cloneWorld(world), ...layoutOf(size) };
}

/**
 * Garbage Collector: remove every hazard on screen, each with a pop. Mutates `w`.
 * @param {World} w
 * @returns {number} how many were removed
 */
export function clearObstacles(w) {
  let cleared = 0;
  for (let i = 0; i < w.obstacles.length; i++) {
    const o = w.obstacles[i];
    if (!o.active || o.x >= w.width) continue;
    o.active = false;
    cleared += 1;
    const pop = freeSlot(w.pops);
    if (!pop) continue;
    pop.active = true;
    pop.x = o.x + o.w / 2;
    pop.y = o.y + o.h / 2;
    pop.size = o.h;
    pop.t = 0;
  }
  return cleared;
}

/**
 * Advance the world by one fixed step.
 * @param {World} world the current state; never mutated
 * @param {RunnerInput} input
 * @param {number} dt seconds, 1/60 from the host
 * @param {World} [out] spare world to write into; omit to get a fresh copy
 * @param {Powers} [powers]
 * @returns {World}
 */
export function stepWorld(world, input, dt, out, powers) {
  const next = out ? copyWorld(world, out) : cloneWorld(world);
  next.events = 0;
  if (next.dead) {
    next.deadT += dt;
    scrollAll(next, 0, dt);
    return next;
  }
  next.time += dt;
  next.speed = speedAt(next.time, next.speedCap, next.unit * next.pace);
  const scroll = next.speed * dt;
  next.distance += scroll;
  stepBenjo(next, input, dt);
  scrollAll(next, scroll, dt);
  spawnObstacles(next, scroll);
  spawnPickups(next, dt);
  if (powers?.magnet) pullOrbs(next, dt);
  collectOrbs(next);
  next.graceT = Math.max(0, next.graceT - dt);
  if (!next.immortal && next.graceT === 0 && hitsObstacle(next)) {
    if (powers?.absorb?.()) next.graceT = GRACE_T;
    else {
      next.dead = true;
      next.events |= EVENT_HIT;
    }
  }
  next.score = scoreOf(next);
  return next;
}
