// @ts-check
// Renders a world onto the host canvas. Reads the world, never changes it.
// alpha blends the clock, the bob, and each tile's turn between the last two steps.

import { endCell } from './board.js';
import {
  ARM_FRAC,
  BOB_AMP,
  BOB_RATE,
  CLOCK_CAP,
  CLOCK_LOW,
  CURSOR_W,
  FLAME_BACK,
  FLAME_HALF,
  FLAME_TIP,
  FLASH_EVERY,
  HOME_DIM,
  PULSE_AMP,
  PULSE_RATE,
  ROT_T,
  SHAKE_PX,
  SHAKE_T,
  SIDE_OFFSET,
  SPRITE_FRAC,
  TILE_ALPHA,
  TILE_INSET,
  TILE_RADIUS,
  TRACK_ALPHA,
} from './tuning.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./world.js').World} World */
/** @typedef {{ alpha?: number, tint?: string }} SpriteOpts */

/** Screen angle of each arm bit, in mask bit order N, E, S, W. */
const ARM_ANGLES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

// Reused option objects: the host reads them synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const benjoOpts = { alpha: 1 };
/** @type {SpriteOpts} */
const hitOpts = { alpha: 1, tint: '' };
/** @type {SpriteOpts} */
const homeOpts = { alpha: 1 };

/** @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w @param {number} clock */
function drawBar(ctx, palette, w, clock) {
  ctx.globalAlpha = TRACK_ALPHA;
  ctx.fillStyle = palette.ink;
  ctx.fillRect(w.barX, w.barY, w.barW, w.barH);
  ctx.globalAlpha = 1;
  ctx.fillStyle = clock < CLOCK_LOW ? palette.hazard : palette.accent;
  ctx.fillRect(w.barX, w.barY, Math.round((w.barW * clock) / CLOCK_CAP), w.barH);
}

/** Faint rounded squares, one per tile. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawCells(ctx, palette, w) {
  const { cols, rows } = w.board;
  const size = w.tile - TILE_INSET;
  ctx.globalAlpha = TILE_ALPHA;
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  for (let cell = 0; cell < cols * rows; cell++) {
    const x = w.boardLeft + (cell % cols) * w.tile + TILE_INSET / 2;
    const y = w.boardTop + Math.floor(cell / cols) * w.tile + TILE_INSET / 2;
    if (ctx.roundRect) ctx.roundRect(x, y, size, size, TILE_RADIUS * w.unit);
    else ctx.rect(x, y, size, size);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * Each tile's arms as lines from its center to its edges, turned back by the tween angle.
 * @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w @param {number} alpha
 */
function drawArms(ctx, palette, w, alpha) {
  const b = w.board;
  const half = w.tile / 2;
  ctx.lineWidth = w.tile * ARM_FRAC;
  ctx.lineCap = 'round';
  for (let cell = 0; cell < b.cols * b.rows; cell++) {
    const left = w.prevRot[cell] + (w.rot[cell] - w.prevRot[cell]) * alpha;
    const turn = left > 0 ? (-Math.PI / 2) * (left / ROT_T) : 0;
    const cx = w.boardLeft + (cell % b.cols) * w.tile + half;
    const cy = w.boardTop + Math.floor(cell / b.cols) * w.tile + half;
    ctx.strokeStyle = b.lit[cell] ? palette.glow : palette.muted;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      if (!(b.mask[cell] & (1 << i))) continue;
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(ARM_ANGLES[i] + turn) * half,
        cy + Math.sin(ARM_ANGLES[i] + turn) * half,
      );
    }
    ctx.stroke();
  }
}

/** @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawCursor(ctx, palette, w) {
  const { cols } = w.board;
  const x = w.boardLeft + (w.cursor % cols) * w.tile;
  const y = w.boardTop + Math.floor(w.cursor / cols) * w.tile;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = CURSOR_W;
  ctx.strokeRect(x + CURSOR_W / 2, y + CURSOR_W / 2, w.tile - CURSOR_W, w.tile - CURSOR_W);
}

/**
 * Benjo left of the start tile with a small flame feeding the link, flashing when time is up.
 * @param {HostContext} host @param {World} w @param {number} time
 */
function drawBenjo(host, w, time) {
  const { ctx } = host;
  const cy = w.boardTop + (w.board.startRow + 0.5) * w.tile;
  const bob = w.reducedMotion || w.dead ? 0 : Math.sin(time * BOB_RATE) * BOB_AMP * w.unit;
  ctx.fillStyle = host.theme.palette.glow;
  ctx.beginPath();
  ctx.moveTo(w.boardLeft - w.tile * FLAME_BACK, cy - w.tile * FLAME_HALF);
  ctx.lineTo(w.boardLeft + w.tile * FLAME_TIP, cy);
  ctx.lineTo(w.boardLeft - w.tile * FLAME_BACK, cy + w.tile * FLAME_HALF);
  ctx.fill();
  const flashOn = w.dead && (w.reducedMotion || Math.floor(w.deadT / FLASH_EVERY) % 2 === 0);
  hitOpts.tint = host.theme.palette.hazard;
  const x = w.boardLeft - w.tile * SIDE_OFFSET;
  const h = w.tile * SPRITE_FRAC;
  host.drawSprite(host.theme.sprites.benjo, x, cy + bob, h, flashOn ? hitOpts : benjoOpts);
}

/** The home page right of the end tile: dim until the link reaches it. @param {HostContext} host @param {World} w @param {number} time */
function drawHome(host, w, time) {
  const sprites = host.theme.sprites.pickups;
  if (!sprites.length) return;
  const b = w.board;
  const lit = b.lit[endCell(b)] === 1 && w.connected;
  const pulse = lit && !w.reducedMotion ? 1 + Math.sin(time * PULSE_RATE) * PULSE_AMP : 1;
  homeOpts.alpha = lit ? 1 : HOME_DIM;
  const x = w.boardLeft + b.cols * w.tile + w.tile * SIDE_OFFSET;
  const y = w.boardTop + (b.endRow + 0.5) * w.tile;
  host.drawSprite(sprites[0], x, y, w.tile * SPRITE_FRAC * pulse, homeOpts);
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
  const clock = w.prevClock + (w.clock - w.prevClock) * blend;

  ctx.clearRect(0, 0, host.size.width, host.size.height);
  ctx.save();
  if (w.dead && !w.reducedMotion && w.deadT < SHAKE_T) {
    const amp = SHAKE_PX * (1 - w.deadT / SHAKE_T);
    ctx.translate(Math.sin(w.deadT * 90) * amp, Math.cos(w.deadT * 70) * amp * 0.6);
  }
  drawBar(ctx, palette, w, clock);
  drawCells(ctx, palette, w);
  drawArms(ctx, palette, w, blend);
  if (!w.dead) drawCursor(ctx, palette, w);
  drawBenjo(host, w, time);
  drawHome(host, w, time);
  ctx.restore();
  ctx.globalAlpha = 1;
}
