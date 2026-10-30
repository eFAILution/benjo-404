// @ts-check
// The three decks of the USS Never Sleeps (ADR-0076), as plain data in 400 by 600 table units.
// The hull is the ship seen from above with its nose at the bottom; the bridge is the glass dome;
// Benjo's Quarters is the hidden room behind the Easter Eggs target.

import { BALL_R, FLIP_LEN } from './tuning.js';

/**
 * A wall. `k` says what it does when hit: a plain wall, a kicking slingshot, a drop target that
 * falls, or a standup, egg, or letter target that scores. `one` walls only stop a ball on the
 * side their normal points to.
 * @typedef {{ ax: number, ay: number, bx: number, by: number,
 *   k: 'wall' | 'sling' | 'drop' | 'stand' | 'egg' | 'letter', id: number, one?: boolean }} Seg
 * @typedef {{ x: number, y: number, r: number, k: 'bumper' | 'chair' | 'post', id: number }} Round
 * A trigger the ball rolls through. `dir` -1 fires only moving up, 1 only down, 0 either way.
 * @typedef {{ x: number, y: number, w: number, h: number,
 *   k: 'lane' | 'loop' | 'inlane' | 'ramp' | 'spin', id: number, dir: number }} Zone
 * @typedef {{ x: number, y: number, side: 1 | -1, len: number }} FlipperSpot
 * @typedef {{ id: DeckId, segs: Seg[], rounds: Round[], zones: Zone[], flippers: FlipperSpot[],
 *   saucer: { x: number, y: number, kx: number, ky: number } | null,
 *   plunger: { x: number, y: number } | null, entry: { x: number, y: number, vx: number, vy: number },
 *   hatch: { x: number, y: number } | null, outline: number[][] }} Deck
 * @typedef {'hull' | 'bridge' | 'quarters'} DeckId
 */

/** The hull's playfield is mirrored about this x, so its right side clears the plunger lane. */
const CX = 187;
/** @param {number} x */
const m = (x) => 2 * CX - x;

/**
 * Points along an ellipse from angle t0 to t1, both ends included.
 * @param {number} cx @param {number} cy @param {number} rx @param {number} ry
 * @param {number} t0 @param {number} t1 @param {number} n segments
 */
export function arc(cx, cy, rx, ry, t0, t1, n) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = t0 + ((t1 - t0) * i) / n;
    return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
  });
}

/**
 * Walls joining a run of points.
 * @param {number[][]} points @param {Seg['k']} [k] @param {number} [id]
 * @returns {Seg[]}
 */
export function poly(points, k = 'wall', id = 0) {
  return points.slice(1).map(([bx, by], i) => {
    const [ax, ay] = points[i];
    return { ax, ay, bx, by, k, id };
  });
}

/** @param {number} ax @param {number} ay @param {number} bx @param {number} by @param {Seg['k']} k @param {number} id */
const seg = (ax, ay, bx, by, k, id) => [{ ax, ay, bx, by, k, id }];

/** @param {number} x @param {number} y @param {number} w @param {number} h @param {Zone['k']} k @param {number} id @param {number} dir @returns {Zone} */
const zone = (x, y, w, h, k, id, dir) => ({ x, y, w, h, k, id, dir });

/** Both flippers of a deck, pivots `gap` either side of `cx`. @param {number} cx @param {number} gap */
const flipperPair = (cx, gap, len = FLIP_LEN) =>
  /** @type {FlipperSpot[]} */ ([
    { x: cx - gap, y: 540, side: 1, len },
    { x: cx + gap, y: 540, side: -1, len },
  ]);

/** @returns {Deck} */
function hull() {
  const top = arc(202, 180, 192, 165, Math.PI, Math.PI * 2, 24);
  const laneX = [112, 150, 188, 226, 264];
  /** @type {Seg[]} */
  const segs = [
    // Hull walls: the left side, the stern arc, and the plunger lane's outer wall.
    ...poly([[10, 600], [10, 180], ...top.slice(1, -1), [394, 180], [394, 600]]),
    ...poly([
      [364, 600],
      [364, 200],
    ]),
    // Gate over the plunger lane: launched balls pass up through it, falling ones roll off it.
    { ax: 394, ay: 175, bx: 364, by: 200, k: 'wall', id: 0, one: true },
    { ax: 364, ay: 592, bx: 394, by: 592, k: 'wall', id: 0 },
    // Engine fins: the orbit guides, with a Ship Control standup set into each.
    ...poly([
      [46, 180],
      [46, 262],
    ]),
    ...seg(46, 262, 46, 292, 'stand', 0),
    ...poly([
      [46, 292],
      [46, 340],
    ]),
    ...poly([
      [m(46), 180],
      [m(46), 262],
    ]),
    ...seg(m(46), 262, m(46), 292, 'stand', 1),
    ...poly([
      [m(46), 292],
      [m(46), 340],
    ]),
    // Orbit exits turn a falling ball onto the inlane; the gap under them is the outlane.
    ...poly([
      [10, 352],
      [44, 396],
    ]),
    ...poly([
      [m(10), 352],
      [m(44), 396],
    ]),
    // Inlane guides down to the flipper pivots.
    ...poly([
      [46, 420],
      [46, 480],
      [122, 524],
    ]),
    ...poly([
      [m(46), 420],
      [m(46), 480],
      [m(122), 524],
    ]),
    // Slingshots: the inner face kicks.
    ...seg(80, 405, 114, 494, 'sling', 0),
    ...poly([
      [114, 494],
      [80, 465],
      [80, 405],
    ]),
    ...seg(m(80), 405, m(114), 494, 'sling', 1),
    ...poly([
      [m(114), 494],
      [m(80), 465],
      [m(80), 405],
    ]),
    // S-H-I-P lane guides.
    ...laneX.flatMap((x) =>
      poly([
        [x, 72],
        [x, 108],
      ]),
    ),
    // The center ramp up to the bridge.
    ...poly([
      [272, 250],
      [272, 196],
    ]),
    ...poly([
      [304, 250],
      [304, 196],
    ]),
    // O2 Generation: three drop targets above the flippers.
    ...[0, 1, 2].flatMap((i) => seg(152 + i * 24, 372, 172 + i * 24, 372, 'drop', i)),
  ];
  return {
    id: 'hull',
    segs,
    rounds: [
      { x: 150, y: 236, r: 17, k: 'bumper', id: 0 },
      { x: 224, y: 236, r: 17, k: 'bumper', id: 1 },
      { x: 187, y: 292, r: 17, k: 'bumper', id: 2 },
      ...laneX.map((x, id) => /** @type {Round} */ ({ x, y: 72, r: 3, k: 'post', id })),
    ],
    zones: [
      ...[0, 1, 2, 3].map((i) => zone(laneX[i] + 4, 84, 30, 16, 'lane', i, 1)),
      zone(12, 266, 32, 14, 'loop', 0, -1),
      zone(m(44), 266, 32, 14, 'loop', 1, -1),
      zone(12, 214, 32, 10, 'spin', 0, 0),
      zone(275, 200, 26, 12, 'ramp', 0, -1),
      zone(50, 440, 26, 20, 'inlane', 0, 1),
      zone(m(76), 440, 26, 20, 'inlane', 1, 1),
    ],
    flippers: flipperPair(CX, 65),
    saucer: { x: 96, y: 236, kx: 160, ky: 300 },
    plunger: { x: 379, y: 592 - BALL_R },
    entry: { x: 62, y: 408, vx: 40, vy: 120 },
    hatch: { x: 187, y: 258 },
    outline: [[10, 600], [10, 180], ...top.slice(1, -1), [394, 180], [394, 600]],
  };
}

/** @returns {Deck} */
function bridge() {
  const dome = arc(200, 260, 180, 240, Math.PI, Math.PI * 2, 24);
  const wall = [[130, 524], [20, 430], ...dome, [380, 430], [270, 524]];
  return {
    id: 'bridge',
    segs: [
      ...poly(wall),
      // Port and starboard orbits around the dome.
      ...poly([
        [64, 186],
        [64, 336],
      ]),
      ...poly([
        [336, 186],
        [336, 336],
      ]),
      // The Easter Eggs target, high in the dome.
      ...seg(184, 118, 216, 118, 'egg', 0),
    ],
    rounds: [
      { x: 160, y: 232, r: 18, k: 'chair', id: 0 },
      { x: 240, y: 232, r: 18, k: 'chair', id: 1 },
      { x: 200, y: 292, r: 18, k: 'chair', id: 2 },
    ],
    zones: [zone(24, 252, 38, 12, 'spin', 0, 0), zone(340, 252, 36, 12, 'loop', 1, -1)],
    flippers: flipperPair(200, 70, 62),
    saucer: null,
    plunger: null,
    entry: { x: 300, y: 440, vx: -120, vy: -850 },
    hatch: null,
    outline: wall,
  };
}

/** Five letter targets on a ring, facing its center. @returns {Seg[]} */
function letters() {
  return [-150, -120, -90, -60, -30].flatMap((deg, id) => {
    const t = (deg * Math.PI) / 180;
    const [x, y] = [200 + 140 * Math.cos(t), 250 + 140 * Math.sin(t)];
    const [tx, ty] = [-Math.sin(t) * 15, Math.cos(t) * 15];
    return seg(x - tx, y - ty, x + tx, y + ty, 'letter', id);
  });
}

/** @returns {Deck} */
function quarters() {
  const roof = arc(200, 240, 170, 200, Math.PI, Math.PI * 2, 20);
  const wall = [[130, 524], [30, 420], ...roof, [370, 420], [270, 524]];
  return {
    id: 'quarters',
    segs: [...poly(wall), ...letters()],
    rounds: [
      { x: 160, y: 300, r: 16, k: 'bumper', id: 0 },
      { x: 240, y: 300, r: 16, k: 'bumper', id: 1 },
    ],
    zones: [],
    flippers: flipperPair(200, 70, 62),
    saucer: null,
    plunger: null,
    entry: { x: 200, y: 420, vx: 0, vy: -760 },
    hatch: null,
    outline: wall,
  };
}

/** @type {Record<DeckId, Deck>} */
export const DECKS = { hull: hull(), bridge: bridge(), quarters: quarters() };
