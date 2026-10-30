// @ts-check
// Renders a world onto the host canvas. Reads the world, never changes it.
//
// Benjo stands on the ring's outside edge with his head pointing out, facing the way he runs.
// The target and the bug sit just inside the ring, each over a band on the ring itself: the hit
// window in the glow color, a bug's reach in the hazard color. The pins left are big in the
// middle. alpha blends Benjo between the last two steps.

import { angleAt, hitHalf, place } from './ring.js';
import {
  BAND_W,
  BENJO_DRAW,
  BUG_HALF,
  BUG_SIZE,
  FLASH_EVERY,
  POP_GROW,
  POP_T,
  RING_R,
  RING_W,
  SHAKE_PX,
  SHAKE_T,
  TARGET_SIZE,
} from './tuning.js';
import { blendS } from './world.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./world.js').World} World */
/** @typedef {{ rotate?: number, alpha?: number, flipX?: boolean }} SpriteOpts */

const TAU = Math.PI * 2;
const FONT = "'B404 Mono', monospace";
/** The pins left are this tall, as a share of the ring's radius, and the lock label this much of that. */
const PINS_SIZE = 0.55;
const LABEL_SIZE = 0.28;
/** Targets and bugs sit this far inside the ring's line, middle to middle. */
const INSET = RING_W / 2 + TARGET_SIZE / 2 + 2;

// Reused objects: the host reads options synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const opts = { rotate: 0, alpha: 1, flipX: false };
const at = { x: 0, y: 0, a: 0 };

/** Is the ring lit in an opened lock's flourish? Steady with reduced motion. @param {World} w */
const lit = (w) => w.openT > 0 && (w.reducedMotion || Math.floor(w.openT / FLASH_EVERY) % 2 === 0);

/** The ring's line. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawRing(ctx, palette, w) {
  ctx.strokeStyle = lit(w) ? palette.accent : palette.muted;
  ctx.lineWidth = RING_W * w.unit;
  ctx.beginPath();
  ctx.arc(w.cx, w.cy, RING_R * w.unit, 0, TAU);
  ctx.stroke();
}

/**
 * A band on the ring from `half` before `s` to `half` after it.
 * @param {CanvasRenderingContext2D} ctx @param {World} w @param {number} s @param {number} half @param {string} color
 */
function drawBand(ctx, w, s, half, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = BAND_W * w.unit;
  ctx.beginPath();
  ctx.arc(w.cx, w.cy, RING_R * w.unit, angleAt(s - half), angleAt(s + half));
  ctx.stroke();
}

/**
 * The target over its hit window, and the bug over its reach.
 * @param {HostContext} host @param {World} w
 */
function drawMarks(host, w) {
  const { ctx } = host;
  const { palette, sprites } = host.theme;
  if (w.target.active) {
    drawBand(ctx, w, w.target.s, hitHalf(w.wide), palette.glow);
    if (sprites.pickups.length) {
      place(w, w.target.s, RING_R - INSET, at);
      opts.rotate = at.a;
      const sprite = sprites.pickups[w.target.sprite % sprites.pickups.length];
      host.drawSprite(sprite, at.x, at.y, TARGET_SIZE * w.unit, opts);
    }
  }
  if (w.bug.active) {
    drawBand(ctx, w, w.bug.s, BUG_HALF, palette.hazard);
    if (sprites.hazards.length) {
      place(w, w.bug.s, RING_R - INSET, at);
      opts.rotate = at.a;
      const sprite = sprites.hazards[w.bug.sprite % sprites.hazards.length];
      host.drawSprite(sprite, at.x, at.y, BUG_SIZE * w.unit, opts);
    }
  }
}

/** Benjo on the ring, feet on its edge, facing the way he runs. @param {HostContext} host @param {World} w @param {number} blend */
function drawBenjo(host, w, blend) {
  place(w, blendS(w, blend), RING_R + RING_W / 2 + BENJO_DRAW / 2, at);
  opts.rotate = at.a;
  opts.flipX = w.dir < 0;
  host.drawSprite(host.theme.sprites.benjo, at.x, at.y, BENJO_DRAW * w.unit, opts);
  opts.flipX = false;
}

/** The pins this lock still needs, big in the middle, or OPEN while it opens. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawCenter(ctx, palette, w) {
  const size = PINS_SIZE * RING_R * w.unit;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(size)}px ${FONT}`;
  ctx.fillStyle = w.openT > 0 ? palette.accent : palette.ink;
  ctx.fillText(w.openT > 0 ? 'OPEN' : String(w.pins), w.cx, w.cy);
  ctx.font = `${Math.round(size * LABEL_SIZE)}px ${FONT}`;
  ctx.fillStyle = palette.muted;
  ctx.fillText(`LOCK ${w.openT > 0 ? w.lock - 1 : w.lock}`, w.cx, w.cy + size * 0.75);
}

/** Rings that grow and fade where a target popped or a bug went. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawPops(ctx, palette, w) {
  ctx.strokeStyle = palette.glow;
  ctx.lineWidth = 2;
  for (const p of w.pops) {
    if (!p.active) continue;
    const t = Math.min(1, p.t / POP_T);
    const grow = w.reducedMotion ? 0 : t * POP_GROW;
    place(w, p.s, RING_R - INSET, at);
    ctx.globalAlpha = w.reducedMotion ? 1 : 1 - t;
    ctx.beginPath();
    ctx.arc(at.x, at.y, (p.r + grow) * w.unit, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Where Benjo's middle is on the canvas, for the ghost. Shares one object. @param {World} w */
export const benjoSpot = (w) => place(w, w.s, RING_R + RING_W / 2 + BENJO_DRAW / 2, at);

/**
 * @param {HostContext} host
 * @param {World} w
 * @param {number} alpha blend between the last two steps
 */
export function drawFrame(host, w, alpha) {
  const { ctx } = host;
  const { palette } = host.theme;
  const blend = w.dead ? 1 : alpha;
  ctx.clearRect(0, 0, w.width, w.height);
  ctx.save();
  if (w.shakeT > 0 && !w.reducedMotion) {
    const k = (w.shakeT / SHAKE_T) * SHAKE_PX * w.unit;
    ctx.translate(Math.sin(w.time * 90) * k, Math.cos(w.time * 70) * k);
  }
  drawRing(ctx, palette, w);
  drawMarks(host, w);
  drawCenter(ctx, palette, w);
  drawBenjo(host, w, blend);
  drawPops(ctx, palette, w);
  opts.rotate = 0;
  ctx.restore();
}
