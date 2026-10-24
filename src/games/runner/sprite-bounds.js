// @ts-check
// Where a sprite's paths actually draw inside its viewBox. Theme art often leaves margins, and
// a hazard must sit on the ground and collide where it is visible, not where its box is.
// Bounds are conservative (control points and whole arc ellipses count) and computed once
// per sprite, outside the game loop.

/** @typedef {import('../../contracts').Sprite} Sprite */
/** @typedef {[number, number, number, number]} Bounds x0, y0, x1, y1 as fractions of the viewBox */

const PARAMS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
const TOKEN = /[MLHVCSQTAZmlhvcsqtaz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
/** @type {Bounds} */
const FULL = [0, 0, 1, 1];

/** @type {WeakMap<Sprite, Bounds>} */
const cache = new WeakMap();

/**
 * Center of an unrotated SVG arc from (x1,y1) to (x2,y2), per the SVG implementation notes.
 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
 * @param {number} rx0 @param {number} ry0 @param {number} large @param {number} sweep
 * @returns {[number, number, number, number]} cx, cy, rx, ry (radii scaled up if too small)
 */
function arcCenter(x1, y1, x2, y2, rx0, ry0, large, sweep) {
  let rx = Math.abs(rx0);
  let ry = Math.abs(ry0);
  const hx = (x1 - x2) / 2;
  const hy = (y1 - y2) / 2;
  const lambda = (hx * hx) / (rx * rx) + (hy * hy) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * hy * hy - ry * ry * hx * hx;
  const den = rx * rx * hy * hy + ry * ry * hx * hx;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, den ? num / den : 0));
  return [(coef * rx * hy) / ry + (x1 + x2) / 2, (-coef * ry * hx) / rx + (y1 + y2) / 2, rx, ry];
}

/**
 * Bounding box of one path's `d` in viewBox units, or null when it cannot be read.
 * @param {string} d
 * @returns {[number, number, number, number] | null} minX, minY, maxX, maxY
 */
export function pathBounds(d) {
  const tokens = d.match(TOKEN) ?? [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  /** @param {number} x @param {number} y */
  const add = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let cmd = '';
  let i = 0;
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++];
    const lower = cmd.toLowerCase();
    const rel = cmd === lower;
    const count = PARAMS[/** @type {keyof typeof PARAMS} */ (lower)];
    if (count === undefined) return null;
    if (count === 0) {
      x = startX;
      y = startY;
      continue;
    }
    const p = tokens.slice(i, i + count).map(Number);
    if (p.length < count || p.some(Number.isNaN)) return null;
    i += count;
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    if (lower === 'h') x = p[0] + ox;
    else if (lower === 'v') y = p[0] + oy;
    else if (lower === 'a') {
      const ex = p[5] + ox;
      const ey = p[6] + oy;
      const [cx, cy, rx, ry] = arcCenter(x, y, ex, ey, p[0], p[1], p[3], p[4]);
      const r = Math.max(rx, ry);
      if (p[2] % 180 === 0) {
        add(cx - rx, cy - ry);
        add(cx + rx, cy + ry);
      } else {
        add(Math.min(x, ex) - r, Math.min(y, ey) - r);
        add(Math.max(x, ex) + r, Math.max(y, ey) + r);
      }
      x = ex;
      y = ey;
    } else {
      for (let k = 0; k < count - 2; k += 2) add(p[k] + ox, p[k + 1] + oy);
      x = p[count - 2] + ox;
      y = p[count - 1] + oy;
    }
    add(x, y);
    if (lower === 'm') {
      startX = x;
      startY = y;
      cmd = rel ? 'l' : 'L';
    }
  }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

/**
 * Drawn area of a sprite as fractions of its viewBox, clamped to [0,1]. Unreadable paths
 * fall back to the whole box.
 * @param {Sprite} sprite
 * @returns {Bounds}
 */
export function spriteBounds(sprite) {
  const known = cache.get(sprite);
  if (known) return known;
  const [vx, vy, vw, vh] = sprite.viewBox;
  /** @type {Bounds} */
  let result = [1, 1, 0, 0];
  for (const { d } of sprite.paths) {
    const b = pathBounds(d);
    if (!b) {
      result = FULL;
      break;
    }
    result = [
      Math.min(result[0], (b[0] - vx) / vw),
      Math.min(result[1], (b[1] - vy) / vh),
      Math.max(result[2], (b[2] - vx) / vw),
      Math.max(result[3], (b[3] - vy) / vh),
    ];
  }
  /** @type {Bounds} */
  const clamped = [
    Math.max(0, result[0]),
    Math.max(0, result[1]),
    Math.min(1, result[2]),
    Math.min(1, result[3]),
  ];
  const usable = clamped[2] - clamped[0] > 0.05 && clamped[3] - clamped[1] > 0.05;
  const bounds = usable ? clamped : FULL;
  cache.set(sprite, bounds);
  return bounds;
}

/**
 * Width over height of the drawn area, in CSS px terms.
 * @param {Sprite} sprite
 */
export function contentAspect(sprite) {
  const [x0, y0, x1, y1] = spriteBounds(sprite);
  return ((x1 - x0) * sprite.viewBox[2]) / ((y1 - y0) * sprite.viewBox[3]);
}
