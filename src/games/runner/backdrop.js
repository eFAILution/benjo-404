// @ts-check
// The scenery behind Benjo: two parallax layers of faint HUD dots and crosshair ticks, and a
// ground line with ruler ticks. Positions come from a hash of the tile index, so nothing is
// stored and nothing is allocated per frame.

/** @typedef {import('../../contracts').Palette} Palette */

const GROUND_TICK = 48;
const GROUND_ALPHA = 0.16;

/**
 * @typedef {{ factor: number, spacing: number, alpha: number, skip: number, cross: boolean, seed: number }} Layer
 */

/** @type {Layer} */
const FAR = { factor: 0.15, spacing: 44, alpha: 0.2, skip: 0.35, cross: false, seed: 11 };
/** @type {Layer} */
const NEAR = { factor: 0.4, spacing: 130, alpha: 0.35, skip: 0.2, cross: true, seed: 47 };

/**
 * Deterministic value in [0,1) for a tile index.
 * @param {number} n
 */
function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Layer} layer
 * @param {number} width
 * @param {number} top
 * @param {number} bottom
 * @param {number} offset px this layer has scrolled
 */
function drawLayer(ctx, layer, width, top, bottom, offset) {
  ctx.globalAlpha = layer.alpha;
  const { spacing, seed } = layer;
  const first = Math.floor(offset / spacing) - 1;
  const last = Math.ceil((offset + width) / spacing);
  for (let i = first; i <= last; i++) {
    if (hash(i + seed) < layer.skip) continue;
    const x = Math.round(i * spacing - offset + hash(i * 3.1 + seed) * spacing * 0.6);
    const y = Math.round(top + hash(i * 7.7 + seed) * (bottom - top));
    if (layer.cross) {
      ctx.fillRect(x - 3, y, 7, 1);
      ctx.fillRect(x, y - 3, 1, 7);
    } else {
      ctx.fillRect(x, y, 2, 2);
    }
  }
}

/**
 * Parallax layers in the glow color. With `still` (reduced motion) they never move.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Palette} palette
 * @param {number} width
 * @param {number} height
 * @param {number} groundY
 * @param {number} distance px the world has scrolled
 * @param {boolean} still
 */
export function drawBackdrop(ctx, palette, width, height, groundY, distance, still) {
  const top = Math.round(height * 0.12);
  const bottom = groundY - 28;
  ctx.fillStyle = palette.glow;
  drawLayer(ctx, FAR, width, top, bottom, still ? 0 : distance * FAR.factor);
  drawLayer(ctx, NEAR, width, top, bottom, still ? 0 : distance * NEAR.factor);
  ctx.globalAlpha = 1;
}

/**
 * The ground line with a tick every 48 px and a longer one every fourth tick.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Palette} palette
 * @param {number} width
 * @param {number} groundY
 * @param {number} distance
 */
export function drawGround(ctx, palette, width, groundY, distance) {
  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = GROUND_ALPHA;
  ctx.fillRect(0, groundY, width, 1);
  let index = Math.floor(distance / GROUND_TICK);
  for (let x = index * GROUND_TICK - distance; x <= width; x += GROUND_TICK) {
    ctx.fillRect(Math.round(x), groundY + 1, 1, index % 4 === 0 ? 8 : 4);
    index += 1;
  }
  ctx.globalAlpha = 1;
}
