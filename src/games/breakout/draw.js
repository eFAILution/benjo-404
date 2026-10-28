// @ts-check
// Renders a world onto the host canvas. Reads the world, never changes it.
// alpha blends the paddle and the fireball between the last two steps.

import {
  BENJO_DY,
  BENJO_H,
  BLINK_EVERY,
  FLASH_EVERY,
  GRACE_ALPHA,
  LIFE_R,
  LIFE_SPACING,
  LIFE_X,
  LIFE_Y,
  POP_T,
  SHAKE_PX,
  SHAKE_T,
  TRAIL_ALPHA_HI,
  TRAIL_ALPHA_LO,
} from './tuning.js';
import { paddleWFor } from './world.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./world.js').World} World */
/** @typedef {{ flipX?: boolean, alpha?: number, tint?: string }} SpriteOpts */

const DOT_SPACING = 56;
const DOT_ALPHA = 0.18;
const WALL_ALPHA = 0.16;
const BRICK_ALPHA = 0.85;
const CORE = 0.5;
const TAU = Math.PI * 2;

// Reused option objects: the host reads them synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const benjoOpts = { flipX: false, alpha: 1 };
/** @type {SpriteOpts} */
const hitOpts = { flipX: false, tint: '' };

/** Deterministic value in [0,1) for an index. @param {number} n */
function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Faint fixed dots, then faint lines along the walls and the ceiling.
 * @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w
 */
function drawBackdrop(ctx, palette, w) {
  ctx.fillStyle = palette.glow;
  ctx.globalAlpha = DOT_ALPHA;
  for (let i = 0; i * DOT_SPACING < w.width; i++) {
    for (let row = 0; row < 3; row++) {
      if (hash(i * 3 + row) < 0.5) continue;
      const y = w.ceiling + hash(i * 7 + row * 13) * (w.bottom - w.ceiling);
      ctx.fillRect(Math.round(i * DOT_SPACING), Math.round(y), 2, 2);
    }
  }
  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = WALL_ALPHA;
  const top = Math.round(w.ceiling);
  const left = Math.round(w.left);
  const right = Math.round(w.right);
  ctx.fillRect(left, top, right - left, 1);
  ctx.fillRect(left - 1, top, 1, Math.round(w.bottom) - top);
  ctx.fillRect(right, top, 1, Math.round(w.bottom) - top);
  ctx.globalAlpha = 1;
}

/** @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawBricks(ctx, palette, w) {
  ctx.fillStyle = palette.hazard;
  ctx.globalAlpha = BRICK_ALPHA;
  for (let i = 0; i < w.rects.length; i++) {
    if (!w.alive[i]) continue;
    const r = w.rects[i];
    ctx.fillRect(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h));
  }
  // A popped brick shrinks and fades where it stood.
  for (const p of w.pops) {
    if (!p.active) continue;
    const r = w.rects[p.brick];
    const k = 1 - Math.min(1, p.t / POP_T);
    ctx.globalAlpha = BRICK_ALPHA * k;
    const pw = r.w * k;
    const ph = r.h * k;
    ctx.fillRect(r.x + (r.w - pw) / 2, r.y + (r.h - ph) / 2, pw, ph);
  }
  ctx.globalAlpha = 1;
}

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} r */
function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/**
 * The fireball: a fading trail, the glow, and a hot core.
 * @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w
 * @param {number} x @param {number} y
 */
function drawBall(ctx, palette, w, x, y) {
  ctx.fillStyle = palette.glow;
  if (!w.reducedMotion && !w.serving) {
    const n = w.trailX.length;
    for (let i = n - 1; i >= 0; i--) {
      ctx.globalAlpha = TRAIL_ALPHA_HI - ((TRAIL_ALPHA_HI - TRAIL_ALPHA_LO) * i) / (n - 1);
      dot(ctx, w.trailX[i], w.trailY[i], w.ballR);
    }
    ctx.globalAlpha = 1;
  }
  dot(ctx, x, y, w.ballR);
  ctx.fillStyle = palette.accent;
  dot(ctx, x, y, w.ballR * CORE);
}

/** Spare fireballs, bottom left. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawLives(ctx, palette, w) {
  ctx.fillStyle = palette.glow;
  for (let i = 0; i < w.lives; i++) {
    dot(ctx, w.left + LIFE_X + i * LIFE_SPACING, w.bottom - LIFE_Y, LIFE_R * w.unit);
  }
}

/**
 * Benjo hangs under the paddle, then the bar on his claws. He flashes when a ball is lost, and
 * blinks while the Digital Twin's grace lasts.
 * @param {HostContext} host @param {World} w @param {number} px
 */
function drawPaddle(host, w, px) {
  const t = w.dead ? w.deadT : w.lostT;
  const hurt = w.dead || w.losing;
  const flashOn = hurt && (w.reducedMotion || Math.floor(t / FLASH_EVERY) % 2 === 0);
  const blink = w.graceT > 0 && (w.reducedMotion || Math.floor(w.graceT / BLINK_EVERY) % 2 === 0);
  benjoOpts.alpha = blink ? GRACE_ALPHA : 1;
  const opts = flashOn ? hitOpts : benjoOpts;
  opts.flipX = w.facing < 0;
  hitOpts.tint = host.theme.palette.hazard;
  const y = w.paddleY + BENJO_DY * w.unit;
  host.drawSprite(host.theme.sprites.benjo, px, y, BENJO_H * w.unit, opts);
  const pw = paddleWFor(w);
  host.ctx.fillStyle = host.theme.palette.ink;
  host.ctx.fillRect(
    Math.round(px - pw / 2),
    Math.round(w.paddleY),
    Math.round(pw),
    Math.round(w.paddleH),
  );
}

/**
 * Draw one frame.
 * @param {HostContext} host
 * @param {World} w
 * @param {number} alpha in [0,1) from the host loop
 */
export function drawFrame(host, w, alpha) {
  const { ctx } = host;
  const { palette } = host.theme;
  const blend = w.dead || w.losing ? 1 : Math.min(1, Math.max(0, alpha));
  const px = w.prevPx + (w.px - w.prevPx) * blend;

  ctx.clearRect(0, 0, host.size.width, host.size.height);
  ctx.save();
  if (w.dead && !w.reducedMotion && w.deadT < SHAKE_T) {
    const amp = SHAKE_PX * (1 - w.deadT / SHAKE_T);
    ctx.translate(Math.sin(w.deadT * 90) * amp, Math.cos(w.deadT * 70) * amp * 0.6);
  }
  drawBackdrop(ctx, palette, w);
  drawBricks(ctx, palette, w);
  drawLives(ctx, palette, w);
  drawPaddle(host, w, px);
  if (w.serving) drawBall(ctx, palette, w, px, w.paddleY - w.ballR);
  else if (!w.losing && !w.dead) {
    drawBall(
      ctx,
      palette,
      w,
      w.prevBx + (w.bx - w.prevBx) * blend,
      w.prevBy + (w.by - w.prevBy) * blend,
    );
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
