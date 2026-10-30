// @ts-check
// Renders a world onto the host canvas. Reads the world, never changes it.
// alpha blends Benjo, the enemies, and the bolts between the last two steps.

import { graceFaint } from '../../shell/blink.js';
import { CELLS, DX, DY, isOpen } from './maze.js';
import { COLS, FLOOR_T, GRACE_ALPHA, GRACE_BLINK, SHAKE_PX, SHAKE_T } from './tuning.js';
import { posX, posY } from './world.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./world.js').World} World */
/** @typedef {{ flipX?: boolean, rotate?: number, alpha?: number, tint?: string }} SpriteOpts */

const TAU = Math.PI * 2;
/** Each enemy kind's hazard sprite. */
const SPRITE = { slime: 0, knight: 1, mage: 2 };

// Reused option objects: the host reads them synchronously, so one of each is enough.
/** @type {SpriteOpts} */
const benjoOpts = { flipX: false, alpha: 1 };
/** @type {SpriteOpts} */
const enemyOpts = { alpha: 1 };

/** Screen x of a cell coordinate. @param {World} w @param {number} x */
const sx = (w, x) => w.ox + x * w.k;
/** @param {World} w @param {number} y */
const sy = (w, y) => w.oy + y * w.k;

/** The maze's walls: each cell draws its top and left sides when closed, and the outer edge. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawWalls(ctx, palette, w) {
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = Math.max(2, w.k * 0.1);
  ctx.lineCap = 'square';
  ctx.beginPath();
  for (let i = 0; i < CELLS; i++) {
    const x = sx(w, i % COLS);
    const y = sy(w, Math.floor(i / COLS));
    if (!isOpen(w.open, i, 0)) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w.k, y);
    }
    if (!isOpen(w.open, i, 3)) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + w.k);
    }
    if (!isOpen(w.open, i, 1)) {
      ctx.moveTo(x + w.k, y);
      ctx.lineTo(x + w.k, y + w.k);
    }
    if (!isOpen(w.open, i, 2)) {
      ctx.moveTo(x, y + w.k);
      ctx.lineTo(x + w.k, y + w.k);
    }
  }
  ctx.stroke();
}

/** The key until Benjo takes it, and the door, lit once he has it. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawKeyAndDoor(ctx, palette, w) {
  const k = w.k;
  const dx = sx(w, w.door % COLS);
  const dy = sy(w, Math.floor(w.door / COLS));
  ctx.fillStyle = w.hasKey ? palette.glow : palette.muted;
  ctx.globalAlpha = w.hasKey ? 0.9 : 0.6;
  ctx.beginPath();
  ctx.moveTo(dx + k * 0.25, dy + k * 0.85);
  ctx.lineTo(dx + k * 0.25, dy + k * 0.4);
  ctx.arc(dx + k * 0.5, dy + k * 0.4, k * 0.25, Math.PI, 0);
  ctx.lineTo(dx + k * 0.75, dy + k * 0.85);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (w.hasKey) return;
  const kx = sx(w, (w.key % COLS) + 0.5);
  const ky = sy(w, Math.floor(w.key / COLS) + 0.5);
  ctx.strokeStyle = palette.glow;
  ctx.fillStyle = palette.glow;
  ctx.lineWidth = Math.max(1.5, k * 0.07);
  ctx.beginPath();
  ctx.arc(kx - k * 0.15, ky, k * 0.12, 0, TAU);
  ctx.moveTo(kx - k * 0.03, ky);
  ctx.lineTo(kx + k * 0.25, ky);
  ctx.moveTo(kx + k * 0.15, ky);
  ctx.lineTo(kx + k * 0.15, ky + k * 0.1);
  ctx.moveTo(kx + k * 0.25, ky);
  ctx.lineTo(kx + k * 0.25, ky + k * 0.12);
  ctx.stroke();
}

/** Slimes, knights, and showing mages, and the bolts in flight. @param {HostContext} host @param {World} w @param {number} blend */
function drawEnemies(host, w, blend) {
  const { ctx } = host;
  const sprites = host.theme.sprites.hazards;
  for (const e of w.enemies) {
    if (!e.active || e.phase === 'hide' || !sprites.length) continue;
    const x = e.prevX + (posX(e) - e.prevX) * blend;
    const y = e.prevY + (posY(e) - e.prevY) * blend;
    enemyOpts.alpha = e.hurtT > 0 && !w.reducedMotion && Math.floor(e.hurtT * 20) % 2 ? 0.4 : 1;
    const size = w.k * (e.kind === 'knight' ? 0.75 : 0.6);
    host.drawSprite(sprites[SPRITE[e.kind] % sprites.length], sx(w, x), sy(w, y), size, enemyOpts);
  }
  ctx.fillStyle = host.theme.palette.hazard;
  ctx.beginPath();
  for (const s of w.bolts) {
    if (!s.active) continue;
    const x = sx(w, s.prevX + (s.x - s.prevX) * blend);
    const y = sy(w, s.prevY + (s.y - s.prevY) * blend);
    ctx.moveTo(x + w.k * 0.12, y);
    ctx.arc(x, y, w.k * 0.12, 0, TAU);
  }
  ctx.fill();
}

/**
 * Benjo with his sword pointing the way he faces, and his shield up when he stands still.
 * @param {HostContext} host @param {World} w @param {number} blend
 */
function drawBenjo(host, w, blend) {
  const { ctx } = host;
  const { palette } = host.theme;
  const b = w.benjo;
  const x = sx(w, b.prevX + (posX(b) - b.prevX) * blend);
  const y = sy(w, b.prevY + (posY(b) - b.prevY) * blend);
  const k = w.k;
  const fx = DX[b.facing];
  const fy = DY[b.facing];
  const faint = graceFaint(w.graceT, GRACE_BLINK, w.reducedMotion);
  ctx.globalAlpha = faint ? GRACE_ALPHA : 1;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = Math.max(2, k * 0.08);
  ctx.beginPath();
  ctx.moveTo(x + fx * k * 0.2, y + fy * k * 0.2);
  ctx.lineTo(x + fx * k * 0.5, y + fy * k * 0.5);
  ctx.stroke();
  if (b.dir < 0 && !w.dead) {
    ctx.strokeStyle = palette.glow;
    ctx.beginPath();
    const facing = Math.atan2(fy, fx);
    ctx.arc(x, y, k * 0.38, facing - 0.8, facing + 0.8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  benjoOpts.flipX = b.facing === 3;
  benjoOpts.alpha = faint ? GRACE_ALPHA : 1;
  benjoOpts.tint = w.pause === 'hit' || w.dead ? palette.hazard : undefined;
  host.drawSprite(host.theme.sprites.benjo, x, y, k * 0.62, benjoOpts);
  benjoOpts.tint = undefined;
}

/** The floor clock as a bar over the maze, and lives as flames under it. @param {CanvasRenderingContext2D} ctx @param {Palette} palette @param {World} w */
function drawGauges(ctx, palette, w) {
  const width = COLS * w.k;
  const y = w.oy - 8;
  ctx.fillStyle = palette.muted;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(w.ox, y, width, 3);
  ctx.globalAlpha = 1;
  ctx.fillStyle = w.clock < 10 ? palette.hazard : palette.glow;
  ctx.fillRect(w.ox, y, (width * w.clock) / FLOOR_T, 3);
  ctx.fillStyle = palette.glow;
  ctx.beginPath();
  const ly = Math.min(w.height - 6, w.oy + (CELLS / COLS) * w.k + 10);
  for (let i = 0; i < w.lives; i++) {
    const lx = w.ox + 6 + i * 12;
    ctx.moveTo(lx + 3, ly);
    ctx.arc(lx, ly, 3, 0, TAU);
  }
  ctx.fill();
}

/**
 * @param {HostContext} host
 * @param {World} w
 * @param {number} alpha blend between the last two steps
 */
export function drawFrame(host, w, alpha) {
  const { ctx } = host;
  const { palette } = host.theme;
  const blend = w.dead || w.pauseT > 0 ? 1 : alpha;
  ctx.clearRect(0, 0, w.width, w.height);
  ctx.save();
  if (w.shakeT > 0 && !w.reducedMotion) {
    const k = (w.shakeT / SHAKE_T) * SHAKE_PX;
    ctx.translate(Math.sin(w.time * 90) * k, Math.cos(w.time * 70) * k);
  }
  drawWalls(ctx, palette, w);
  drawKeyAndDoor(ctx, palette, w);
  drawEnemies(host, w, blend);
  drawBenjo(host, w, blend);
  drawGauges(ctx, palette, w);
  ctx.restore();
}
