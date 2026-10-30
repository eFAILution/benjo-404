// @ts-check
// Renders a world onto the host canvas. Reads the world, never changes it.
// alpha blends Benjo and the bugs between the last two steps, so motion stays smooth on
// displays faster than the 60 Hz step.

import { graceFaint } from '../../shell/blink.js';
import { BIN_X, FILE_X, GIRDERS, girderY, LADDERS, THROWER_X, TOP } from './level.js';
import {
  BENJO_H,
  BUG_R,
  GIRDER_T,
  GRACE_ALPHA,
  GRACE_BLINK,
  LEVEL_W,
  ORB_R,
  RUNG_GAP,
  SHAKE_PX,
  SHAKE_T,
  TIME_START,
} from './tuning.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./world.js').World} World */
/** @typedef {{ flipX?: boolean, rotate?: number, alpha?: number, tint?: string }} SpriteOpts */

const TAU = Math.PI * 2;
const FILE_W = 20;
const FILE_H = 26;

// Reused option objects: the host reads them synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const benjoOpts = { flipX: false, alpha: 1 };
/** @type {SpriteOpts} */
const bugOpts = { rotate: 0 };
/** @type {SpriteOpts} */
const plainOpts = {};

/** @param {World} w @param {number} x */
const px = (w, x) => w.ox + x * w.kx;
/** @param {World} w @param {number} y */
const py = (w, y) => w.oy + y * w.ky;

/**
 * Each girder as a riveted beam under its walking line, and each ladder as two rails and rungs.
 * @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w
 */
function drawFrameworks(ctx, palette, w) {
  const t = GIRDER_T * w.ky;
  ctx.strokeStyle = palette.muted;
  ctx.lineWidth = Math.max(1, 1.5 * w.kx);
  ctx.globalAlpha = 0.8;
  for (const l of LADDERS) {
    const top = py(w, girderY(l.top, l.x));
    const bottom = py(w, girderY(l.bottom, l.x));
    ctx.beginPath();
    ctx.moveTo(px(w, l.x - 6), top);
    ctx.lineTo(px(w, l.x - 6), bottom);
    ctx.moveTo(px(w, l.x + 6), top);
    ctx.lineTo(px(w, l.x + 6), bottom);
    for (let y = top + RUNG_GAP * w.ky; y < bottom; y += RUNG_GAP * w.ky) {
      ctx.moveTo(px(w, l.x - 6), y);
      ctx.lineTo(px(w, l.x + 6), y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const g of GIRDERS) {
    const x0 = px(w, g.x0);
    const x1 = px(w, g.x1);
    const y0 = py(w, g.y0);
    const y1 = py(w, g.y1);
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1, y1 + t);
    ctx.lineTo(x0, y0 + t);
    ctx.fill();
    // A zigzag truss in the page color makes it read as a girder.
    ctx.strokeStyle = palette.bg;
    ctx.lineWidth = Math.max(1, w.kx);
    ctx.beginPath();
    const steps = Math.max(2, Math.round((g.x1 - g.x0) / 16));
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps + (i % 2 ? t - 1 : 1);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/** The code file waiting on the top platform, a page with a folded corner and lines of code. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawFile(ctx, palette, w) {
  const k = w.kx;
  const x = px(w, FILE_X) - (FILE_W * k) / 2;
  const y = py(w, girderY(TOP, FILE_X)) - FILE_H * k;
  const fold = 6 * k;
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + FILE_W * k - fold, y);
  ctx.lineTo(x + FILE_W * k, y + fold);
  ctx.lineTo(x + FILE_W * k, y + FILE_H * k);
  ctx.lineTo(x, y + FILE_H * k);
  ctx.fill();
  ctx.fillStyle = palette.accent;
  for (let i = 0; i < 4; i++) {
    const indent = i % 3 === 1 ? 4 * k : 0;
    ctx.fillRect(x + 3 * k + indent, y + (9 + i * 4) * k, (FILE_W - 8) * k - indent, 1.5 * k);
  }
}

/** The bin at the bottom left where bugs end up. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawBin(ctx, palette, w) {
  const k = w.kx;
  const floor = py(w, girderY(0, 0));
  ctx.fillStyle = palette.muted;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(px(w, 1), floor - 22 * k, (BIN_X - 2) * k, 22 * k);
  ctx.fillRect(px(w, 0), floor - 25 * k, BIN_X * k, 3 * k);
  ctx.globalAlpha = 1;
}

/** Orbs on the girders. @param {HostContext} host @param {World} w */
function drawOrbs(host, w) {
  const sprites = host.theme.sprites.pickups;
  if (!sprites.length) return;
  w.orbs.forEach((o, i) => {
    if (!o.active) return;
    const y = girderY(o.g, o.x) - ORB_R - 4;
    host.drawSprite(sprites[i % sprites.length], px(w, o.x), py(w, y), 2 * ORB_R * w.kx, plainOpts);
  });
}

/** The thrower, then each bug, spinning as it rolls. @param {HostContext} host @param {World} w @param {number} blend */
function drawBugs(host, w, blend) {
  const sprites = host.theme.sprites.hazards;
  if (!sprites.length) return;
  const lift = w.throwFlash > 0 && !w.reducedMotion ? 4 : 0;
  const top = girderY(TOP - 1, THROWER_X);
  host.drawSprite(sprites[0], px(w, THROWER_X), py(w, top - 20 - lift), 40 * w.kx, plainOpts);
  for (const b of w.bugs) {
    if (!b.active) continue;
    const x = b.prevX + (b.x - b.prevX) * blend;
    const y = b.prevY + (b.y - b.prevY) * blend;
    bugOpts.rotate = w.reducedMotion ? 0 : (x / BUG_R) * (b.state === 'ladder' ? 0 : 1);
    host.drawSprite(
      sprites[b.sprite % sprites.length],
      px(w, x),
      py(w, y),
      2 * BUG_R * w.kx,
      bugOpts,
    );
  }
}

/** Benjo, facing where he walks; on a ladder he flips side to side at each rung. @param {HostContext} host @param {World} w @param {number} blend */
function drawBenjo(host, w, blend) {
  const x = w.prevX + (w.x - w.prevX) * blend;
  const y = w.prevY + (w.y - w.prevY) * blend;
  const climbing = w.state === 'climb';
  const flip = climbing && !w.reducedMotion ? Math.floor(y / RUNG_GAP) % 2 === 0 : w.facing < 0;
  benjoOpts.flipX = flip;
  benjoOpts.alpha = graceFaint(w.graceT, GRACE_BLINK, w.reducedMotion) ? GRACE_ALPHA : 1;
  benjoOpts.tint = w.pause === 'hit' || w.dead ? host.theme.palette.hazard : undefined;
  host.drawSprite(
    host.theme.sprites.benjo,
    px(w, x),
    py(w, y - BENJO_H / 2),
    BENJO_H * w.kx,
    benjoOpts,
  );
  benjoOpts.tint = undefined;
}

/** The clock as a bar over the level, and lives as flames under it. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawGauges(ctx, palette, w) {
  const k = w.kx;
  const width = LEVEL_W * k;
  ctx.fillStyle = palette.muted;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(w.ox, w.oy - 6 * k, width, 3 * k);
  ctx.globalAlpha = 1;
  ctx.fillStyle = w.clock < 10 ? palette.hazard : palette.glow;
  ctx.fillRect(w.ox, w.oy - 6 * k, (width * w.clock) / TIME_START, 3 * k);
  ctx.fillStyle = palette.glow;
  ctx.beginPath();
  for (let i = 0; i < w.lives; i++) {
    const x = w.ox + (6 + i * 12) * k;
    const y = Math.min(w.height - 6, w.oy + (girderY(0, 0) + GIRDER_T + 6) * w.ky);
    ctx.moveTo(x + 3 * k, y);
    ctx.arc(x, y, 3 * k, 0, TAU);
  }
  ctx.fill();
}

/**
 * @param {HostContext} host
 * @param {World} w
 * @param {number} alpha blend between the last two steps
 */
export function drawFrame(host, w, alpha) {
  const { ctx } = host;
  const { palette } = host.theme;
  const blend = w.dead || w.pauseT > 0 ? 1 : alpha;
  ctx.clearRect(0, 0, w.width, w.height);
  ctx.save();
  if (w.shakeT > 0 && !w.reducedMotion) {
    const k = (w.shakeT / SHAKE_T) * SHAKE_PX;
    ctx.translate(Math.sin(w.time * 90) * k, Math.cos(w.time * 70) * k);
  }
  drawFrameworks(ctx, palette, w);
  drawBin(ctx, palette, w);
  drawFile(ctx, palette, w);
  drawOrbs(host, w);
  drawBugs(host, w, blend);
  drawBenjo(host, w, blend);
  drawGauges(ctx, palette, w);
  ctx.restore();
}
