// @ts-check
// The level (#92): six sloped girders, the ladders between them, and where things stand. Every
// position is in level units with y down. Bugs roll downhill: right on the odd girders, left on
// the even ones, and off the open end onto the girder below, until the bin at the bottom left.

/**
 * A girder's walking line runs from (x0, y0) to (x1, y1). `dir` is the way bugs roll on it.
 * @typedef {{ x0: number, x1: number, y0: number, y1: number, dir: 1 | -1 }} Girder
 */
/** A ladder at `x` from girder `bottom` up to girder `top`. @typedef {{ x: number, bottom: number, top: number }} Ladder */

const TILT = 6;

/** @param {number} y @param {1 | -1} dir @param {number} x0 @param {number} x1 @returns {Girder} */
const sloped = (y, dir, x0, x1) => ({ x0, x1, y0: y - dir * TILT, y1: y + dir * TILT, dir });

/** Bottom to top. The last one is the short platform where the file waits; bugs never reach it. */
/** @type {Girder[]} */
export const GIRDERS = [
  { x0: 0, x1: 448, y0: 496, y1: 496, dir: -1 },
  sloped(416, 1, 0, 416),
  sloped(336, -1, 32, 448),
  sloped(256, 1, 0, 416),
  sloped(176, -1, 32, 448),
  sloped(96, 1, 0, 416),
  { x0: 168, x1: 280, y0: 32, y1: 32, dir: 1 },
];

export const TOP = GIRDERS.length - 1;

/** @type {Ladder[]} */
export const LADDERS = [
  { x: 360, bottom: 0, top: 1 },
  { x: 128, bottom: 0, top: 1 },
  { x: 72, bottom: 1, top: 2 },
  { x: 240, bottom: 1, top: 2 },
  { x: 376, bottom: 2, top: 3 },
  { x: 200, bottom: 2, top: 3 },
  { x: 80, bottom: 3, top: 4 },
  { x: 272, bottom: 3, top: 4 },
  { x: 384, bottom: 4, top: 5 },
  { x: 168, bottom: 4, top: 5 },
  { x: 256, bottom: 5, top: 6 },
];

/** Where Benjo starts, the thrower stands, the file waits, and bugs end up. */
export const START_X = 36;
export const THROWER_X = 36;
export const FILE_X = 224;
/** A bug rolling left on the bottom girder past this goes in the bin. */
export const BIN_X = 18;

/** Height of girder `g`'s walking line at `x`, clamped to its ends. @param {number} g @param {number} x */
export function girderY(g, x) {
  const { x0, x1, y0, y1 } = GIRDERS[g];
  const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
  return y0 + (y1 - y0) * t;
}

/** Is `x` over girder `g`? @param {number} g @param {number} x */
export const onGirder = (g, x) => x >= GIRDERS[g].x0 && x <= GIRDERS[g].x1;
