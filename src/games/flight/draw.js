// @ts-check
// Renders a world onto the host canvas. Reads the world, never changes it.
// alpha blends Benjo's height and the scroll between the last two steps, so motion stays smooth
// on displays faster than the 60 Hz step.

import {
  BRICK_H,
  BRICK_W,
  CAP_H,
  FLASH_EVERY,
  GRACE_ALPHA,
  GRACE_BLINK,
  MAX_FALL,
  PICKUP_H,
  POP_GROW,
  POP_T,
  SHAKE_PX,
  SHAKE_T,
  TILT_DOWN,
  TILT_UP,
  TOWER_W,
} from './tuning.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./world.js').World} World */
/** @typedef {{ rotate?: number, alpha?: number, tint?: string }} SpriteOpts */

const DOT_SPACING = 56;
const DOT_PARALLAX = 0.3;
const DOT_ALPHA = 0.18;
const GROUND_ALPHA = 0.16;
const GROUND_TICK = 48;
const BRICK_ALPHA = 0.85;

// Reused option objects: the host reads them synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const benjoOpts = { rotate: 0, alpha: 1 };
/** @type {SpriteOpts} */
const hitOpts = { rotate: 0, alpha: 1, tint: '' };
/** @type {SpriteOpts} */
const orbOpts = { alpha: 1 };

/** Deterministic value in [0,1) for a column index. @param {number} n */
function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Faint HUD dots that drift at a fraction of the scroll, then the ground line with ticks.
 * @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w @param {number} scroll
 */
function drawBackdrop(ctx, palette, w, scroll) {
  const offset = w.reducedMotion ? 0 : scroll * DOT_PARALLAX;
  ctx.fillStyle = palette.glow;
  ctx.globalAlpha = DOT_ALPHA;
  const first = Math.floor(offset / DOT_SPACING) - 1;
  const last = Math.ceil((offset + w.width) / DOT_SPACING);
  for (let i = first; i <= last; i++) {
    const x = Math.round(i * DOT_SPACING - offset);
    for (let row = 0; row < 3; row++) {
      if (hash(i * 3 + row) < 0.5) continue;
      ctx.fillRect(x, Math.round(hash(i * 7 + row * 13) * (w.groundY - 24)), 2, 2);
    }
  }

  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = GROUND_ALPHA;
  ctx.fillRect(0, w.groundY, w.width, 1);
  let index = Math.floor(scroll / GROUND_TICK);
  for (let x = index * GROUND_TICK - scroll; x <= w.width; x += GROUND_TICK) {
    ctx.fillRect(Math.round(x), w.groundY + 1, 1, index % 4 === 0 ? 8 : 4);
    index += 1;
  }
  ctx.globalAlpha = 1;
}

/**
 * A column of bricks from `from` to `to` (screen y, either order), coursed from the gap edge
 * at `from` so every tower's gap reads the same.
 * @param {CanvasRenderingContext2D} ctx @param {Palette} palette
 * @param {number} x @param {number} width @param {number} from @param {number} to @param {number} unit
 */
function drawBricks(ctx, palette, x, width, from, to, unit) {
  const top = Math.min(from, to);
  const height = Math.abs(to - from);
  if (height <= 0) return;
  ctx.globalAlpha = BRICK_ALPHA;
  ctx.fillStyle = palette.hazard;
  ctx.fillRect(x, top, width, height);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.bg;
  const rowH = BRICK_H * unit;
  const brickW = BRICK_W * unit;
  const dir = to >= from ? 1 : -1;
  for (let row = 0; row * rowH < height; row++) {
    const y = from + dir * row * rowH;
    ctx.fillRect(x, Math.round(y), width, 1);
    const stagger = row % 2 === 0 ? 0 : brickW / 2;
    const rowTop = dir > 0 ? y : y - rowH;
    const h = Math.min(rowH, height - row * rowH);
    for (let bx = x + stagger; bx < x + width; bx += brickW) {
      ctx.fillRect(Math.round(bx), Math.round(dir > 0 ? rowTop : y - h), 1, Math.ceil(h));
    }
  }
}

/** @param {HostContext} host @param {World} w @param {number} scroll */
function drawTowers(host, w, scroll) {
  const { ctx } = host;
  const { palette } = host.theme;
  const sprites = host.theme.sprites.hazards;
  const width = TOWER_W * w.unit;
  const capH = CAP_H * w.unit;
  for (let i = 0; i < w.towers.length; i++) {
    const t = w.towers[i];
    if (!t.active) continue;
    const x = Math.round(t.x - scroll);
    if (x > w.width || x + width < 0) continue;
    const top = t.gapY - t.gap / 2;
    const bottom = t.gapY + t.gap / 2;
    drawBricks(ctx, palette, x, width, top, 0, w.unit);
    drawBricks(ctx, palette, x, width, bottom, w.groundY, w.unit);
    if (!sprites.length) continue;
    const sprite = sprites[t.sprite % sprites.length];
    host.drawSprite(sprite, x + width / 2, top - capH / 2, capH);
    host.drawSprite(sprite, x + width / 2, bottom + capH / 2, capH);
  }
}

/** @param {HostContext} host @param {World} w @param {number} scroll */
function drawOrbs(host, w, scroll) {
  const sprites = host.theme.sprites.pickups;
  if (!sprites.length) return;
  const h = PICKUP_H * w.unit;
  for (let i = 0; i < w.orbs.length; i++) {
    const orb = w.orbs[i];
    if (!orb.active) continue;
    orbOpts.alpha = w.reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(w.time * 6 + orb.x * 0.05);
    host.drawSprite(sprites[orb.sprite % sprites.length], orb.x - scroll, orb.y, h, orbOpts);
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {World} w @param {string} color @param {number} scroll */
function drawPops(ctx, w, color, scroll) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = 0; i < w.pops.length; i++) {
    const p = w.pops[i];
    if (!p.active) continue;
    const t = Math.min(1, p.t / POP_T);
    ctx.globalAlpha = 1 - t;
    ctx.beginPath();
    ctx.arc(p.x - scroll, p.y, (PICKUP_H / 2 + t * POP_GROW) * w.unit, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * Benjo noses up on a flap, down as he falls, and flashes when hit. He blinks while the Digital
 * Twin's grace runs (holds faint under reduced motion).
 * @param {HostContext} host @param {World} w @param {number} by
 */
function drawBenjo(host, w, by) {
  const tilt = w.ready ? 0 : w.vy < 0 ? TILT_UP : (w.vy / (MAX_FALL * w.unit)) * TILT_DOWN;
  const flashOn = w.dead && (w.reducedMotion || Math.floor(w.deadT / FLASH_EVERY) % 2 === 0);
  const opts = flashOn ? hitOpts : benjoOpts;
  const faint = w.graceT > 0 && (w.reducedMotion || Math.floor(w.graceT / GRACE_BLINK) % 2 === 0);
  opts.rotate = tilt;
  opts.alpha = faint ? GRACE_ALPHA : 1;
  hitOpts.tint = host.theme.palette.hazard;
  host.drawSprite(host.theme.sprites.benjo, w.benjoX, by, w.benjoH, opts);
}

/**
 * Draw one frame.
 * @param {HostContext} host
 * @param {World} w
 * @param {number} alpha in [0,1) from the host loop
 */
export function drawFrame(host, w, alpha) {
  const { ctx } = host;
  const blend = w.dead ? 1 : Math.min(1, Math.max(0, alpha));
  const scroll = w.prevScroll + (w.scroll - w.prevScroll) * blend;
  const by = w.prevBy + (w.by - w.prevBy) * blend;

  ctx.clearRect(0, 0, host.size.width, host.size.height);
  ctx.save();
  if (w.dead && !w.reducedMotion && w.deadT < SHAKE_T) {
    const amp = SHAKE_PX * (1 - w.deadT / SHAKE_T);
    ctx.translate(Math.sin(w.deadT * 90) * amp, Math.cos(w.deadT * 70) * amp * 0.6);
  }
  drawBackdrop(ctx, host.theme.palette, w, scroll);
  drawTowers(host, w, scroll);
  drawOrbs(host, w, scroll);
  drawPops(ctx, w, host.theme.palette.pickup, scroll);
  drawBenjo(host, w, by);
  ctx.restore();
}
