// @ts-check
// Renders a world onto the host canvas. Reads the world, never changes it.
// The board reads as lines of code with five slots; bugs rise out of the slots, clipped so
// they appear to climb out, and Benjo hovers over the last hole he whacked.

import {
  BENJO_H,
  BENJO_LIFT,
  BOB_AMP,
  BOB_RATE,
  BUG_H,
  CODE_BAR_GAP,
  CODE_BAR_H,
  FLASH_EVERY,
  ROUND_T,
  SHAKE_PX,
  SHAKE_T,
  SLOT_H,
  SLOT_W,
  STOMP_SCALE,
  TIMER_GAP,
  TIMER_H,
  WARN_T,
} from './tuning.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./world.js').World} World */
/** @typedef {{ flipX?: boolean, alpha?: number, tint?: string }} SpriteOpts */

const CODE_ALPHA = 0.18;
const OUTLINE_ALPHA = 0.3;
const TIMER_ALPHA = 0.5;
const SQUASHED_ALPHA = 0.45;
/** Shortest and longest code line, as a fraction of the cell. */
const BAR_MIN = 0.25;
const BAR_SPREAD = 0.5;

// Reused option objects: the host reads them synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const benjoOpts = { flipX: false, alpha: 1 };
/** @type {SpriteOpts} */
const hitOpts = { flipX: false, alpha: 1, tint: '' };
/** @type {SpriteOpts} */
const thingOpts = { alpha: 1 };

/** Deterministic value in [0,1) for an index. @param {number} n */
function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Rounded rectangle path, without relying on ctx.roundRect.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Slots with a code line above and below each. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawBoard(ctx, palette, w) {
  const slotW = w.cell * SLOT_W;
  const slotH = w.cell * SLOT_H;
  const barH = Math.max(1, Math.round(CODE_BAR_H * w.unit));
  const gap = w.cell * CODE_BAR_GAP;
  ctx.lineWidth = 1;
  for (let i = 0; i < w.holes.length; i++) {
    const x = Math.round(w.holeX[i] - slotW / 2);
    const y = Math.round(w.holeY[i] - slotH / 2);
    ctx.globalAlpha = CODE_ALPHA;
    ctx.fillStyle = palette.ink;
    const left = Math.round(w.holeX[i] - w.cell * 0.4);
    const above = Math.round(w.cell * (BAR_MIN + BAR_SPREAD * hash(i * 2)));
    const below = Math.round(w.cell * (BAR_MIN + BAR_SPREAD * hash(i * 2 + 1)));
    ctx.fillRect(left, Math.round(y - gap - barH), above, barH);
    ctx.fillRect(left, Math.round(y + slotH + gap), below, barH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.bg;
    roundRect(ctx, x + 0.5, y + 0.5, Math.round(slotW), Math.round(slotH), slotH / 2);
    ctx.fill();
    ctx.globalAlpha = OUTLINE_ALPHA;
    ctx.strokeStyle = palette.ink;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** The round clock, shrinking from the right. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w @param {number} time */
function drawTimer(ctx, palette, w, time) {
  const left = Math.max(0, ROUND_T - time);
  const warn = left <= WARN_T;
  ctx.globalAlpha = warn ? 1 : TIMER_ALPHA;
  ctx.fillStyle = warn ? palette.hazard : palette.ink;
  const h = Math.max(1, Math.round(TIMER_H * w.unit));
  ctx.fillRect(w.playX, w.ceiling + TIMER_GAP, Math.round((w.playW * left) / ROUND_T), h);
  ctx.globalAlpha = 1;
}

/** Bugs and decoys, each clipped to the space above its slot. @param {HostContext} host @param {World} w @param {number} alpha */
function drawThings(host, w, alpha) {
  const { ctx } = host;
  const { hazards, pickups } = host.theme.sprites;
  const h = w.cell * BUG_H;
  for (let i = 0; i < w.holes.length; i++) {
    const hole = w.holes[i];
    const list = hole.kind === 'bug' ? hazards : pickups;
    if (!hole.kind || !list.length) continue;
    const lift = hole.prevLift + (hole.lift - hole.prevLift) * alpha;
    if (lift <= 0) continue;
    const x = w.holeX[i];
    const y = w.holeY[i];
    const sprite = hole.kind === 'bug' ? list[hole.sprite % list.length] : list[0];
    thingOpts.alpha = hole.squashed ? SQUASHED_ALPHA : 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - w.cell / 2, y - w.cell, w.cell, w.cell);
    ctx.clip();
    host.drawSprite(sprite, x, y + h / 2 - lift * h, h, thingOpts);
    ctx.restore();
  }
}

/** Benjo hovers over the last hole he hit and stomps it on a whack. @param {HostContext} host @param {World} w @param {number} time */
function drawBenjo(host, w, time) {
  const i = w.lastHole;
  const stomping = w.stompT > 0;
  const bob = w.reducedMotion ? 0 : Math.sin(time * BOB_RATE) * BOB_AMP * w.unit;
  const base = w.cell * BENJO_H;
  const h = stomping && !w.reducedMotion ? base * STOMP_SCALE : base;
  const hover = Math.max(w.ceiling + base / 2, w.holeY[i] - w.cell * BENJO_LIFT + bob);
  const flashOn = w.oopsT > 0 && (w.reducedMotion || Math.floor(w.oopsT / FLASH_EVERY) % 2 === 0);
  const opts = flashOn ? hitOpts : benjoOpts;
  opts.flipX = i === 4;
  hitOpts.tint = host.theme.palette.hazard;
  host.drawSprite(host.theme.sprites.benjo, w.holeX[i], stomping ? w.holeY[i] : hover, h, opts);
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
  const time = w.prevTime + (w.time - w.prevTime) * blend;
  const stomping = w.stompT > 0;

  ctx.clearRect(0, 0, host.size.width, host.size.height);
  ctx.save();
  if (w.oopsT > 0 && !w.reducedMotion) {
    const amp = SHAKE_PX * (w.oopsT / SHAKE_T);
    ctx.translate(Math.sin(w.oopsT * 90) * amp, Math.cos(w.oopsT * 70) * amp * 0.6);
  }
  drawTimer(ctx, palette, w, time);
  drawBoard(ctx, palette, w);
  if (!stomping) drawBenjo(host, w, time);
  drawThings(host, w, blend);
  if (stomping) drawBenjo(host, w, time);
  ctx.restore();
  ctx.globalAlpha = 1;
}
