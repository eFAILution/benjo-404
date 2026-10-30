// @ts-check
// Renders a world onto the host canvas. Reads the world, never changes it.
// alpha blends Benjo, the bugs, and the view between the last two steps, so motion stays
// smooth on displays faster than the 60 Hz step.

import { graceFaint } from '../../shell/blink.js';
import {
  BENJO_H,
  BRICK_H,
  BRICK_W,
  BUG_H,
  FLOOR_GAP,
  FLOOR_T,
  GRACE_ALPHA,
  GRACE_BLINK,
  ORB_H,
  TOWER_W,
} from './tuning.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./world.js').World} World */
/** @typedef {{ flipX?: boolean, rotate?: number, alpha?: number, tint?: string }} SpriteOpts */

/** Every MARK_EVERY floors is drawn in the glow color, so height reads at a glance. */
const MARK_EVERY = 10;
const WALL_ALPHA = 0.12;

// Reused option objects: the host reads them synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const benjoOpts = { flipX: false, rotate: 0, alpha: 1 };
/** @type {SpriteOpts} */
const plainOpts = {};

/** Screen x of a tower x. @param {World} w @param {number} x */
const sx = (w, x) => w.ox + x * w.k;
/** Screen y of a height, with the view's bottom at `cam`. @param {World} w @param {number} y @param {number} cam */
const sy = (w, y, cam) => w.bottom - (y - cam) * w.k;

/**
 * The tower's inside walls: a brick pattern on each side that climbs with the view.
 * @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w @param {number} cam
 */
function drawWalls(ctx, palette, w, cam) {
  const left = sx(w, 0);
  const right = sx(w, TOWER_W);
  const top = w.ceiling;
  ctx.fillStyle = palette.muted;
  ctx.globalAlpha = WALL_ALPHA;
  ctx.fillRect(left, top, right - left, w.bottom - top);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = palette.muted;
  ctx.fillRect(left - 2, top, 2, w.bottom - top);
  ctx.fillRect(right, top, 2, w.bottom - top);
  ctx.globalAlpha = WALL_ALPHA * 1.5;
  const rowH = BRICK_H * w.k;
  const brickW = BRICK_W * w.k;
  const first = Math.floor(cam / BRICK_H);
  for (let row = first; row * BRICK_H < cam + w.viewH; row++) {
    const y = Math.round(sy(w, row * BRICK_H, cam));
    ctx.fillRect(left, y, right - left, 1);
    for (let x = left + (row % 2 ? brickW / 2 : 0); x < right; x += brickW) {
      ctx.fillRect(Math.round(x), y - rowH, 1, rowH);
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Floors in view, each a slab under its top, with its bug and its orb.
 * @param {HostContext} host @param {World} w @param {number} cam @param {number} blend
 */
function drawFloors(host, w, cam, blend) {
  const { ctx } = host;
  const { palette, sprites } = host.theme;
  for (const f of w.floors) {
    const top = f.n * FLOOR_GAP;
    if (f.n < 0 || top < cam - FLOOR_GAP || top > cam + w.viewH + FLOOR_GAP) continue;
    const y = sy(w, top, cam);
    ctx.fillStyle = f.n % MARK_EVERY === 0 ? palette.glow : palette.accent;
    ctx.fillRect(sx(w, f.x), y, f.w * w.k, FLOOR_T * w.k);
    ctx.fillStyle = palette.bg;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(sx(w, f.x), y + (FLOOR_T * w.k) / 2, f.w * w.k, 1);
    ctx.globalAlpha = 1;
    if (f.orb && sprites.pickups.length) {
      const list = sprites.pickups;
      host.drawSprite(
        list[f.n % list.length],
        sx(w, f.ox),
        y - (ORB_H / 2 + 2) * w.k,
        ORB_H * w.k,
        plainOpts,
      );
    }
    if (f.bug && sprites.hazards.length) {
      const list = sprites.hazards;
      const bx = f.prevBx + (f.bx - f.prevBx) * blend;
      host.drawSprite(
        list[f.n % list.length],
        sx(w, bx),
        y - (BUG_H / 2) * w.k,
        BUG_H * w.k,
        plainOpts,
      );
    }
  }
}

/**
 * Benjo, facing the way he runs, spinning through a fast jump, and blinking through the twin's
 * grace.
 * @param {HostContext} host @param {World} w @param {number} cam @param {number} blend
 */
function drawBenjo(host, w, cam, blend) {
  const x = w.prevX + (w.x - w.prevX) * blend;
  const y = w.prevY + (w.y - w.prevY) * blend;
  benjoOpts.flipX = w.vx < 0;
  benjoOpts.rotate = w.reducedMotion ? 0 : w.spin * Math.PI * 2 * (w.vx < 0 ? -1 : 1);
  benjoOpts.alpha = graceFaint(w.graceT, GRACE_BLINK, w.reducedMotion) ? GRACE_ALPHA : 1;
  benjoOpts.tint = w.dead ? host.theme.palette.hazard : undefined;
  host.drawSprite(
    host.theme.sprites.benjo,
    sx(w, x),
    sy(w, y + BENJO_H / 2, cam),
    BENJO_H * w.k,
    benjoOpts,
  );
  benjoOpts.tint = undefined;
}

/**
 * @param {HostContext} host
 * @param {World} w
 * @param {number} alpha blend between the last two steps
 */
export function drawFrame(host, w, alpha) {
  const { ctx } = host;
  const blend = w.dead ? 1 : alpha;
  const cam = w.prevCamY + (w.camY - w.prevCamY) * blend;
  ctx.clearRect(0, 0, w.width, w.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, w.ceiling, w.width, w.bottom - w.ceiling);
  ctx.clip();
  drawWalls(ctx, host.theme.palette, w, cam);
  drawFloors(host, w, cam, blend);
  drawBenjo(host, w, cam, blend);
  ctx.restore();
}
