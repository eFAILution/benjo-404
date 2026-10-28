// @ts-check
// Renders a world onto the host canvas. Reads the world, never changes it.
// alpha blends the moving block, Benjo, and the camera between the last two steps.

import {
  BENJO_H,
  BENJO_LIFT,
  BOB_PX,
  BOB_RATE,
  CUT_T,
  DROP_T,
  FLASH_EVERY,
  GRACE_ALPHA,
  MAX_BLOCKS,
  SHAKE_PX,
  SHAKE_T,
  SLIDE_LIFT,
} from './tuning.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./world.js').World} World */
/** @typedef {{ flipX?: boolean, alpha?: number, tint?: string }} SpriteOpts */

const DOT_SPACING = 56;
const DOT_PARALLAX = 0.3;
const DOT_ALPHA = 0.18;
const FLOOR_ALPHA = 0.16;
const BLOCK_ALPHA = 0.85;
const ACCENT_EVERY = 4;
const VENT_ALPHA = 0.4;
const CORNER = 3;
const LED_R = 2;
const LED_GAP = 7;
const LED_PAD = 8;

// Reused option objects: the host reads them synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const benjoOpts = { flipX: false, alpha: 1 };
/** @type {SpriteOpts} */
const hitOpts = { flipX: false, alpha: 1, tint: '' };

/** Deterministic value in [0,1) for a grid cell. @param {number} n */
function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** Screen y of the top of a level. @param {World} w @param {number} level @param {number} camY */
const levelTop = (w, level, camY) => w.bottom - (level + 1) * w.blockH + camY;

/**
 * Screen y Benjo hovers at this step, without the bob. The host draws the twin and ghost there.
 * @param {World} w
 */
export const benjoY = (w) =>
  levelTop(w, w.score + 1, w.cam * w.blockH) - (SLIDE_LIFT + BENJO_LIFT) * w.blockH;

/** @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w @param {number} camY */
function drawBackdrop(ctx, palette, w, camY) {
  const offset = w.reducedMotion ? 0 : camY * DOT_PARALLAX;
  ctx.fillStyle = palette.muted;
  ctx.globalAlpha = DOT_ALPHA;
  const first = Math.floor(-offset / DOT_SPACING) - 1;
  const last = Math.ceil((w.height - offset) / DOT_SPACING);
  const cols = Math.ceil(w.width / DOT_SPACING);
  for (let row = first; row <= last; row++) {
    const y = Math.round(row * DOT_SPACING + offset);
    for (let col = 0; col <= cols; col++) {
      const n = row * 131 + col * 7;
      if (hash(n) < 0.6) continue;
      ctx.fillRect(Math.round((col + hash(n + 1)) * DOT_SPACING), y, 2, 2);
    }
  }
  const floor = Math.round(w.bottom + camY);
  if (floor < w.height) {
    ctx.fillStyle = palette.ink;
    ctx.globalAlpha = FLOOR_ALPHA;
    ctx.fillRect(0, floor, w.width, 1);
  }
  ctx.globalAlpha = 1;
}

/**
 * Trace a rounded rect path.
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} width @param {number} h @param {number} r
 */
function roundRect(ctx, x, y, width, h, r) {
  const rr = Math.min(r, width / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + width, y, x + width, y + h, rr);
  ctx.arcTo(x + width, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + width, y, rr);
  ctx.closePath();
}

/**
 * One server unit: a body, three LEDs at the left end, two vent lines.
 * @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w
 * @param {number} x @param {number} y @param {number} width @param {number} level @param {number} alpha
 */
function drawUnit(ctx, palette, w, x, y, width, level, alpha) {
  if (width <= 0 || alpha <= 0) return;
  const h = w.blockH - 1;
  const px = Math.round(x);
  const py = Math.round(y);
  const pw = Math.max(1, Math.round(width));
  roundRect(ctx, px, py, pw, h, CORNER * w.unit);
  ctx.globalAlpha = BLOCK_ALPHA * alpha;
  ctx.fillStyle = level > 0 && level % ACCENT_EVERY === 0 ? palette.accent : palette.ink;
  ctx.fill();
  const cy = py + h / 2;
  const pad = LED_PAD * w.unit;
  const gap = LED_GAP * w.unit;
  const r = LED_R * w.unit;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = palette.glow;
  for (let i = 0; i < 3 && px + pad + gap * i + r < px + pw; i++) {
    ctx.beginPath();
    ctx.arc(px + pad + gap * i, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const ventX = Math.round(px + pad * 2 + gap * 2);
  const ventW = px + pw - pad - ventX;
  if (ventW > 0) {
    ctx.globalAlpha = VENT_ALPHA * alpha;
    ctx.fillStyle = palette.bg;
    ctx.fillRect(ventX, Math.round(py + h / 3), ventW, 1);
    ctx.fillRect(ventX, Math.round(py + (h * 2) / 3), ventW, 1);
  }
  ctx.globalAlpha = 1;
}

/** The landed stack, newest block tweened down from the slide height. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w @param {number} camY */
function drawStack(ctx, palette, w, camY) {
  const fallT = w.reducedMotion ? 1 : Math.min(1, w.dropT / DROP_T);
  const from = Math.max(0, w.score - MAX_BLOCKS + 1);
  for (let level = from; level <= w.score; level++) {
    const b = w.blocks[level % MAX_BLOCKS];
    if (b.level !== level) continue;
    let y = levelTop(w, level, camY);
    if (y > w.height || y + w.blockH < 0) continue;
    if (level === w.score) y -= (1 - fallT) * SLIDE_LIFT * w.blockH;
    drawUnit(ctx, palette, w, b.x, y, b.w, level, 1);
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w @param {number} camY */
function drawCuts(ctx, palette, w, camY) {
  for (let i = 0; i < w.cuts.length; i++) {
    const c = w.cuts[i];
    if (!c.active) continue;
    const y = levelTop(w, c.level, camY) - SLIDE_LIFT * w.blockH + c.fall;
    drawUnit(ctx, palette, w, c.x, y, c.w, c.level, 1 - c.t / CUT_T);
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w @param {number} x @param {number} y */
function drawMover(ctx, palette, w, x, y) {
  drawUnit(ctx, palette, w, x, y, w.bw, w.score + 1, 1);
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w.bw) - 1, w.blockH - 2);
}

/** Benjo hovers over the block, faces the way it slides, flashes when it falls, and blinks in the twin's grace. @param {HostContext} host @param {World} w @param {number} x @param {number} moverY */
function drawBenjo(host, w, x, moverY) {
  const bob = w.reducedMotion ? 0 : Math.sin(w.time * BOB_RATE) * BOB_PX * w.unit;
  const flashOn = w.dead && (w.reducedMotion || Math.floor(w.deadT / FLASH_EVERY) % 2 === 0);
  const opts = flashOn ? hitOpts : benjoOpts;
  const blink = w.grace > 0 && (w.reducedMotion || Math.floor(w.grace / FLASH_EVERY) % 2 === 0);
  benjoOpts.alpha = blink ? GRACE_ALPHA : 1;
  opts.flipX = w.dir < 0;
  hitOpts.tint = host.theme.palette.hazard;
  const y = moverY - w.blockH * BENJO_LIFT + bob;
  host.drawSprite(host.theme.sprites.benjo, x, y, w.blockH * BENJO_H, opts);
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
  const blend = w.dead ? 1 : Math.min(1, Math.max(0, alpha));
  const camY = (w.prevCam + (w.cam - w.prevCam) * blend) * w.blockH;
  const x = w.prevX + (w.x - w.prevX) * blend;
  const benjoX = w.prevBenjoX + (w.benjoX - w.prevBenjoX) * blend;
  const moverY = levelTop(w, w.score + 1, camY) - SLIDE_LIFT * w.blockH;

  ctx.clearRect(0, 0, host.size.width, host.size.height);
  ctx.save();
  if (w.dead && !w.reducedMotion && w.deadT < SHAKE_T) {
    const amp = SHAKE_PX * (1 - w.deadT / SHAKE_T);
    ctx.translate(Math.sin(w.deadT * 90) * amp, Math.cos(w.deadT * 70) * amp * 0.6);
  }
  drawBackdrop(ctx, palette, w, camY);
  drawStack(ctx, palette, w, camY);
  drawCuts(ctx, palette, w, camY);
  if (!w.dead) drawMover(ctx, palette, w, x, moverY);
  drawBenjo(host, w, benjoX, moverY);
  ctx.restore();
  ctx.globalAlpha = 1;
}
