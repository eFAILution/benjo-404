// @ts-check
// Renders a world onto the host canvas. Reads the world, never changes it.
//
// alpha blends everything between the last two steps, except a body that just wrapped to the
// other edge, which is drawn where it is. A bug near an edge is drawn again past the other edge,
// so it slides off one side and onto the other in one piece.

import { graceFaint } from '../../shell/blink.js';
import { wrap } from '../../shell/wrap.js';
import { bugR } from './belt.js';
import { COCKPIT_X, ENGINE_X, PILOT_H, SHIP } from './ship.js';
import {
  GRACE_ALPHA,
  GRACE_BLINK,
  LIFE_GAP,
  LIFE_H,
  ORB_FADE,
  ORB_H,
  POP_GROW,
  POP_T,
  SHAKE_PX,
  SHAKE_T,
  SHOT_R,
  STAR_COUNT,
} from './tuning.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('../../contracts').Sprite} Sprite */
/** @typedef {import('./world.js').World} World */
/** @typedef {import('./belt.js').Motion} Motion */
/** @typedef {{ rotate?: number, alpha?: number, tint?: string }} SpriteOpts */

const TAU = Math.PI * 2;
const ORB_BLINK = 0.15;

// Reused option objects: the host reads them synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const spinOpts = { rotate: 0, alpha: 1 };
/** @type {SpriteOpts} */
const plainOpts = { alpha: 1 };
/** A blended spot, refilled per body without allocating. */
const at = { x: 0, y: 0 };

/** Deterministic value in [0,1) for an index. @param {number} n */
function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** Where a body is between steps; a body that wrapped this step is drawn where it is. @param {World} w @param {Motion} b @param {number} blend */
function blendAt(w, b, blend) {
  const dx = b.x - b.prevX;
  const dy = b.y - b.prevY;
  const jumped = Math.abs(dx) > w.width / 2 || Math.abs(dy) > (w.bottom - w.ceiling) / 2;
  at.x = jumped ? b.x : b.prevX + dx * blend;
  at.y = jumped ? b.y : b.prevY + dy * blend;
  return at;
}

/**
 * Draw `sprite` at (x, y), and again past each edge it overlaps.
 * @param {HostContext} host @param {World} w @param {Sprite} sprite
 * @param {number} x @param {number} y @param {number} h @param {SpriteOpts} opts
 */
function drawWrapped(host, w, sprite, x, y, h, opts) {
  const r = h / 2;
  const fieldH = w.bottom - w.ceiling;
  const xs = x < r ? w.width : x > w.width - r ? -w.width : 0;
  const ys = y < w.ceiling + r ? fieldH : y > w.bottom - r ? -fieldH : 0;
  host.drawSprite(sprite, x, y, h, opts);
  if (xs) host.drawSprite(sprite, x + xs, y, h, opts);
  if (ys) host.drawSprite(sprite, x, y + ys, h, opts);
  if (xs && ys) host.drawSprite(sprite, x + xs, y + ys, h, opts);
}

/** Faint fixed stars over the field. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawStars(ctx, palette, w) {
  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < STAR_COUNT; i++) {
    const x = Math.round(hash(i) * w.width);
    const y = Math.round(w.ceiling + hash(i + 99) * (w.bottom - w.ceiling));
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** Bugs as the theme's hazard sprites, turning slowly. @param {HostContext} host @param {World} w @param {number} blend */
function drawBugs(host, w, blend) {
  const list = host.theme.sprites.hazards;
  if (!list.length) return;
  for (const b of w.bugs) {
    if (!b.active) continue;
    const p = blendAt(w, b, blend);
    spinOpts.rotate = b.prevRot + (b.rot - b.prevRot) * blend;
    drawWrapped(host, w, list[b.sprite % list.length], p.x, p.y, 2 * bugR(w, b.size), spinOpts);
  }
  spinOpts.rotate = 0;
}

/** Orbs as the theme's pickups, blinking as they run out. @param {HostContext} host @param {World} w @param {number} blend */
function drawOrbs(host, w, blend) {
  const list = host.theme.sprites.pickups;
  if (!list.length) return;
  for (const o of w.orbs) {
    if (!o.active) continue;
    const fading = o.life < ORB_FADE && Math.floor(o.life / ORB_BLINK) % 2 === 0;
    plainOpts.alpha = fading ? 0.4 : 1;
    const p = blendAt(w, o, blend);
    drawWrapped(host, w, list[o.sprite % list.length], p.x, p.y, ORB_H * w.unit, plainOpts);
  }
  plainOpts.alpha = 1;
}

/** Shots as small glowing dots. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w @param {number} blend */
function drawShots(ctx, palette, w, blend) {
  const r = SHOT_R * w.unit;
  ctx.fillStyle = palette.glow;
  ctx.beginPath();
  for (const s of w.shots) {
    if (!s.active) continue;
    const p = blendAt(w, s, blend);
    ctx.moveTo(p.x + r, p.y);
    ctx.arc(p.x, p.y, r, 0, TAU);
  }
  ctx.fill();
}

/** Rings that grow and fade where a bug or the ship popped. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawPops(ctx, palette, w) {
  ctx.strokeStyle = palette.glow;
  ctx.lineWidth = 2;
  for (const p of w.pops) {
    if (!p.active) continue;
    const t = Math.min(1, p.t / POP_T);
    const grow = w.reducedMotion ? 0 : t * POP_GROW * w.unit;
    ctx.globalAlpha = w.reducedMotion ? 1 : 1 - t;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + grow, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * The ship at its heading with Benjo in the cockpit and a flame while it thrusts. It blinks
 * through its grace.
 * @param {HostContext} host @param {World} w @param {number} blend
 */
function drawShip(host, w, blend) {
  if (!w.alive || w.dead) return;
  const { ctx } = host;
  const { palette } = host.theme;
  const p = blendAt(w, w, blend);
  const a = w.prevA + (wrap(w.a - w.prevA + Math.PI, TAU) - Math.PI) * blend;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const alpha = graceFaint(w.graceT, GRACE_BLINK, w.reducedMotion) ? GRACE_ALPHA : 1;
  if (w.thrusting) {
    const flicker = w.reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(w.time * 50);
    const back = w.shipH * ENGINE_X;
    const len = w.shipH * 0.5 * flicker;
    const side = w.shipH * 0.18;
    ctx.globalAlpha = 0.8 * alpha;
    ctx.fillStyle = palette.glow;
    ctx.beginPath();
    ctx.moveTo(p.x - cos * back - sin * side, p.y - sin * back + cos * side);
    ctx.lineTo(p.x - cos * (back + len), p.y - sin * (back + len));
    ctx.lineTo(p.x - cos * back + sin * side, p.y - sin * back - cos * side);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  spinOpts.rotate = a;
  spinOpts.alpha = alpha;
  host.drawSprite(SHIP, p.x, p.y, w.shipH, spinOpts);
  const ahead = w.shipH * COCKPIT_X;
  host.drawSprite(
    host.theme.sprites.benjo,
    p.x + cos * ahead,
    p.y + sin * ahead,
    w.shipH * PILOT_H,
    spinOpts,
  );
  spinOpts.rotate = 0;
  spinOpts.alpha = 1;
}

/** Lives left, as small ships in the bottom pad. @param {HostContext} host @param {World} w */
function drawLives(host, w) {
  const h = LIFE_H * w.unit;
  const y = (w.bottom + w.height) / 2;
  spinOpts.rotate = -Math.PI / 2;
  const spare = w.alive ? w.lives - 1 : w.lives;
  for (let i = 0; i < spare; i++) host.drawSprite(SHIP, h + i * LIFE_GAP * w.unit, y, h, spinOpts);
  spinOpts.rotate = 0;
}

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
  drawLives(host, w);
  ctx.beginPath();
  ctx.rect(0, w.ceiling, w.width, w.bottom - w.ceiling);
  ctx.clip();
  drawStars(ctx, palette, w);
  drawOrbs(host, w, blend);
  drawBugs(host, w, blend);
  drawShots(ctx, palette, w, blend);
  drawShip(host, w, blend);
  drawPops(ctx, palette, w);
  ctx.restore();
}
