// @ts-check
// Renders a Cache Muncher world onto the host canvas. Reads the world, never changes it.
// alpha blends Benjo and the cache misses between the last two steps.

import {
  BENJO_H,
  BLINK_EVERY,
  BOTTOM_PAD,
  BYTE_ALPHA,
  BYTE_SIZE,
  EDGE_ALPHA,
  FLASH_EVERY,
  FRIGHT_WARN_T,
  GRACE_ALPHA,
  LIFE_R,
  LIFE_SPACING,
  MISS_H,
  PELLET_H,
  PELLET_PULSE,
  PELLET_RATE,
  SIDE_PAD,
  WALL_ALPHA,
} from './tuning.js';
import { COLS, cellAt, ROWS } from './world.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./world.js').World} World */
/** @typedef {import('./world.js').Actor} Actor */
/** @typedef {{ flipX?: boolean, rotate?: number, alpha?: number, tint?: string }} SpriteOpts */

/** Benjo's sprite faces right; up and down tilt it, left mirrors it. Indexed by direction. */
const ROTATE = [0, Math.PI / 2, 0, -Math.PI / 2];

// Reused option objects: the host reads them synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const benjoOpts = { flipX: false, rotate: 0, alpha: 1 };
/** @type {SpriteOpts} */
const hitOpts = { flipX: false, rotate: 0, tint: '' };
/** @type {SpriteOpts} */
const missOpts = { tint: undefined };
/** @type {SpriteOpts} */
const pelletOpts = {};

/** @param {string} c */
const isWall = (c) => c === '#';

/**
 * Walls as soft blocks with a lit edge wherever they meet a path, and the pen door as a line.
 * @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w
 */
function drawMaze(ctx, palette, w) {
  const c = w.cell;
  ctx.fillStyle = palette.accent;
  ctx.globalAlpha = WALL_ALPHA;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (isWall(cellAt(col, row))) ctx.fillRect(w.boardX + col * c, w.boardY + row * c, c, c);
    }
  }
  ctx.globalAlpha = EDGE_ALPHA;
  const edge = Math.max(1, Math.round(c / 12));
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (!isWall(cellAt(col, row))) continue;
      const x = w.boardX + col * c;
      const y = w.boardY + row * c;
      if (!isWall(cellAt(col, row - 1))) ctx.fillRect(x, y, c, edge);
      if (!isWall(cellAt(col, row + 1))) ctx.fillRect(x, y + c - edge, c, edge);
      if (!isWall(cellAt(col - 1, row))) ctx.fillRect(x, y, edge, c);
      if (!isWall(cellAt(col + 1, row))) ctx.fillRect(x + c - edge, y, edge, c);
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.muted;
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      if (cellAt(col, row) !== '=') continue;
      ctx.fillRect(w.boardX + col * c, w.boardY + (row + 0.5) * c - edge / 2, c, edge);
    }
  }
}

/** Bytes as small squares, pellets as the theme's pickup, pulsing. @param {HostContext} host @param {World} w @param {number} time */
function drawBytes(host, w, time) {
  const { ctx } = host;
  const c = w.cell;
  const size = Math.max(2, Math.round(c * BYTE_SIZE));
  const pickups = host.theme.sprites.pickups;
  const pulse = w.reducedMotion ? 1 : 1 + Math.sin(time * PELLET_RATE) * PELLET_PULSE;
  ctx.fillStyle = host.theme.palette.ink;
  ctx.globalAlpha = BYTE_ALPHA;
  for (let i = 0; i < w.bytes.length; i++) {
    if (w.bytes[i] !== 1) continue;
    const x = w.boardX + ((i % COLS) + 0.5) * c;
    const y = w.boardY + (Math.floor(i / COLS) + 0.5) * c;
    ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  }
  ctx.globalAlpha = 1;
  if (!pickups.length) return;
  for (let i = 0; i < w.bytes.length; i++) {
    if (w.bytes[i] !== 2) continue;
    const x = w.boardX + ((i % COLS) + 0.5) * c;
    const y = w.boardY + (Math.floor(i / COLS) + 0.5) * c;
    host.drawSprite(pickups[0], x, y, c * PELLET_H * pulse, pelletOpts);
  }
}

/** @param {Actor} a @param {number} blend */
const blendX = (a, blend) => a.prevX + (a.x - a.prevX) * blend;
/** @param {Actor} a @param {number} blend */
const blendY = (a, blend) => a.prevY + (a.y - a.prevY) * blend;

/**
 * Cache misses in their theme sprites. While catchable they are drawn in the muted color, and
 * flash back to their own colors as the time runs out.
 * @param {HostContext} host @param {World} w @param {number} blend
 */
function drawMisses(host, w, blend) {
  const sprites = host.theme.sprites.hazards;
  if (!sprites.length) return;
  const { palette } = host.theme;
  const warn = w.frightT > 0 && w.frightT < FRIGHT_WARN_T;
  const flashOn = warn && (w.reducedMotion || Math.floor(w.frightT / FLASH_EVERY) % 2 === 0);
  for (const miss of w.misses) {
    missOpts.tint = miss.frightened && !flashOn ? palette.muted : undefined;
    const x = w.boardX + blendX(miss, blend) * w.cell;
    const y = w.boardY + blendY(miss, blend) * w.cell;
    host.drawSprite(sprites[miss.index % sprites.length], x, y, w.cell * MISS_H, missOpts);
  }
}

/**
 * Benjo faces his way and flashes in the hazard tint after a lost life. He blinks while the
 * Digital Twin's grace runs (holds faint under reduced motion).
 * @param {HostContext} host @param {World} w @param {number} blend
 */
function drawBenjo(host, w, blend) {
  const b = w.benjo;
  const hurt = w.dead || w.hitT > 0;
  const flashOn = hurt && (w.reducedMotion || Math.floor(w.hitAge / FLASH_EVERY) % 2 === 0);
  const opts = flashOn ? hitOpts : benjoOpts;
  const faint = w.graceT > 0 && (w.reducedMotion || Math.floor(w.graceT / BLINK_EVERY) % 2 === 0);
  benjoOpts.alpha = faint ? GRACE_ALPHA : 1;
  opts.flipX = b.facing === 2;
  opts.rotate = ROTATE[b.facing];
  hitOpts.tint = host.theme.palette.hazard;
  const x = w.boardX + blendX(b, blend) * w.cell;
  const y = w.boardY + blendY(b, blend) * w.cell;
  host.drawSprite(host.theme.sprites.benjo, x, y, w.cell * BENJO_H, opts);
}

/** Lives left as dots in the bottom left corner. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawLives(ctx, palette, w) {
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
 * Draw one frame.
 * @param {HostContext} host
 * @param {World} w
 * @param {number} alpha in [0,1) from the host loop
 */
export function drawFrame(host, w, alpha) {
  const { ctx } = host;
  const { palette } = host.theme;
  const blend = w.reducedMotion ? 1 : alpha;
  ctx.clearRect(0, 0, host.size.width, host.size.height);
  drawMaze(ctx, palette, w);
  drawBytes(host, w, w.time);
  drawMisses(host, w, blend);
  drawBenjo(host, w, blend);
  drawLives(ctx, palette, w);
}
