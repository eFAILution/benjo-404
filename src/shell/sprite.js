// @ts-check
// Vector sprites drawn through Path2D. Each path string is parsed once and cached.
/** @typedef {import('../contracts').Sprite} Sprite */
/** @typedef {import('../contracts').Palette} Palette */
/** @typedef {{ flipX?: boolean, rotate?: number, alpha?: number, tint?: string }} DrawOptions */

/** @type {WeakMap<object, Path2D>} */
const cache = new WeakMap();

/**
 * @param {{ d: string }} path
 * @returns {Path2D}
 */
function path2d(path) {
  let shape = cache.get(path);
  if (!shape) {
    shape = new Path2D(path.d);
    cache.set(path, shape);
  }
  return shape;
}

/**
 * Resolve a palette token name ('accent', 'ink', ...) or pass a hex color through.
 * @param {Palette} palette
 * @param {string | undefined} color
 * @returns {string | undefined}
 */
export function resolveColor(palette, color) {
  if (color === undefined) return undefined;
  if (color.startsWith('#')) return color;
  return Object.keys(palette).includes(color)
    ? palette[/** @type {keyof Palette} */ (color)]
    : color;
}

/**
 * Draw a sprite centered on its anchor at (x, y), h CSS px tall.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Palette} palette
 * @param {Sprite} sprite
 * @param {number} x
 * @param {number} y
 * @param {number} h
 * @param {DrawOptions} [opts]
 */
export function drawSprite(ctx, palette, sprite, x, y, h, opts = {}) {
  const [vx, vy, vw, vh] = sprite.viewBox;
  const [ax, ay] = sprite.anchor ?? [0.5, 0.5];
  const scale = h / vh;
  ctx.save();
  ctx.translate(x, y);
  if (opts.rotate) ctx.rotate(opts.rotate);
  ctx.scale(opts.flipX ? -scale : scale, scale);
  ctx.translate(-vx - vw * ax, -vy - vh * ay);
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  for (const path of sprite.paths) {
    const shape = path2d(path);
    const fill = opts.tint ?? resolveColor(palette, path.fill);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill(shape);
    }
    const stroke = resolveColor(palette, path.stroke);
    if (stroke) {
      ctx.strokeStyle = opts.tint ?? stroke;
      ctx.lineWidth = path.strokeWidth ?? 1;
      ctx.stroke(shape);
    }
  }
  ctx.restore();
}
