// @ts-check
// Renders a world onto the host canvas. Reads the world, never changes it.
// alpha blends Benjo, the formation, and every shot between the last two steps, so motion
// stays smooth on displays faster than the 60 Hz step.

import { bugX, bugY } from './formation.js';
import {
  BITE_H,
  BITE_W,
  BOB_AMP,
  BOB_RATE,
  BOLT_H,
  BOLT_W,
  FLAME_GAP,
  FLAME_R,
  FLASH_EVERY,
  HIT_T,
  POP_GROW,
  POP_T,
  SHAKE_PX,
  SHAKE_T,
} from './tuning.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./world.js').World} World */
/** @typedef {import('./world.js').Shot} Shot */
/** @typedef {{ rotate?: number, alpha?: number, tint?: string }} SpriteOpts */

const DOT_SPACING = 56;
const DOT_ALPHA = 0.18;
const LINE_ALPHA = 0.16;
const CORE_FRAC = 0.4;
const NOSE_UP = -Math.PI / 2;
const TAU = Math.PI * 2;

// Reused option objects: the host reads them synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const benjoOpts = { rotate: NOSE_UP, alpha: 1 };
/** @type {SpriteOpts} */
const hitOpts = { rotate: NOSE_UP, alpha: 1, tint: '' };

/** Deterministic value in [0,1) for a grid cell. @param {number} n */
function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** Seconds into the current hit flash, or -1 when Benjo is not hurt. @param {World} w */
const hurtT = (w) => (w.dead ? w.deadT : w.hitT > 0 ? HIT_T - w.hitT : -1);

/** Faint fixed dots, then the floor line under Benjo. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawBackdrop(ctx, palette, w) {
  ctx.fillStyle = palette.muted;
  ctx.globalAlpha = DOT_ALPHA;
  for (let i = 0; i * DOT_SPACING < w.width; i++) {
    for (let j = 0; j * DOT_SPACING < w.bottom; j++) {
      const n = i * 97 + j;
      if (hash(n) < 0.6) continue;
      const x = Math.round((i + hash(n + 0.5)) * DOT_SPACING);
      ctx.fillRect(x, Math.round((j + hash(n + 0.25)) * DOT_SPACING), 2, 2);
    }
  }
  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = LINE_ALPHA;
  ctx.fillRect(w.left, Math.round(w.bottom), w.right - w.left, 1);
  ctx.globalAlpha = 1;
}

/** @param {HostContext} host @param {World} w @param {number} blend */
function drawBugs(host, w, blend) {
  const sprites = host.theme.sprites.hazards;
  if (!sprites.length || w.alive === 0) return;
  const dx = (w.originX - w.prevOriginX) * (blend - 1);
  const dy = (w.originY - w.prevOriginY) * (blend - 1);
  const bob = w.reducedMotion ? 0 : BOB_AMP * w.unit;
  for (const b of w.bugs) {
    if (!b.alive) continue;
    const y = bugY(w, b) + dy + bob * Math.sin(w.time * BOB_RATE + b.col + b.row);
    host.drawSprite(sprites[b.row % sprites.length], bugX(w, b) + dx, y, w.bugH);
  }
}

/**
 * Bolts and bites are filled ellipses at their blended height.
 * @param {CanvasRenderingContext2D} ctx @param {Shot[]} list @param {string} color
 * @param {number} rx @param {number} ry @param {number} blend
 */
function drawShots(ctx, list, color, rx, ry, blend) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const s of list) {
    if (!s.active) continue;
    const y = s.prevY + (s.y - s.prevY) * blend;
    ctx.moveTo(s.x + rx, y);
    ctx.ellipse(s.x, y, rx, ry, 0, 0, TAU);
  }
  ctx.fill();
}

/** Rings where bugs popped; with reduced motion they hold their size. @param {CanvasRenderingContext2D} ctx @param {World} w @param {string} color */
function drawPops(ctx, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (const p of w.pops) {
    if (!p.active) continue;
    const t = Math.min(1, p.t / POP_T);
    ctx.globalAlpha = w.reducedMotion ? 1 : 1 - t;
    const grow = w.reducedMotion ? 1 : t;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (w.bugH / 2 + grow * POP_GROW * w.unit) * 0.8, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Lives as small flames in the bottom pad. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawLives(ctx, palette, w) {
  const r = FLAME_R * w.unit;
  const y = (w.bottom + w.height) / 2;
  ctx.fillStyle = palette.glow;
  ctx.beginPath();
  for (let i = 0; i < w.lives; i++) {
    const x = w.left + r + i * FLAME_GAP * w.unit;
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fill();
}

/** Benjo noses up and flashes the hazard color while hurt. @param {HostContext} host @param {World} w @param {number} blend */
function drawBenjo(host, w, blend) {
  const t = hurtT(w);
  const flashOn = t >= 0 && (w.reducedMotion || Math.floor(t / FLASH_EVERY) % 2 === 0);
  hitOpts.tint = host.theme.palette.hazard;
  const x = w.prevBx + (w.bx - w.prevBx) * blend;
  host.drawSprite(host.theme.sprites.benjo, x, w.benjoY, w.benjoH, flashOn ? hitOpts : benjoOpts);
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
  const blend = Math.min(1, Math.max(0, alpha));
  const t = hurtT(w);

  ctx.clearRect(0, 0, host.size.width, host.size.height);
  ctx.save();
  if (t >= 0 && t < SHAKE_T && !w.reducedMotion) {
    const amp = SHAKE_PX * (1 - t / SHAKE_T);
    ctx.translate(Math.sin(t * 90) * amp, Math.cos(t * 70) * amp * 0.6);
  }
  drawBackdrop(ctx, palette, w);
  drawBugs(host, w, blend);
  const u = w.unit;
  drawShots(ctx, w.bites, palette.hazard, (BITE_W * u) / 2, (BITE_H * u) / 2, blend);
  drawShots(ctx, w.bolts, palette.glow, (BOLT_W * u) / 2, (BOLT_H * u) / 2, blend);
  drawShots(ctx, w.bolts, palette.accent, (BOLT_W * u * CORE_FRAC) / 2, (BOLT_H * u) / 4, blend);
  drawPops(ctx, w, palette.glow);
  drawBenjo(host, w, blend);
  drawLives(ctx, palette, w);
  ctx.restore();
}
