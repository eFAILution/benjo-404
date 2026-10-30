// @ts-check
// Renders a world onto the host canvas. Reads the world, never changes it.
//
// A point (x, y) in trench units at depth z is drawn at scale CAM / (z + CAM) toward the
// trench's center, so the trench runs to a vanishing point and gates grow as they come in.
// alpha blends the ship, the gates, and the ribs between the last two steps.

import { graceFaint } from '../../shell/blink.js';
import { COCKPIT_Y, PILOT_H, SHIP } from './ship.js';
import {
  BANK,
  BANK_MAX,
  CAM,
  FAR,
  FLASH_T,
  GRACE_ALPHA,
  GRACE_BLINK,
  GRID,
  ORB_H,
  RIB_GAP,
  SHAKE_PX,
  SHAKE_T,
  STAR_COUNT,
} from './tuning.js';
import { cellX, cellY } from './world.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./world.js').World} World */
/** @typedef {import('./world.js').Gate} Gate */
/** @typedef {{ rotate?: number, alpha?: number, tint?: string }} SpriteOpts */

const TAU = Math.PI * 2;
const CELL = 2 / GRID;
/** Gates nearer than this have flown past the camera's view. */
const NEAR = -0.6;
/** Gates fade in over this many units as they come out of the dark. */
const FADE_IN = 2.5;
const WALL_ALPHA = 0.1;
const FLOOR_ALPHA = 0.06;
const RIB_ALPHA = 0.35;
const BLOCK_ALPHA = 0.85;

// Reused option objects: the host reads them synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const shipOpts = { rotate: 0, alpha: 1 };
/** @type {SpriteOpts} */
const plainOpts = { alpha: 1 };
/** Gates in draw order, far to near; refilled each frame without allocating. @type {Gate[]} */
const order = [];

/** Deterministic value in [0,1) for an index. @param {number} n */
function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** Scale at depth z; a point behind the camera's near limit stays at that limit's scale. @param {number} z */
const scaleAt = (z) => CAM / (Math.max(z, NEAR) + CAM);
/** @param {World} w @param {number} x @param {number} s */
const sx = (w, x, s) => w.cx + x * w.halfW * s;
/** @param {World} w @param {number} y @param {number} s */
const sy = (w, y, s) => w.cy - y * w.halfH * s;

/** Faint fixed stars over the whole canvas. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
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

/**
 * The trench: two walls and a floor from the camera to FAR, the rims in the accent color, and
 * ribs that stream past at the trench's speed.
 * @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w @param {number} dist
 */
function drawTrench(ctx, palette, w, dist) {
  const n = scaleAt(NEAR);
  const f = scaleAt(FAR);
  /** @param {number} x @param {number} y0 @param {number} y1 @param {number} alpha */
  const wall = (x, y0, y1, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(sx(w, x, n), sy(w, y0, n));
    ctx.lineTo(sx(w, x, n), sy(w, y1, n));
    ctx.lineTo(sx(w, x, f), sy(w, y1, f));
    ctx.lineTo(sx(w, x, f), sy(w, y0, f));
    ctx.fill();
  };
  ctx.fillStyle = palette.muted;
  wall(-1, -1, 1, WALL_ALPHA);
  wall(1, -1, 1, WALL_ALPHA);
  ctx.globalAlpha = FLOOR_ALPHA;
  ctx.beginPath();
  ctx.moveTo(sx(w, -1, n), sy(w, -1, n));
  ctx.lineTo(sx(w, 1, n), sy(w, -1, n));
  ctx.lineTo(sx(w, 1, f), sy(w, -1, f));
  ctx.lineTo(sx(w, -1, f), sy(w, -1, f));
  ctx.fill();

  ctx.strokeStyle = palette.muted;
  ctx.lineWidth = 1;
  const shift = dist % RIB_GAP;
  for (let z = RIB_GAP - shift; z < FAR; z += RIB_GAP) {
    const s = scaleAt(z);
    ctx.globalAlpha = RIB_ALPHA * (1 - z / FAR);
    ctx.beginPath();
    ctx.moveTo(sx(w, -1, s), sy(w, 1, s));
    ctx.lineTo(sx(w, -1, s), sy(w, -1, s));
    ctx.lineTo(sx(w, 1, s), sy(w, -1, s));
    ctx.lineTo(sx(w, 1, s), sy(w, 1, s));
    ctx.stroke();
  }

  ctx.strokeStyle = palette.accent;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(sx(w, -1, n), sy(w, 1, n));
  ctx.lineTo(sx(w, -1, f), sy(w, 1, f));
  ctx.moveTo(sx(w, 1, n), sy(w, 1, n));
  ctx.lineTo(sx(w, 1, f), sy(w, 1, f));
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * One gate at its blended depth: the blocked cells as hazard panels with the theme's hazard
 * sprite on each, the orb, and the port's ring.
 * @param {HostContext} host @param {World} w @param {Gate} g @param {number} z
 */
function drawGate(host, w, g, z) {
  const { ctx } = host;
  const { palette, sprites } = host.theme;
  const s = scaleAt(z);
  const fade = Math.min(1, (FAR - z) / FADE_IN, z < 0 ? 1 + z / -NEAR : 1);
  if (fade <= 0) return;
  const cw = CELL * w.halfW * s;
  const ch = CELL * w.halfH * s;
  const inset = Math.max(1, cw * 0.04);
  for (let i = 0; i < GRID * GRID; i++) {
    if (!(g.mask & (1 << i))) continue;
    const x = sx(w, cellX(i), s);
    const y = sy(w, cellY(i), s);
    ctx.globalAlpha = BLOCK_ALPHA * fade;
    ctx.fillStyle = palette.hazard;
    ctx.fillRect(x - cw / 2 + inset, y - ch / 2 + inset, cw - 2 * inset, ch - 2 * inset);
    ctx.globalAlpha = 1;
    const list = sprites.hazards;
    if (list.length && ch > 14) {
      plainOpts.alpha = fade;
      host.drawSprite(list[(g.sprite + i) % list.length], x, y, ch * 0.55, plainOpts);
    }
  }
  if (g.port >= 0) {
    const x = sx(w, cellX(g.port), s);
    const y = sy(w, cellY(g.port), s);
    ctx.globalAlpha = fade;
    ctx.strokeStyle = palette.glow;
    ctx.lineWidth = Math.max(1, 4 * s * w.unit);
    ctx.beginPath();
    ctx.ellipse(x, y, cw * 0.42, ch * 0.42, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = palette.glow;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, cw * 0.06), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const pickups = sprites.pickups;
  if (g.orb >= 0 && pickups.length) {
    plainOpts.alpha = fade;
    const h = ORB_H * w.unit * s;
    host.drawSprite(
      pickups[g.sprite % pickups.length],
      sx(w, g.ox, s),
      sy(w, g.oy, s),
      h,
      plainOpts,
    );
  }
  plainOpts.alpha = 1;
}

/** Active gates from far to near, at their blended depths. @param {World} w @param {number} blend */
function sortGates(w, blend) {
  order.length = 0;
  for (const g of w.gates) if (g.active) order.push(g);
  /** @param {Gate} g */
  const z = (g) => g.prevZ + (g.z - g.prevZ) * blend;
  order.sort((a, b) => z(b) - z(a));
  return z;
}

/**
 * The ship, banked by its sideways speed, with Benjo in the cockpit and its engines lit. It
 * blinks through the twin's grace, and turns hazard red when it hits.
 * @param {HostContext} host @param {World} w @param {number} blend
 */
function drawShip(host, w, blend) {
  const { ctx } = host;
  const { palette } = host.theme;
  const x = sx(w, w.prevSx + (w.sx - w.prevSx) * blend, 1);
  const y = sy(w, w.prevSy + (w.sy - w.prevSy) * blend, 1);
  const vx = (w.sx - w.prevSx) * 60;
  const bank = w.reducedMotion ? 0 : Math.max(-BANK_MAX, Math.min(BANK_MAX, vx * BANK));
  const faint = graceFaint(w.graceT, GRACE_BLINK, w.reducedMotion);
  const alpha = faint ? GRACE_ALPHA : 1;
  if (!w.dead && !w.reducedMotion) {
    ctx.globalAlpha = 0.35 * alpha;
    ctx.fillStyle = palette.glow;
    const r = w.shipH * (0.18 + 0.04 * Math.sin(w.time * 40));
    ctx.beginPath();
    ctx.arc(x - w.shipW * 0.24, y + w.shipH * 0.3, r, 0, TAU);
    ctx.arc(x + w.shipW * 0.24, y + w.shipH * 0.3, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  shipOpts.rotate = bank;
  shipOpts.alpha = alpha;
  shipOpts.tint = w.dead ? palette.hazard : undefined;
  host.drawSprite(SHIP, x, y, w.shipH, shipOpts);
  shipOpts.tint = undefined;
  const lift = w.shipH * COCKPIT_Y;
  host.drawSprite(
    host.theme.sprites.benjo,
    x + Math.sin(bank) * lift,
    y - Math.cos(bank) * lift,
    w.shipH * PILOT_H,
    shipOpts,
  );
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
  drawStars(ctx, palette, w);
  drawTrench(ctx, palette, w, w.prevDist + (w.dist - w.prevDist) * blend);
  const z = sortGates(w, blend);
  // Gates ahead of the ship, then the ship, then gates it has passed, which are nearer the camera.
  for (const g of order) if (z(g) >= 0) drawGate(host, w, g, z(g));
  drawShip(host, w, blend);
  for (const g of order) if (z(g) < 0) drawGate(host, w, g, z(g));
  if (w.flashT > 0 && !w.reducedMotion) {
    ctx.globalAlpha = (w.flashT / FLASH_T) * 0.25;
    ctx.fillStyle = palette.glow;
    ctx.fillRect(0, w.ceiling, w.width, w.bottom - w.ceiling);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
