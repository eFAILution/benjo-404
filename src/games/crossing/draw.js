// @ts-check
// Renders a Code Crossing world onto the host canvas. Reads the world, never changes it.
// alpha blends lane offsets and Benjo's hop between the last two steps.

import { graceFaint } from '../../shell/blink.js';
import { wrap } from '../../shell/wrap.js';
import { isCut, orbX } from './lanes.js';
import {
  BENJO_H,
  BLOCK_ALPHA,
  BLOCK_H,
  BLOCK_R,
  BLOCK_SPRITE_H,
  BOTTOM_PAD,
  CLOCK_LOW,
  CODE_ALPHA,
  CODE_BAR_H,
  CODE_BAR_W,
  CODE_BAR_Y,
  CODE_INSET,
  CROSS_T,
  CURB_ALPHA,
  DASH,
  DASH_GAP,
  FLASH_EVERY,
  GOAL_ROW,
  GRACE_ALPHA,
  GRACE_BLINK,
  LIFE_R,
  LIFE_SPACING,
  LINE_ALPHA,
  ORB_H,
  ROWS,
  SHAKE_PX,
  SHAKE_T,
  SIDE_PAD,
  TIMER_GAP,
  TIMER_H,
} from './tuning.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('./lanes.js').Lane} Lane */
/** @typedef {import('./world.js').World} World */
/** @typedef {{ flipX?: boolean, rotate?: number, alpha?: number, tint?: string }} SpriteOpts */

const ROTATE = { up: -Math.PI / 2, down: Math.PI / 2, left: 0, right: 0 };

// Reused option objects: the host reads them synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const benjoOpts = { flipX: false, rotate: 0, alpha: 1 };
/** @type {SpriteOpts} */
const hitOpts = { flipX: false, rotate: 0, alpha: 1, tint: '' };

/**
 * A dashed 1 px line across the band at screen y.
 * @param {CanvasRenderingContext2D} ctx @param {World} w @param {number} y
 */
function dashes(ctx, w, y) {
  const end = w.bandX + w.cols * w.cell;
  for (let x = w.bandX; x < end; x += DASH + DASH_GAP) {
    ctx.fillRect(Math.round(x), Math.round(y), Math.min(DASH, end - x), 1);
  }
}

/** Curbs, lane dividers, the timer bar, and the lives. @param {HostContext} host @param {World} w */
function drawBoard(host, w) {
  const { ctx } = host;
  const { palette } = host.theme;
  const bandW = w.cols * w.cell;
  const top = w.bandBottom - ROWS * w.cell;
  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = CURB_ALPHA;
  ctx.fillRect(w.bandX, top, bandW, w.cell);
  ctx.fillRect(w.bandX, w.bandBottom - w.cell, bandW, w.cell);
  ctx.globalAlpha = LINE_ALPHA;
  for (let row = 1; row < ROWS; row++) dashes(ctx, w, w.bandBottom - row * w.cell);
  ctx.fillRect(w.bandX, w.ceiling + TIMER_GAP, bandW, TIMER_H);

  ctx.globalAlpha = 1;
  ctx.fillStyle = w.clock < CLOCK_LOW ? palette.hazard : palette.accent;
  ctx.fillRect(w.bandX, w.ceiling + TIMER_GAP, (bandW * Math.max(0, w.clock)) / CROSS_T, TIMER_H);

  ctx.fillStyle = palette.accent;
  for (let i = 0; i < w.lives; i++) {
    ctx.beginPath();
    ctx.arc(
      SIDE_PAD + LIFE_R + i * LIFE_SPACING,
      w.height - BOTTOM_PAD / 2,
      LIFE_R,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

/**
 * One block: a rounded hazard bar with two code line cutouts and a bug on its lead cell.
 * @param {HostContext} host @param {World} w @param {Lane} lane @param {number} x0 cells @param {number} cy screen y
 */
function drawBlock(host, w, lane, x0, cy) {
  const { ctx } = host;
  const { palette } = host.theme;
  const c = w.cell;
  const h = c * BLOCK_H;
  const left = w.bandX + x0 * c;
  ctx.fillStyle = palette.hazard;
  ctx.globalAlpha = BLOCK_ALPHA;
  ctx.beginPath();
  ctx.roundRect(left, cy - h / 2, lane.len * c, h, c * BLOCK_R);
  ctx.fill();
  ctx.fillStyle = palette.bg;
  ctx.globalAlpha = CODE_ALPHA;
  for (let i = 0; i < CODE_BAR_W.length; i++) {
    const y = Math.round(cy - h / 2 + h * CODE_BAR_Y[i]);
    const bar = Math.max(1, Math.round(c * CODE_BAR_H));
    ctx.fillRect(Math.round(left + c * CODE_INSET), y, CODE_BAR_W[i] * lane.len * c, bar);
  }
  ctx.globalAlpha = 1;
  const sprites = host.theme.sprites.hazards;
  if (!sprites.length) return;
  const lead = lane.dir > 0 ? x0 + lane.len - 0.5 : x0 + 0.5;
  const sprite = sprites[lane.index % sprites.length];
  host.drawSprite(sprite, w.bandX + lead * c, cy, c * BLOCK_SPRITE_H);
}

/**
 * Every block still there and every orb on one lane, from just left of the band to its right edge.
 * @param {HostContext} host @param {World} w @param {Lane} lane @param {number} blend
 */
function drawLane(host, w, lane, blend) {
  const offset = lane.prevOffset + (lane.offset - lane.prevOffset) * blend;
  const cy = w.bandBottom - (lane.index + 0.5) * w.cell;
  const first = wrap(offset, lane.period) - lane.period;
  for (let x0 = first; x0 < w.cols; x0 += lane.period) {
    if (!isCut(lane, Math.round((x0 - offset) / lane.period))) drawBlock(host, w, lane, x0, cy);
  }
  const pickups = host.theme.sprites.pickups;
  if (!pickups.length) return;
  const sprite = pickups[lane.index % pickups.length];
  for (let x0 = first; x0 < w.cols; x0 += lane.period) {
    const x = orbX(lane, Math.round((x0 - offset) / lane.period), offset);
    if (x > 0 && x < w.cols) {
      host.drawSprite(sprite, w.bandX + x * w.cell, cy, w.cell * ORB_H);
    }
  }
}

/**
 * Benjo faces his last hop and flashes in the hazard tint while hit. He blinks while the Digital
 * Twin's grace runs (holds faint under reduced motion).
 * @param {HostContext} host @param {World} w @param {number} blend
 */
function drawBenjo(host, w, blend) {
  const snap = w.reducedMotion ? 1 : blend;
  const bx = w.reducedMotion ? w.col + 0.5 : w.prevBx + (w.bx - w.prevBx) * snap;
  const by = w.reducedMotion ? w.row + 0.5 : w.prevBy + (w.by - w.prevBy) * snap;
  const hurt = w.dead || w.hitT > 0;
  const flashOn = hurt && (w.reducedMotion || Math.floor(w.hitAge / FLASH_EVERY) % 2 === 0);
  const opts = flashOn ? hitOpts : benjoOpts;
  const faint = graceFaint(w.graceT, GRACE_BLINK, w.reducedMotion);
  opts.alpha = faint ? GRACE_ALPHA : 1;
  opts.flipX = w.facing === 'left';
  opts.rotate = ROTATE[w.facing];
  hitOpts.tint = host.theme.palette.hazard;
  const x = w.bandX + bx * w.cell;
  const y = w.bandBottom - by * w.cell;
  host.drawSprite(host.theme.sprites.benjo, x, y, w.cell * BENJO_H, opts);
}

/**
 * Draw one frame.
 * @param {HostContext} host
 * @param {World} w
 * @param {number} alpha in [0,1) from the host loop
 */
export function drawFrame(host, w, alpha) {
  const { ctx } = host;
  const frozen = w.dead || w.hitT > 0;
  const blend = frozen ? 1 : Math.min(1, Math.max(0, alpha));

  ctx.clearRect(0, 0, host.size.width, host.size.height);
  ctx.save();
  if (!w.reducedMotion && w.hitAge < SHAKE_T) {
    const amp = SHAKE_PX * (1 - w.hitAge / SHAKE_T);
    ctx.translate(Math.sin(w.hitAge * 90) * amp, Math.cos(w.hitAge * 70) * amp * 0.6);
  }
  drawBoard(host, w);
  ctx.save();
  ctx.beginPath();
  ctx.rect(w.bandX, w.bandBottom - GOAL_ROW * w.cell, w.cols * w.cell, (GOAL_ROW - 1) * w.cell);
  ctx.clip();
  for (const lane of w.lanes) drawLane(host, w, lane, blend);
  ctx.restore();
  drawBenjo(host, w, blend);
  ctx.restore();
  ctx.globalAlpha = 1;
}
