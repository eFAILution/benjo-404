// @ts-check
// Ball physics (ADR-0076 section 4). Each host step is split into substeps short enough that a
// ball at top speed moves less than its radius, so it can never pass through a wall or flipper.
// A collision pushes the ball out along the contact normal and reflects what was heading in.

import {
  BALL_R,
  BUMPER_KICK,
  FLIP_BASE_R,
  FLIP_DOWN_SPEED,
  FLIP_E,
  FLIP_REST,
  FLIP_TIP_R,
  FLIP_UP,
  FLIP_UP_SPEED,
  GRAVITY,
  HIT_MIN,
  MAX_SPEED,
  SLING_KICK,
  WALL_E,
  WALL_GRIP,
} from './tuning.js';

/** @typedef {import('./decks.js').Seg} Seg */
/** @typedef {import('./decks.js').Round} Round */
/** @typedef {import('./decks.js').FlipperSpot} FlipperSpot */
/**
 * A ball. `in` has one bit per deck zone the ball is inside, so a zone fires on entry only.
 * `nx`, `ny` are the normal of its last contact, for kicks; `t` counts down a hold or a grace.
 * @typedef {{ x: number, y: number, vx: number, vy: number, px: number, py: number,
 *   nx: number, ny: number, state: 'play' | 'held' | 'ramp', t: number, in: number,
 *   still: number }} Ball
 * @typedef {{ a: number, w: number }} Flipper angle in radians and its current angular speed
 * @typedef {(kind: string, id: number, ball: Ball, speed: number) => void} OnHit
 */

/** @param {number} x @param {number} y @returns {Ball} */
export const makeBall = (x, y) => ({
  x,
  y,
  vx: 0,
  vy: 0,
  px: x,
  py: y,
  nx: 0,
  ny: -1,
  state: 'play',
  t: 0,
  in: 0,
  still: 0,
});

/** The resting angle of a flipper on this side. @param {1 | -1} side */
export const restAngle = (side) => (side === 1 ? FLIP_REST : Math.PI - FLIP_REST);

/** @param {1 | -1} side */
const upAngle = (side) => (side === 1 ? FLIP_UP : Math.PI - FLIP_UP);

/**
 * Swing a flipper toward up or rest for `h` seconds, recording its angular speed for hits.
 * @param {Flipper} f @param {1 | -1} side @param {boolean} held @param {number} h
 */
export function swing(f, side, held, h) {
  const target = held ? upAngle(side) : restAngle(side);
  const speed = held ? FLIP_UP_SPEED : FLIP_DOWN_SPEED;
  const gap = target - f.a;
  const step = Math.sign(gap) * Math.min(Math.abs(gap), speed * h);
  f.a += step;
  f.w = step / h;
}

/** The flipper's tip. @param {FlipperSpot} spot @param {Flipper} f */
export const tipOf = (spot, f) => [
  spot.x + Math.cos(f.a) * spot.len,
  spot.y + Math.sin(f.a) * spot.len,
];

/**
 * Push the ball out of a contact at (qx, qy) with combined radius `reach`, and bounce it off a
 * surface moving at (sx, sy). Returns how hard the ball came in, or -1 when it did not touch.
 * @param {Ball} b @param {number} qx @param {number} qy @param {number} reach
 * @param {number} e restitution @param {number} sx @param {number} sy
 * @param {number} [nx] fallback normal when the ball's center sits on the contact
 * @param {number} [ny]
 */
function contact(b, qx, qy, reach, e, sx = 0, sy = 0, nx = 0, ny = -1) {
  let dx = b.x - qx;
  let dy = b.y - qy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) return -1;
  const d = Math.sqrt(d2);
  if (d > 1e-6) {
    dx /= d;
    dy /= d;
  } else {
    dx = nx;
    dy = ny;
  }
  b.x = qx + dx * reach;
  b.y = qy + dy * reach;
  const vn = (b.vx - sx) * dx + (b.vy - sy) * dy;
  if (vn >= 0) return 0;
  b.vx -= (1 + e) * vn * dx;
  b.vy -= (1 + e) * vn * dy;
  b.vx *= WALL_GRIP;
  b.vy *= WALL_GRIP;
  b.nx = dx;
  b.ny = dy;
  return -vn;
}

/**
 * The closest point on segment a-b to (x, y), as its parameter in [0, 1].
 * @param {number} ax @param {number} ay @param {number} bx @param {number} by
 * @param {number} x @param {number} y
 */
export function along(ax, ay, bx, by, x, y) {
  const ex = bx - ax;
  const ey = by - ay;
  const len2 = ex * ex + ey * ey;
  return len2 ? Math.min(1, Math.max(0, ((x - ax) * ex + (y - ay) * ey) / len2)) : 0;
}

/**
 * @param {Ball} b @param {Seg} s
 * @returns {number} impact speed, or -1 for no touch
 */
export function hitSeg(b, s) {
  const ex = s.bx - s.ax;
  const ey = s.by - s.ay;
  const len = Math.hypot(ex, ey);
  const nx = -ey / len;
  const ny = ex / len;
  if (s.one && (b.x - s.ax) * nx + (b.y - s.ay) * ny < 0) return -1;
  const t = along(s.ax, s.ay, s.bx, s.by, b.x, b.y);
  return contact(b, s.ax + ex * t, s.ay + ey * t, BALL_R, WALL_E, 0, 0, nx, ny);
}

/** @param {Ball} b @param {Round} r */
export const hitRound = (b, r) => contact(b, r.x, r.y, BALL_R + r.r, WALL_E);

/**
 * A flipper is a tapered bar. The point it hits with moves at w times its distance from the
 * pivot, so the tip hits harder than the base.
 * @param {Ball} b @param {FlipperSpot} spot @param {Flipper} f
 */
export function hitFlipper(b, spot, f) {
  const [tx, ty] = tipOf(spot, f);
  const t = along(spot.x, spot.y, tx, ty, b.x, b.y);
  const qx = spot.x + (tx - spot.x) * t;
  const qy = spot.y + (ty - spot.y) * t;
  const reach = BALL_R + FLIP_BASE_R + (FLIP_TIP_R - FLIP_BASE_R) * t;
  const rx = qx - spot.x;
  const ry = qy - spot.y;
  return contact(b, qx, qy, reach, FLIP_E, -f.w * ry, f.w * rx);
}

/** Add a kick along the last contact normal. @param {Ball} b @param {number} kick */
function kick(b, kick) {
  b.vx += b.nx * kick;
  b.vy += b.ny * kick;
}

/**
 * One substep for one ball: gravity, move, then every surface on the deck. `isUp` says whether a
 * drop target still stands. Hits are reported through `onHit`.
 * @param {Ball} b
 * @param {{ segs: Seg[], rounds: Round[], flippers: FlipperSpot[] }} deck
 * @param {Flipper[]} flippers
 * @param {(s: Seg) => boolean} isUp
 * @param {number} h seconds
 * @param {OnHit} onHit
 */
export function moveBall(b, deck, flippers, isUp, h, onHit) {
  b.vy += GRAVITY * h;
  const speed = Math.hypot(b.vx, b.vy);
  if (speed > MAX_SPEED) {
    b.vx *= MAX_SPEED / speed;
    b.vy *= MAX_SPEED / speed;
  }
  b.x += b.vx * h;
  b.y += b.vy * h;
  for (const s of deck.segs) {
    if (s.k === 'drop' && !isUp(s)) continue;
    const hit = hitSeg(b, s);
    if (hit < 0) continue;
    if (s.k === 'sling' && hit > HIT_MIN) kick(b, SLING_KICK);
    if (s.k !== 'wall' && hit > (s.k === 'drop' || s.k === 'sling' ? HIT_MIN : 0))
      onHit(s.k, s.id, b, hit);
  }
  for (const r of deck.rounds) {
    const hit = hitRound(b, r);
    if (hit <= 0 || r.k === 'post') continue;
    kick(b, BUMPER_KICK);
    onHit(r.k, r.id, b, hit);
  }
  deck.flippers.forEach((spot, i) => {
    hitFlipper(b, spot, flippers[i]);
  });
}
