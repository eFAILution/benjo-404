// @ts-check
// Renders a world onto the host canvas. Reads the world, never changes it.
// `prev` and `cur` are the last two steps; alpha blends between them so motion stays smooth
// on displays faster than the 60 Hz step.

import { drawBackdrop, drawGround } from './backdrop.js';
import { drawFx } from './fx.js';
import { contentAspect, spriteBounds } from './sprite-bounds.js';
import { DUCK_SCALE, GROUND_FRAC, LAND_SQUASH, POP_T, SHAKE_PX, SHAKE_T } from './tuning.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Sprite} Sprite */
/** @typedef {import('./world.js').World} World */
/** @typedef {import('./fx.js').Fx} Fx */
/** @typedef {{ rotate?: number, alpha?: number, tint?: string }} SpriteOpts */

/** @type {[number, number]} */
const CENTER = [0.5, 0.5];
const FLASH_EVERY = 0.06;
const TILT_MAX = 0.25;
const POP_GROW = 16;

// Reused option objects: the host reads them synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const benjoOpts = { rotate: 0, alpha: 1 };
/** @type {SpriteOpts} */
const hitOpts = { rotate: 0, alpha: 1, tint: '' };
/** @type {SpriteOpts} */
const orbOpts = { alpha: 1 };

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @param {Sprite} sprite */
const aspectOf = (sprite) => sprite.viewBox[2] / sprite.viewBox[3];

/**
 * Draw a sprite so its box spans left..left+w and its bottom sits at `bottom` (screen y),
 * whatever anchor the theme gave it.
 * @param {HostContext} host @param {Sprite} sprite
 * @param {number} left @param {number} bottom @param {number} w @param {number} h
 * @param {SpriteOpts} [opts]
 */
function placeSprite(host, sprite, left, bottom, w, h, opts) {
  const anchor = sprite.anchor ?? CENTER;
  host.drawSprite(sprite, left + w * anchor[0], bottom - h + h * anchor[1], h, opts);
}

/**
 * Draw a sprite so its drawn area (not its viewBox) starts at `left`, sits on `bottom`, and is
 * `h` px tall. Hitboxes are built from the same area, so what you see is what you hit.
 * @param {HostContext} host @param {Sprite} sprite
 * @param {number} left @param {number} bottom @param {number} h
 * @param {SpriteOpts} [opts]
 */
function placeContent(host, sprite, left, bottom, h, opts) {
  const bounds = spriteBounds(sprite);
  const fullH = h / (bounds[3] - bounds[1]);
  const fullW = fullH * aspectOf(sprite);
  placeSprite(
    host,
    sprite,
    left - bounds[0] * fullW,
    bottom + (1 - bounds[3]) * fullH,
    fullW,
    fullH,
    opts,
  );
}

/** @param {HostContext} host @param {World} w @param {number} groundY @param {number} lag */
function drawObstacles(host, w, groundY, lag) {
  const sprites = host.theme.sprites.hazards;
  if (!sprites.length) return;
  for (let i = 0; i < w.obstacles.length; i++) {
    const o = w.obstacles[i];
    if (!o.active) continue;
    placeContent(host, sprites[o.sprite % sprites.length], o.x + lag, groundY - o.y, o.h);
  }
}

/** @param {HostContext} host @param {World} w @param {number} groundY @param {number} lag */
function drawOrbs(host, w, groundY, lag) {
  const sprites = host.theme.sprites.pickups;
  if (!sprites.length) return;
  for (let i = 0; i < w.orbs.length; i++) {
    const orb = w.orbs[i];
    if (!orb.active) continue;
    const sprite = sprites[orb.sprite % sprites.length];
    orbOpts.alpha = w.reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(w.time * 6 + orb.x * 0.05);
    // Fit the drawn area inside the orb's square so wide art (a bat, a candy) stays in line.
    const aspect = contentAspect(sprite);
    const tall = orb.size * Math.min(1, 1 / aspect);
    const bottom = groundY - orb.y + tall / 2;
    placeContent(host, sprite, orb.x + lag - (tall * aspect) / 2, bottom, tall, orbOpts);
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {World} w @param {string} color @param {number} groundY @param {number} lag */
function drawPops(ctx, w, color, groundY, lag) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = 0; i < w.pops.length; i++) {
    const p = w.pops[i];
    if (!p.active) continue;
    const t = Math.min(1, p.t / POP_T);
    ctx.globalAlpha = 1 - t;
    ctx.beginPath();
    ctx.arc(p.x + lag, groundY - p.y, p.size / 2 + t * POP_GROW * w.unit, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * Benjo with squash on landing, a stretch while rising, a tilt in the air, and a hit flash.
 * @param {HostContext} host @param {World} w @param {number} groundY @param {number} by
 */
function drawBenjo(host, w, groundY, by) {
  const { ctx } = host;
  const sprite = host.theme.sprites.benjo;
  const h = w.benjoH;
  let sx = 1;
  let sy = 1;
  if (w.ducking) {
    sx = 1.12;
    sy = DUCK_SCALE;
  } else if (w.landT > 0) {
    sx = 1.08;
    sy = LAND_SQUASH;
  } else if (!w.grounded && w.vy > 0) {
    sx = 0.95;
    sy = 1.06;
  }
  const still = w.reducedMotion;
  const bob = still || !w.grounded || w.dead ? 0 : Math.abs(Math.sin(w.time * 14)) * 2 * w.unit;
  const tilt = w.grounded ? 0 : clamp((-w.vy / w.jumpV) * TILT_MAX, -TILT_MAX, TILT_MAX);
  const flashOn = w.dead && (still || Math.floor(w.deadT / FLASH_EVERY) % 2 === 0);
  const opts = flashOn ? hitOpts : benjoOpts;
  opts.rotate = tilt;
  hitOpts.tint = host.theme.palette.hazard;

  ctx.save();
  ctx.translate(w.benjoX, groundY - by - bob);
  ctx.scale(sx, sy);
  const wide = h * aspectOf(sprite);
  placeSprite(host, sprite, -wide / 2, 0, wide, h, opts);
  ctx.restore();
}

/**
 * Draw one frame.
 * @param {HostContext} host
 * @param {World} prev the step before `cur`
 * @param {World} cur
 * @param {number} alpha in [0,1) from the host loop
 * @param {Fx} fx
 */
export function drawFrame(host, prev, cur, alpha, fx) {
  const { ctx } = host;
  const { palette } = host.theme;
  const groundY = Math.round(cur.height * GROUND_FRAC);
  const blend = cur.dead ? 1 : clamp(alpha, 0, 1);
  // Entities are stored where they are after `cur`; draw them shifted back toward `prev`.
  const lag = Math.max(0, cur.distance - prev.distance) * (1 - blend);
  const distance = cur.distance - lag;
  const by = prev.by + (cur.by - prev.by) * blend;

  ctx.clearRect(0, 0, host.size.width, host.size.height);
  ctx.save();
  if (cur.dead && !cur.reducedMotion && cur.deadT < SHAKE_T) {
    const amp = SHAKE_PX * (1 - cur.deadT / SHAKE_T);
    ctx.translate(Math.sin(cur.deadT * 90) * amp, Math.cos(cur.deadT * 70) * amp * 0.6);
  }
  drawBackdrop(ctx, palette, cur.width, cur.height, groundY, distance, cur.reducedMotion);
  drawGround(ctx, palette, cur.width, groundY, distance);
  drawObstacles(host, cur, groundY, lag);
  drawOrbs(host, cur, groundY, lag);
  drawPops(ctx, cur, palette.pickup, groundY, lag);
  drawFx(ctx, palette, fx, cur, groundY, distance);
  drawBenjo(host, cur, groundY, by);
  ctx.restore();
}
