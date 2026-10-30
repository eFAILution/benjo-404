// @ts-check
// Renders a world onto the host canvas. Reads the world, never changes it.
//
// The heap is drawn in theme colors: placed blocks in the hazard color with the theme's hazard
// sprite cut out of them and a life bar that runs down, the falling block in the pickup color
// with a guide to where it lands, holes as faint cells, and the compact meter beside the heap.
// alpha blends the falling block between the last two steps.

import { cellAt, colTop, landing } from './heap.js';
import {
  COLS,
  COMPACT_CHARGE,
  LANE,
  LIFE_WARN,
  METER_GAP,
  METER_LABEL_MIN,
  METER_W,
  POP_T,
  ROWS,
  SETTLE_T,
  SHAKE_PX,
  SHAKE_T,
} from './tuning.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./world.js').World} World */

const BLOCK_ALPHA = 0.9;
const HOLE_ALPHA = 0.14;
const DOT_ALPHA = 0.25;
const WALL_ALPHA = 0.6;
const GHOST_ALPHA = 0.5;
const METER_ALPHA = 0.2;
const METER_TICKS = 4;
const LABEL_MAX = 12;
/** The label's size as a share of the meter's width. */
const LABEL_SHARE = 0.6;
const LABEL_ALPHA = 0.85;
const FONT = "'B404 Mono', monospace";
/** Gap around a block inside its cells, as a share of the cell. */
const INSET = 0.08;
const BAR_H = 0.16;
/** Sprites are cut out of blocks only when cells are at least this big, px. */
const SPRITE_MIN = 14;
const SPRITE_H = 0.6;
const WARN_BLINK = 0.125;
const DASH = [4, 4];
const SOLID = /** @type {number[]} */ ([]);

/** Reused sprite options: the host reads them synchronously, so one is enough. */
const cutOpts = { tint: '', alpha: 1 };

/** Screen y of the top of a row; rows may be fractions. @param {World} w @param {number} row */
const rowTop = (w, row) => w.floor - (row + 1) * w.cell;

/**
 * A rect over cells `x` to `x + width` on `row`, pulled in by the inset.
 * @param {CanvasRenderingContext2D} ctx @param {World} w
 * @param {number} x @param {number} row @param {number} width
 */
function cellRect(ctx, w, x, row, width) {
  const pad = Math.max(1, Math.round(w.cell * INSET));
  ctx.fillRect(
    w.left + x * w.cell + pad,
    rowTop(w, row) + pad,
    width * w.cell - 2 * pad,
    w.cell - 2 * pad,
  );
}

/** Dots at the cell corners, the walls, and the dashed top of the heap. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawWell(ctx, palette, w) {
  const right = w.left + COLS * w.cell;
  const top = rowTop(w, ROWS - 1);
  ctx.fillStyle = palette.muted;
  ctx.globalAlpha = DOT_ALPHA;
  for (let row = 1; row < ROWS; row++) {
    for (let col = 1; col < COLS; col++)
      ctx.fillRect(w.left + col * w.cell, w.floor - row * w.cell, 1, 1);
  }
  ctx.globalAlpha = WALL_ALPHA;
  ctx.strokeStyle = palette.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w.left - 0.5, rowTop(w, ROWS + LANE - 1));
  ctx.lineTo(w.left - 0.5, w.floor + 0.5);
  ctx.lineTo(right + 0.5, w.floor + 0.5);
  ctx.lineTo(right + 0.5, rowTop(w, ROWS + LANE - 1));
  ctx.stroke();
  ctx.strokeStyle = palette.accent;
  ctx.setLineDash(DASH);
  ctx.beginPath();
  ctx.moveTo(w.left, top + 0.5);
  ctx.lineTo(right, top + 0.5);
  ctx.stroke();
  ctx.setLineDash(SOLID);
  ctx.globalAlpha = 1;
}

/** Free cells under a column's top: memory nobody can reach until a compact. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawHoles(ctx, palette, w) {
  ctx.fillStyle = palette.muted;
  ctx.globalAlpha = HOLE_ALPHA;
  for (let col = 0; col < COLS; col++) {
    const top = colTop(w, col);
    for (let row = 0; row < top; row++) if (cellAt(w, col, row) < 0) cellRect(ctx, w, col, row, 1);
  }
  ctx.globalAlpha = 1;
}

/** Placed blocks, sliding down after a compact, each with its life bar. @param {HostContext} host @param {World} w */
function drawBlocks(host, w) {
  const { ctx } = host;
  const { palette } = host.theme;
  const sprites = host.theme.sprites.hazards;
  const slide = w.reducedMotion ? 0 : w.settleT / SETTLE_T;
  const pad = Math.max(1, Math.round(w.cell * INSET));
  const barH = Math.max(2, Math.round(w.cell * BAR_H));
  const blink = !w.reducedMotion && Math.floor(w.time / WARN_BLINK) % 2 === 0;
  cutOpts.tint = palette.bg;
  for (const b of w.blocks) {
    if (!b.active) continue;
    const row = b.y + (b.fromY - b.y) * slide;
    ctx.globalAlpha = BLOCK_ALPHA;
    ctx.fillStyle = palette.hazard;
    cellRect(ctx, w, b.x, row, b.w);
    const share = Math.max(0, b.life / b.maxLife);
    const warn = share < LIFE_WARN;
    ctx.globalAlpha = warn && blink ? 0.5 : 1;
    ctx.fillStyle = warn ? palette.pickup : palette.ink;
    const x = w.left + b.x * w.cell + pad * 2;
    const y = rowTop(w, row) + w.cell - pad * 2 - barH;
    ctx.fillRect(x, y, (b.w * w.cell - pad * 4) * share, barH);
    ctx.globalAlpha = 1;
    if (w.cell < SPRITE_MIN || !sprites.length) continue;
    const sprite = sprites[(b.x + b.w) % sprites.length];
    const cy = rowTop(w, row) + w.cell / 2 - barH / 2;
    host.drawSprite(sprite, w.left + (b.x + 0.5) * w.cell, cy, w.cell * SPRITE_H, cutOpts);
  }
}

/**
 * The falling block, and a faint outline where it will land: in the accent color when that is
 * above the heap, where it would overflow.
 * @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w @param {number} alpha
 */
function drawFall(ctx, palette, w, alpha) {
  const f = w.fall;
  if (!f.active) return;
  const row = w.dead ? f.y : f.prevY + (f.y - f.prevY) * alpha;
  const rest = landing(w, f.x, f.w);
  if (rest < row - 1) {
    ctx.globalAlpha = GHOST_ALPHA;
    ctx.strokeStyle = rest >= ROWS ? palette.accent : palette.pickup;
    ctx.lineWidth = 1;
    const pad = Math.max(1, Math.round(w.cell * INSET));
    const x = w.left + f.x * w.cell + pad + 0.5;
    ctx.strokeRect(
      x,
      rowTop(w, rest) + pad + 0.5,
      f.w * w.cell - 2 * pad - 1,
      w.cell - 2 * pad - 1,
    );
  }
  ctx.globalAlpha = BLOCK_ALPHA;
  ctx.fillStyle = w.dead ? palette.accent : palette.pickup;
  cellRect(ctx, w, f.x, row, f.w);
  ctx.globalAlpha = 1;
}

/** Outlines that fade where blocks freed. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawPops(ctx, palette, w) {
  ctx.strokeStyle = palette.glow;
  ctx.lineWidth = 2;
  for (const p of w.pops) {
    if (!p.active) continue;
    ctx.globalAlpha = w.reducedMotion ? 1 : 1 - p.t / POP_T;
    ctx.strokeRect(w.left + p.x * w.cell + 1, rowTop(w, p.y) + 1, p.w * w.cell - 2, w.cell - 2);
  }
  ctx.globalAlpha = 1;
}

/**
 * The compact meter beside the heap: an outlined track that fills from the floor in the glow
 * color, marked in quarters, and turns the accent color when full. On big enough cells it is
 * labelled COMPACT, or READY when full, written up its length.
 * @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w
 */
function drawMeter(ctx, palette, w) {
  const x = Math.round(w.left + (COLS + METER_GAP) * w.cell);
  const width = Math.max(3, Math.round(METER_W * w.cell));
  const height = ROWS * w.cell;
  const top = w.floor - height;
  const full = w.charge >= COMPACT_CHARGE;
  ctx.fillStyle = palette.muted;
  ctx.globalAlpha = METER_ALPHA;
  ctx.fillRect(x, top, width, height);
  ctx.globalAlpha = 1;
  ctx.fillStyle = full ? palette.accent : palette.glow;
  const filled = (height * w.charge) / COMPACT_CHARGE;
  ctx.fillRect(x, w.floor - filled, width, filled);
  ctx.fillStyle = palette.bg;
  for (let i = 1; i < METER_TICKS; i++)
    ctx.fillRect(x, Math.round(top + (height * i) / METER_TICKS), width, 1);
  ctx.strokeStyle = full ? palette.accent : palette.muted;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, top - 0.5, width + 1, height + 1);
  if (w.cell < METER_LABEL_MIN) return;
  ctx.save();
  ctx.translate(x + width / 2, top + height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = `bold ${Math.round(Math.min(LABEL_MAX, width * LABEL_SHARE))}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = full ? palette.bg : palette.ink;
  ctx.globalAlpha = full ? 1 : LABEL_ALPHA;
  ctx.fillText(full ? 'READY' : 'COMPACT', 0, 0);
  ctx.restore();
}

/**
 * @param {HostContext} host
 * @param {World} w
 * @param {number} alpha blend between the last two steps
 */
export function drawFrame(host, w, alpha) {
  const { ctx } = host;
  const { palette } = host.theme;
  ctx.clearRect(0, 0, w.width, w.height);
  ctx.save();
  if (w.shakeT > 0 && !w.reducedMotion) {
    const k = (w.shakeT / SHAKE_T) * SHAKE_PX;
    ctx.translate(Math.sin(w.time * 90) * k, Math.cos(w.time * 70) * k);
  }
  drawWell(ctx, palette, w);
  drawHoles(ctx, palette, w);
  drawBlocks(host, w);
  drawPops(ctx, palette, w);
  drawFall(ctx, palette, w, Math.min(1, Math.max(0, alpha)));
  drawMeter(ctx, palette, w);
  ctx.restore();
}
