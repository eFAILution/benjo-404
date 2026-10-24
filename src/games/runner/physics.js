// @ts-check
// Benjo's movement and the world scroll for one step. Both mutate the world they are given,
// which stepWorld guarantees is already its own copy.

import {
  COYOTE,
  DUCK_TAP,
  EVENT_JUMP,
  EVENT_LAND,
  FAST_FALL,
  JUMP_BUFFER,
  LAND_SQUASH_T,
  POP_T,
  START_GRACE,
} from './tuning.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {import('./world.js').RunnerInput} RunnerInput */

/**
 * Benjo's jump, duck, and landing for one step. Mutates `w`, which is already a copy.
 * @param {World} w
 * @param {RunnerInput} input
 * @param {number} dt
 */
export function stepBenjo(w, input, dt) {
  const live = w.time > START_GRACE;
  w.bufferT = live && input.jumpPressed ? JUMP_BUFFER : Math.max(0, w.bufferT - dt);
  w.duckT = live && input.duckTap ? DUCK_TAP : Math.max(0, w.duckT - dt);
  w.coyoteT = w.grounded ? COYOTE : Math.max(0, w.coyoteT - dt);
  w.landT = Math.max(0, w.landT - dt);

  if (w.bufferT > 0 && (w.grounded || w.coyoteT > 0)) {
    w.vy = w.jumpV;
    w.grounded = false;
    w.rising = true;
    w.coyoteT = 0;
    w.bufferT = 0;
    w.duckT = 0;
    w.events |= EVENT_JUMP;
  }
  w.ducking = (live && input.duckHeld) || w.duckT > 0;
  if (w.grounded) return;

  if (w.rising && !input.jumpHeld && w.vy > w.jumpCutV) w.vy = w.jumpCutV;
  w.vy -= w.gravity * (w.ducking ? FAST_FALL : 1) * dt;
  w.by += w.vy * dt;
  if (w.vy <= 0) w.rising = false;
  if (w.by <= 0) {
    w.by = 0;
    w.vy = 0;
    w.grounded = true;
    w.coyoteT = COYOTE;
    w.landT = LAND_SQUASH_T;
    w.events |= EVENT_LAND;
  }
}

/**
 * Move every live entity left by the scroll and age the pickup pops.
 * @param {World} w
 * @param {number} scroll
 * @param {number} dt
 */
export function scrollAll(w, scroll, dt) {
  for (let i = 0; i < w.obstacles.length; i++) {
    const o = w.obstacles[i];
    if (!o.active) continue;
    o.x -= scroll;
    if (o.x + o.w < -w.benjoH) o.active = false;
  }
  for (let i = 0; i < w.orbs.length; i++) {
    const orb = w.orbs[i];
    if (!orb.active) continue;
    orb.x -= scroll;
    if (orb.x + orb.size < -w.benjoH) orb.active = false;
  }
  for (let i = 0; i < w.pops.length; i++) {
    const p = w.pops[i];
    if (!p.active) continue;
    p.x -= scroll;
    p.t += dt;
    if (p.t >= POP_T) p.active = false;
  }
}
