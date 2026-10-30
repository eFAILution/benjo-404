// @ts-check
// Renders a world onto the host canvas. Reads the world, never changes it.
// Every segment slides from the cell the one behind it held toward its own cell, so the whole
// tail glides between moves; alpha blends that slide between the last two steps.

import { graceFaint } from '../../shell/blink.js';
import {
  BORDER_ALPHA,
  DOT_ALPHA,
  DOWN,
  FLASH_EVERY,
  FOOD_H,
  FOOD_PULSE,
  FOOD_PULSE_RATE,
  GRACE_ALPHA,
  GRACE_BLINK,
  HEAD_H,
  LEFT,
  SEG_ROUND,
  SEG_SIZE,
  SEG_SIZE_SMALL,
  SHAKE_PX,
  SHAKE_T,
  TIP_ALPHA,
  UP,
} from './tuning.js';
import { centerX, centerY, headX, headY, segment } from './world.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./world.js').World} World */
/** @typedef {{ flipX?: boolean, rotate?: number, alpha?: number, tint?: string }} SpriteOpts */

// Reused option objects: the host reads them synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const benjoOpts = { flipX: false, rotate: 0, alpha: 1 };
/** @type {SpriteOpts} */
const hitOpts = { flipX: false, rotate: 0, tint: '' };
/** @type {SpriteOpts} */
const foodOpts = { alpha: 1 };

/**
 * Faint dots on every grid corner and a 1 px border around the grid.
 * @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w
 */
function drawGrid(ctx, palette, w) {
  const x0 = Math.round(w.originX);
  const y0 = Math.round(w.originY);
  const gw = w.cols * w.cell;
  const gh = w.rows * w.cell;
  ctx.fillStyle = palette.muted;
  ctx.globalAlpha = DOT_ALPHA;
  for (let row = 1; row < w.rows; row++) {
    for (let col = 1; col < w.cols; col++) ctx.fillRect(x0 + col * w.cell, y0 + row * w.cell, 1, 1);
  }
  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = BORDER_ALPHA;
  ctx.fillRect(x0, y0, gw, 1);
  ctx.fillRect(x0, y0 + gh, gw + 1, 1);
  ctx.fillRect(x0, y0, 1, gh);
  ctx.fillRect(x0 + gw, y0, 1, gh);
  ctx.globalAlpha = 1;
}

/**
 * A filled rounded square centered at x, y.
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} size
 */
function roundSquare(ctx, x, y, size) {
  const h = size / 2;
  const r = size * SEG_ROUND;
  ctx.beginPath();
  ctx.moveTo(x - h + r, y - h);
  ctx.arcTo(x + h, y - h, x + h, y + h, r);
  ctx.arcTo(x + h, y + h, x - h, y + h, r);
  ctx.arcTo(x - h, y + h, x - h, y - h, r);
  ctx.arcTo(x - h, y - h, x + h, y - h, r);
  ctx.fill();
}

/**
 * Tail from the tip to the neck, so the neck draws on top. Alpha fades toward the tip, and
 * every other scale is a little smaller.
 * @param {CanvasRenderingContext2D} ctx @param {string} color @param {World} w @param {number} p
 */
function drawTail(ctx, color, w, p) {
  ctx.fillStyle = color;
  const last = w.length - 1;
  for (let i = last; i >= 1; i--) {
    const at = segment(w, i);
    const from = i < last ? segment(w, i + 1) : -1;
    const fx = from < 0 ? w.tailFromX : w.xs[from];
    const fy = from < 0 ? w.tailFromY : w.ys[from];
    const x = centerX(w, fx + (w.xs[at] - fx) * p);
    const y = centerY(w, fy + (w.ys[at] - fy) * p);
    ctx.globalAlpha = 1 - ((1 - TIP_ALPHA) * (i - 1)) / Math.max(1, last - 1);
    roundSquare(ctx, x, y, w.cell * (i % 2 === 0 ? SEG_SIZE_SMALL : SEG_SIZE));
  }
  ctx.globalAlpha = 1;
}

/** @param {HostContext} host @param {World} w */
function drawFood(host, w) {
  const sprites = host.theme.sprites.pickups;
  if (!sprites.length || w.foodX < 0) return;
  const pulse = w.reducedMotion ? 0 : Math.sin(w.time * FOOD_PULSE_RATE);
  foodOpts.alpha = 1 - FOOD_PULSE * (0.5 + 0.5 * pulse);
  const sprite = sprites[w.foodIndex % sprites.length];
  host.drawSprite(sprite, centerX(w, w.foodX), centerY(w, w.foodY), w.cell * FOOD_H, foodOpts);
}

/**
 * Benjo faces his heading, flashes the hazard color when the run is lost, and blinks while the
 * Digital Twin's grace lasts.
 * @param {HostContext} host @param {World} w @param {number} p
 */
function drawHead(host, w, p) {
  const x = headX(w, p);
  const y = headY(w, p);
  const blink = graceFaint(w.graceT, GRACE_BLINK, w.reducedMotion);
  benjoOpts.alpha = blink ? GRACE_ALPHA : 1;
  const lost = w.dead && w.hit !== 'full';
  const flashOn = lost && (w.reducedMotion || Math.floor(w.deadT / FLASH_EVERY) % 2 === 0);
  const opts = flashOn ? hitOpts : benjoOpts;
  opts.flipX = w.dir === LEFT;
  opts.rotate = w.dir === UP ? -Math.PI / 2 : w.dir === DOWN ? Math.PI / 2 : 0;
  hitOpts.tint = host.theme.palette.hazard;
  host.drawSprite(host.theme.sprites.benjo, x, y, w.cell * HEAD_H, opts);
}

/**
 * Draw one frame.
 * @param {HostContext} host
 * @param {World} w
 * @param {number} alpha in [0,1) from the host loop
 */
export function drawFrame(host, w, alpha) {
  const { ctx } = host;
  const blend = Math.min(1, Math.max(0, alpha));
  const slide = w.prevProgress + (w.progress - w.prevProgress) * blend;
  const p = w.reducedMotion || w.dead ? 1 : slide;

  ctx.clearRect(0, 0, host.size.width, host.size.height);
  ctx.save();
  if (w.dead && w.hit !== 'full' && !w.reducedMotion && w.deadT < SHAKE_T) {
    const amp = SHAKE_PX * (1 - w.deadT / SHAKE_T);
    ctx.translate(Math.sin(w.deadT * 90) * amp, Math.cos(w.deadT * 70) * amp * 0.6);
  }
  drawGrid(ctx, host.theme.palette, w);
  drawFood(host, w);
  drawTail(ctx, host.theme.palette.accent, w, p);
  drawHead(host, w, p);
  ctx.restore();
}
