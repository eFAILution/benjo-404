// @ts-check
// The ring (#104): where things sit on it, where each next target and bug goes, and the pops.
// No DOM, no host. world.js runs the step and owns Benjo.
//
// A spot on the ring is `s`, track px clockwise from the top, 0 to TRACK. Benjo runs one way,
// `dir` +1 clockwise or -1, and each pop turns him round.

import { wrap } from '../../shell/wrap.js';
import {
  ARC_MAX,
  ARC_MIN,
  BUG_CHANCE,
  BUG_FROM,
  BUG_GAP,
  BUG_HALF,
  BUG_LOCK,
  BUG_PAST,
  HIT_HALF,
  MAGNET_WIDEN,
  POP_T,
  RING_R,
} from './tuning.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {{ active: boolean, s: number, sprite: number }} Mark a target or a bug */
/** @typedef {{ active: boolean, s: number, t: number, r: number }} Pop */

/** Once around the ring, track px. */
export const TRACK = 2 * Math.PI * RING_R;
/**
 * The fairness rule for bugs: a bug's middle is always at least this far from the target's, so
 * the bug's own reach, BUG_GAP of free ring, and the hit window (widened by Load Balancer or
 * not) never meet. The whole window is always a clear tap.
 */
export const BUG_SPACE = HIT_HALF * MAGNET_WIDEN + BUG_HALF + BUG_GAP;
const START_A = -Math.PI / 2;

/** The canvas angle of a spot on the ring, 0 pointing right. @param {number} s */
export const angleAt = (s) => START_A + s / RING_R;

/** How far `b` is ahead of `a`, clockwise, 0 to TRACK. @param {number} a @param {number} b */
export const ahead = (a, b) => wrap(b - a, TRACK);

/** From `a` to `b` the short way, -TRACK/2 to TRACK/2. @param {number} a @param {number} b */
export const toward = (a, b) => wrap(b - a + TRACK / 2, TRACK) - TRACK / 2;

/** How far `b` is ahead of `a` along the way Benjo runs, 0 to TRACK. @param {World} w @param {number} a @param {number} b */
export const along = (w, a, b) => (w.dir > 0 ? ahead(a, b) : ahead(b, a));

/** A spot `d` ahead of Benjo along the way he runs. @param {World} w @param {number} d */
const spotAhead = (w, d) => wrap(w.s + w.dir * d, TRACK);

/** Half the hit window, wider while Load Balancer runs. @param {boolean} magnet */
export const hitHalf = (magnet) => HIT_HALF * (magnet ? MAGNET_WIDEN : 1);

/**
 * Where a spot on the ring is on the canvas, `r` track px out from the ring's center, and the
 * rotation that stands a sprite up on it, head out.
 * @param {World} w @param {number} s @param {number} r @param {{ x: number, y: number, a: number }} out
 */
export function place(w, s, r, out) {
  const a = angleAt(s);
  out.x = w.cx + Math.cos(a) * r * w.unit;
  out.y = w.cy + Math.sin(a) * r * w.unit;
  out.a = a + Math.PI / 2;
  return out;
}

/** A ring that grows and fades where a target popped. @param {World} w @param {number} s @param {number} r */
export function addPop(w, s, r) {
  let p = w.pops[0];
  for (const it of w.pops) {
    if (it.active) continue;
    p = it;
    break;
  }
  Object.assign(p, { active: true, s, t: 0, r });
}

/** Pops grow and fade. @param {World} w @param {number} dt */
export function stepPops(w, dt) {
  for (const p of w.pops) {
    if (!p.active) continue;
    p.t += dt;
    if (p.t >= POP_T) p.active = false;
  }
}

/**
 * From BUG_LOCK on, a bug sometimes sits between Benjo and the target, or just past the target.
 * Either way it keeps BUG_SPACE from the target, and one before it is at least BUG_FROM ahead
 * of Benjo.
 * @param {World} w @param {number} d how far ahead the target is
 */
function placeBug(w, d) {
  w.bug.active = false;
  if (w.lock < BUG_LOCK || w.random() >= BUG_CHANCE) return;
  const room = d - BUG_SPACE - BUG_FROM;
  const before = room > 0 && w.random() < 0.5;
  const at = before ? BUG_FROM + w.random() * room : d + BUG_SPACE + w.random() * BUG_PAST;
  w.spawned += 1;
  Object.assign(w.bug, { active: true, s: spotAhead(w, at), sprite: w.spawned });
}

/**
 * The next target, `d` ahead of Benjo, or a random ARC_MIN to ARC_MAX ahead, and maybe a bug.
 * @param {World} w @param {number} [d]
 */
export function placeTarget(w, d = ARC_MIN + w.random() * (ARC_MAX - ARC_MIN)) {
  w.spawned += 1;
  Object.assign(w.target, { active: true, s: spotAhead(w, d), sprite: w.spawned });
  placeBug(w, d);
}

/**
 * Garbage Collector: the bug on the ring goes.
 * @param {World} w
 * @returns {number} bugs cleared
 */
export function clearBugs(w) {
  if (!w.bug.active) return 0;
  w.bug.active = false;
  addPop(w, w.bug.s, BUG_HALF);
  return 1;
}
