// @ts-check
// The belt (#94): the field's wrap-around, the bugs and how they split, the orbs some small bugs
// leave, and the pops. No DOM, no host. world.js runs the step and owns the ship and its shots.
//
// The field runs from x 0 to `width` and from y `ceiling` to `bottom`, and wraps on both axes:
// anything that leaves one edge comes back at the other. Distances are measured the short way
// around, so a bug just over the right edge is close to a ship at the left edge.

import { wrap } from '../../shell/wrap.js';
import {
  BUG_R,
  BUG_SCORE,
  BUG_SPIN,
  BUG_V_MAX,
  BUG_V_MIN,
  EVENT_ORB,
  EVENT_POP,
  MAGNET_REACH,
  MAGNET_V,
  ORB_CHANCE,
  ORB_DRIFT,
  ORB_H,
  ORB_LIFE,
  ORB_SCORE,
  POP_T,
  SAFE_STEP,
  SAFE_T,
  SPEEDUP_CAP,
  SPEEDUP_CAP_REDUCED,
  SPLIT,
  WAVE_MAX,
  WAVE_SPEEDUP,
  WAVE_START,
} from './tuning.js';

/** @typedef {import('./world.js').World} World */
/**
 * Anything that drifts and wraps, the ship included. `prevX`, `prevY` are the last step's spot,
 * for render(alpha).
 * @typedef {{ x: number, y: number, vx: number, vy: number, prevX: number, prevY: number }} Motion
 */
/** A pooled thing that drifts. @typedef {Motion & { active: boolean }} Body */
/** @typedef {Body & { size: number, rot: number, prevRot: number, spin: number, sprite: number }} Bug */
/** @typedef {Body & { life: number, sprite: number }} Orb */
/** @typedef {{ active: boolean, x: number, y: number, t: number, r: number }} Pop */

/** How many tries to find a spot clear of the ship before taking the last one. */
const SPOT_TRIES = 40;

/** The short way from `a` to `b` on a loop of length `n`. @param {number} a @param {number} b @param {number} n */
export const delta = (a, b, n) => wrap(b - a + n / 2, n) - n / 2;

/** Squared distance from (x, y) to a body, the short way around. @param {World} w @param {number} x @param {number} y @param {{ x: number, y: number }} b */
export function apart2(w, x, y, b) {
  const dx = delta(x, b.x, w.width);
  const dy = delta(y, b.y, w.bottom - w.ceiling);
  return dx * dx + dy * dy;
}

/** Move a body by its velocity and wrap it back into the field. @param {World} w @param {Motion} b @param {number} dt */
export function drift(w, b, dt) {
  b.prevX = b.x;
  b.prevY = b.y;
  b.x = wrap(b.x + b.vx * dt, w.width);
  b.y = w.ceiling + wrap(b.y + b.vy * dt - w.ceiling, w.bottom - w.ceiling);
}

/**
 * @template {{ active: boolean }} T
 * @param {T[]} list
 * @returns {T | null}
 */
export function free(list) {
  for (let i = 0; i < list.length; i++) if (!list[i].active) return list[i];
  return null;
}

/** Bugs move faster each wave, up to a cap that is lower with reduced motion. @param {World} w */
export const speedupFor = (w) =>
  Math.min(w.reducedMotion ? SPEEDUP_CAP_REDUCED : SPEEDUP_CAP, 1 + WAVE_SPEEDUP * (w.wave - 1));

/** Big bugs in wave `n`: one more each wave, up to WAVE_MAX. @param {number} n */
export const waveSize = (n) => Math.min(WAVE_MAX, WAVE_START + n - 1);

/** A bug's drawn radius, px. @param {World} w @param {number} size */
export const bugR = (w, size) => BUG_R[size] * w.unit;

/** Send a bug a random way at its size's speed. @param {World} w @param {Bug} b */
function aim(w, b) {
  const a = w.random() * Math.PI * 2;
  const lo = BUG_V_MIN[b.size];
  const v = (lo + w.random() * (BUG_V_MAX[b.size] - lo)) * w.unit * speedupFor(w);
  b.vx = Math.cos(a) * v;
  b.vy = Math.sin(a) * v;
}

/**
 * Start a bug of `size` at (x, y), drifting a random way.
 * @param {World} w @param {number} size @param {number} x @param {number} y
 * @returns {Bug | null} null when the pool is full
 */
function addBug(w, size, x, y) {
  const b = /** @type {Bug | null} */ (free(w.bugs));
  if (!b) return null;
  w.spawned += 1;
  Object.assign(b, { active: true, x, y, prevX: x, prevY: y, size, sprite: w.spawned });
  aim(w, b);
  b.rot = w.random() * Math.PI * 2;
  b.prevRot = b.rot;
  b.spin = w.reducedMotion ? 0 : (w.random() - 0.5) * 2 * BUG_SPIN;
  return b;
}

/**
 * Does a new bug stay clear of a still ship for its first SAFE_T seconds, wrapping included?
 * @param {World} w @param {{ x: number, y: number }} ship @param {Bug} b
 */
function clearPath(w, ship, b) {
  const fieldH = w.bottom - w.ceiling;
  const reach = w.safeR / 2 + bugR(w, b.size);
  for (let t = 0; t <= SAFE_T; t += SAFE_STEP) {
    const x = wrap(b.x + b.vx * t, w.width);
    const y = w.ceiling + wrap(b.y + b.vy * t - w.ceiling, fieldH);
    if (apart2(w, ship.x, ship.y, { x, y }) < reach * reach) return false;
  }
  return true;
}

/** Where the ship is, or comes back, for keeping new bugs away from it. @param {World} w */
const shipSpot = (w) => (w.alive ? w : { x: w.width / 2, y: (w.ceiling + w.bottom) / 2 });

/**
 * A new wave of big bugs. Each starts at least `safeR` from the ship, the short way around, and
 * heads a way that keeps it off a ship that sits still for SAFE_T seconds.
 * @param {World} w
 */
export function spawnWave(w) {
  const ship = shipSpot(w);
  const fieldH = w.bottom - w.ceiling;
  for (let n = waveSize(w.wave); n > 0; n--) {
    const b = addBug(w, 0, w.width / 2, w.ceiling);
    if (!b) return;
    for (let i = 0; i < SPOT_TRIES; i++) {
      b.x = w.random() * w.width;
      b.y = w.ceiling + w.random() * fieldH;
      aim(w, b);
      if (apart2(w, ship.x, ship.y, b) >= w.safeR * w.safeR && clearPath(w, ship, b)) break;
    }
    b.prevX = b.x;
    b.prevY = b.y;
  }
}

/** Is any bug within `safeR` of (x, y)? @param {World} w @param {number} x @param {number} y */
export function crowded(w, x, y) {
  for (const b of w.bugs) {
    if (!b.active) continue;
    const r = w.safeR + bugR(w, b.size);
    if (apart2(w, x, y, b) < r * r) return true;
  }
  return false;
}

/** A ring that grows and fades where something popped. @param {World} w @param {number} x @param {number} y @param {number} r */
export function addPop(w, x, y, r) {
  const p = free(w.pops) ?? w.pops[0];
  Object.assign(p, { active: true, x, y, t: 0, r });
}

/**
 * A small bug sometimes leaves an orb behind, drifting on a little of the bug's speed.
 * @param {World} w @param {Bug} b
 */
function dropOrb(w, b) {
  if (w.random() >= ORB_CHANCE) return;
  const o = /** @type {Orb | null} */ (free(w.orbs));
  if (!o) return;
  Object.assign(o, { active: true, x: b.x, y: b.y, prevX: b.x, prevY: b.y, life: ORB_LIFE });
  o.vx = b.vx * ORB_DRIFT;
  o.vy = b.vy * ORB_DRIFT;
  o.sprite = b.sprite;
}

/**
 * A bug pops into SPLIT of the next size down; a small one just pops. A shot scores it and may
 * free an orb; a bug that hit the ship splits for nothing.
 * @param {World} w @param {Bug} b @param {boolean} shot
 */
export function splitBug(w, b, shot) {
  // The first half takes the popped bug's slot, so read it all before adding any.
  const { size, x, y } = b;
  b.active = false;
  addPop(w, x, y, bugR(w, size));
  w.events |= EVENT_POP;
  if (shot) w.score += BUG_SCORE[size];
  if (size + 1 < BUG_R.length) {
    for (let i = 0; i < SPLIT; i++) addBug(w, size + 1, x, y);
  } else if (shot) {
    dropOrb(w, b);
  }
}

/**
 * Garbage Collector: every bug on screen pops for its score, without splitting.
 * @param {World} w
 * @returns {number} bugs cleared
 */
export function popAll(w) {
  let n = 0;
  for (const b of w.bugs) {
    if (!b.active) continue;
    b.active = false;
    addPop(w, b.x, b.y, bugR(w, b.size));
    w.score += BUG_SCORE[b.size];
    n += 1;
  }
  if (n) w.events |= EVENT_POP;
  return n;
}

/** Bugs drift and spin; pops grow and fade. @param {World} w @param {number} dt */
export function stepBelt(w, dt) {
  for (const b of w.bugs) {
    if (!b.active) continue;
    drift(w, b, dt);
    b.prevRot = b.rot;
    b.rot += b.spin * dt;
  }
  for (const p of w.pops) {
    if (!p.active) continue;
    p.t += dt;
    if (p.t >= POP_T) p.active = false;
  }
}

/**
 * Orbs drift and run out. Load Balancer slides the ones in reach toward the ship. The ship picks
 * up any it touches.
 * @param {World} w @param {number} dt @param {boolean} magnet
 */
export function stepOrbs(w, dt, magnet) {
  const fieldH = w.bottom - w.ceiling;
  const reach = MAGNET_REACH * w.unit;
  const grab = w.shipR + (ORB_H * w.unit) / 2;
  for (const o of w.orbs) {
    if (!o.active) continue;
    drift(w, o, dt);
    o.life -= dt;
    if (o.life <= 0) {
      o.active = false;
      continue;
    }
    if (!w.alive) continue;
    const dx = delta(o.x, w.x, w.width);
    const dy = delta(o.y, w.y, fieldH);
    const d = Math.hypot(dx, dy);
    if (magnet && d <= reach && d > 0) {
      const k = Math.min(1, (MAGNET_V * w.unit * dt) / d);
      o.x = wrap(o.x + dx * k, w.width);
      o.y = w.ceiling + wrap(o.y + dy * k - w.ceiling, fieldH);
    }
    if (d < grab) {
      o.active = false;
      w.score += ORB_SCORE;
      w.events |= EVENT_ORB;
    }
  }
}
