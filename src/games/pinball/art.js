// @ts-check
// Drawing helpers that make the table read as a real machine: chrome rails, a chrome ball, lit
// bumper caps, glowing light inserts, and soft drop shadows. All in table units on any context.

/** @typedef {import('../../contracts').Palette} Palette */

const TAU = Math.PI * 2;
/** Where shadows fall: the light hangs above the table, toward the player. */
export const SHADOW_X = 2.5;
export const SHADOW_Y = 3.5;
export const SHADOW = 'rgba(0,0,0,0.5)';
export const STEEL = '#8b95a1';
export const STEEL_DARK = '#434a54';
export const SHINE = '#f3f6f9';
export const HULL_LIGHT = '#eef1f4';
export const HULL_DARK = '#9aa2ab';

/**
 * A gradient, or its last color where the context cannot make one (the test fakes).
 * @param {CanvasGradient | undefined} gradient @param {Array<[number, string]>} stops
 * @returns {CanvasGradient | string}
 */
function fill(gradient, stops) {
  if (!gradient?.addColorStop) return stops[stops.length - 1][1];
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  return gradient;
}

/**
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} r
 * @param {Array<[number, string]>} stops from the lit top left to the rim
 */
export const radial = (ctx, x, y, r, stops) =>
  fill(ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r), stops);

/**
 * @param {CanvasRenderingContext2D} ctx @param {number} x0 @param {number} y0 @param {number} x1
 * @param {number} y1 @param {Array<[number, string]>} stops
 */
export const linear = (ctx, x0, y0, x1, y1, stops) =>
  fill(ctx.createLinearGradient(x0, y0, x1, y1), stops);

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} r */
export function disc(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

/**
 * Stroke the same path three times, shadow, steel, and a thin highlight, so it reads as a rail.
 * @param {CanvasRenderingContext2D} ctx @param {() => void} trace builds the path
 * @param {number} [width]
 */
export function rail(ctx, trace, width = 5) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  /** @type {Array<[number, number, string, number]>} */
  const passes = [
    [SHADOW_X, SHADOW_Y, SHADOW, width + 2],
    [0, 0, STEEL_DARK, width],
    [-0.4, -0.4, STEEL, width - 1.6],
    [-0.9, -0.9, SHINE, 1.2],
  ];
  for (const [dx, dy, color, lineWidth] of passes) {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    trace();
    ctx.stroke();
    ctx.restore();
  }
}

/** A chrome post or bolt head. @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} r */
export function bolt(ctx, x, y, r) {
  ctx.fillStyle = SHADOW;
  disc(ctx, x + SHADOW_X * 0.6, y + SHADOW_Y * 0.6, r + 1);
  ctx.fill();
  ctx.fillStyle = radial(ctx, x, y, r, [
    [0, SHINE],
    [0.5, STEEL],
    [1, STEEL_DARK],
  ]);
  disc(ctx, x, y, r);
  ctx.fill();
}

/** The steel ball, with its shadow and a window reflection. @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} r */
export function chromeBall(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  disc(ctx, x + SHADOW_X * 1.3, y + SHADOW_Y * 1.3, r);
  ctx.fill();
  ctx.fillStyle = radial(ctx, x, y, r, [
    [0, '#ffffff'],
    [0.3, '#dfe4ea'],
    [0.75, '#737c86'],
    [1, '#262a30'],
  ]);
  disc(ctx, x, y, r);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  disc(ctx, x - r * 0.38, y - r * 0.42, r * 0.22);
  ctx.fill();
}

/**
 * A pop bumper: shadow, dark skirt, steel ring, then a domed cap in `color` that blazes when lit.
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} r
 * @param {string} color @param {string} glow @param {boolean} lit
 */
export function bumperCap(ctx, x, y, r, color, glow, lit) {
  ctx.fillStyle = SHADOW;
  disc(ctx, x + SHADOW_X * 1.6, y + SHADOW_Y * 1.6, r + 3);
  ctx.fill();
  ctx.fillStyle = '#1b1f26';
  disc(ctx, x, y, r + 3);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = STEEL;
  ctx.stroke();
  ctx.save();
  if (lit) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 24;
  }
  ctx.fillStyle = radial(ctx, x, y - 1, r - 1, [
    [0, '#ffffff'],
    [0.35, lit ? glow : color],
    [1, color],
  ]);
  disc(ctx, x, y - 1, r - 1);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.5;
  disc(ctx, x, y - 1, r - 4);
  ctx.stroke();
}

/**
 * A light insert set into the playfield. Unlit it is dim colored plastic; lit it glows.
 * @param {CanvasRenderingContext2D} ctx @param {() => void} trace the insert's shape
 * @param {string} color @param {boolean} lit
 */
export function insert(ctx, trace, color, lit) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = lit ? 1 : 0.22;
  if (lit) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
  }
  trace();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  trace();
  ctx.stroke();
}

/**
 * Text with a glow behind it, for words lit on the playfield.
 * @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} x @param {number} y
 * @param {string} color @param {number} blur
 */
export function glowText(ctx, text, x, y, color, blur) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillText(text, x, y);
  ctx.restore();
}
