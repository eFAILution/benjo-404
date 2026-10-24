// @ts-check
// Visual-only effects that live outside the world: Benjo's glow trail and landing dust.
// Typed arrays sized once, so stepping and drawing them allocates nothing.
// Under reduced motion neither runs.

import { DUST_COUNT, DUST_T, EVENT_LAND, TRAIL_COUNT, TRAIL_EVERY } from './tuning.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {import('../../contracts').Palette} Palette */

/**
 * @typedef {object} Fx
 * @property {Float64Array} trailD world distance when each trail point was dropped
 * @property {Float64Array} trailY height above the ground of each point
 * @property {number} trailHead index of the newest point
 * @property {number} trailCount
 * @property {number} tick
 * @property {Float64Array} dustX screen x
 * @property {Float64Array} dustY height above the ground
 * @property {Float64Array} dustVx
 * @property {Float64Array} dustVy
 * @property {Float64Array} dustT age; DUST_T or more means dead
 */

const DUST_VX = [-90, -45, 45, 90];
const DUST_VY = [40, 70, 70, 40];
const DUST_GRAVITY = 400;

/** @returns {Fx} */
export function createFx() {
  return {
    trailD: new Float64Array(TRAIL_COUNT),
    trailY: new Float64Array(TRAIL_COUNT),
    trailHead: 0,
    trailCount: 0,
    tick: 0,
    dustX: new Float64Array(DUST_COUNT),
    dustY: new Float64Array(DUST_COUNT),
    dustVx: new Float64Array(DUST_COUNT),
    dustVy: new Float64Array(DUST_COUNT),
    dustT: new Float64Array(DUST_COUNT).fill(DUST_T),
  };
}

/**
 * Advance the effects after a world step. Mutates `fx` only.
 * @param {Fx} fx
 * @param {World} w the world after the step
 * @param {number} dt
 */
export function stepFx(fx, w, dt) {
  if (w.reducedMotion) return;
  if (!w.dead) {
    fx.tick += 1;
    if (fx.tick % TRAIL_EVERY === 0) {
      fx.trailHead = (fx.trailHead + 1) % TRAIL_COUNT;
      fx.trailD[fx.trailHead] = w.distance;
      fx.trailY[fx.trailHead] = w.by + w.benjoH * 0.45;
      fx.trailCount = Math.min(TRAIL_COUNT, fx.trailCount + 1);
    }
  }
  const scroll = w.speed * dt;
  for (let i = 0; i < DUST_COUNT; i++) {
    if (w.events & EVENT_LAND) {
      fx.dustX[i] = w.benjoX + DUST_VX[i] * 0.12 * w.unit;
      fx.dustY[i] = 1;
      fx.dustVx[i] = DUST_VX[i] * w.unit;
      fx.dustVy[i] = DUST_VY[i] * w.unit;
      fx.dustT[i] = 0;
    }
    if (fx.dustT[i] >= DUST_T) continue;
    fx.dustT[i] += dt;
    fx.dustVy[i] -= DUST_GRAVITY * dt;
    fx.dustX[i] += fx.dustVx[i] * dt - (w.dead ? 0 : scroll);
    fx.dustY[i] = Math.max(0, fx.dustY[i] + fx.dustVy[i] * dt);
  }
}

/**
 * Draw the trail behind Benjo and any landing dust.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Palette} palette
 * @param {Fx} fx
 * @param {World} w
 * @param {number} groundY
 * @param {number} distance interpolated world distance
 */
export function drawFx(ctx, palette, fx, w, groundY, distance) {
  if (w.reducedMotion) return;
  ctx.fillStyle = palette.glow;
  const back = w.benjoX - w.benjoH * 0.3;
  for (let k = 0; k < fx.trailCount; k++) {
    const i = (fx.trailHead - k + TRAIL_COUNT) % TRAIL_COUNT;
    const size = (4 - k * 0.5) * w.unit;
    ctx.globalAlpha = 0.55 * (1 - k / TRAIL_COUNT);
    const x = back - (distance - fx.trailD[i]);
    ctx.fillRect(x - size / 2, groundY - fx.trailY[i] - size / 2, size, size);
  }
  ctx.fillStyle = palette.ink;
  for (let i = 0; i < DUST_COUNT; i++) {
    if (fx.dustT[i] >= DUST_T) continue;
    ctx.globalAlpha = 0.5 * (1 - fx.dustT[i] / DUST_T);
    ctx.fillRect(fx.dustX[i] - 1, groundY - fx.dustY[i] - 2, 2, 2);
  }
  ctx.globalAlpha = 1;
}
