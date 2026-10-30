// @ts-check
// The Break the 404 world and its fixed step. No DOM, no host: tests drive it directly.
//
// Benjo's paddle and fireball keep their previous positions so render can interpolate.
// Brick rects follow the layout; only the 38 alive flags are game state. The paddle and the
// ball's motion are in paddle.js.

import {
  BRICK_COUNT,
  bricksLeft,
  createRects,
  hitBrick,
  layoutBricks,
  lowestRow,
  refillBricks,
  rowOf,
} from './bricks.js';
import {
  bouncePaddle,
  bounceWalls,
  clamp,
  holdBall,
  movePaddle,
  paddleWFor,
  pullBall,
  serve,
} from './paddle.js';
import {
  BALL_R,
  BALL_R_MIN,
  BOTTOM_PAD,
  BRICK_GAP,
  BRICK_H_FRAC,
  BRICK_H_MAX,
  BRICK_SCORE,
  CEILING,
  CEILING_NARROW,
  CELL_MAX,
  EVENT_BRICK,
  EVENT_HIT,
  EVENT_LOST,
  EVENT_ROUND,
  GRACE_T,
  GRID_COLS,
  GRID_TOP,
  LIVES,
  LOSE_T,
  MIN_HEIGHT,
  MIN_WIDTH,
  NARROW_WIDTH,
  PADDLE_H,
  PADDLE_Y,
  PLAY_W_MAX,
  POP_POOL,
  POP_T,
  REF_HEIGHT,
  REF_PLAY_H,
  SIDE_PAD,
  START_GRACE,
  TRAIL,
  UNIT_MAX,
  UNIT_MIN,
  WALL_BONUS,
} from './tuning.js';

export { paddleWFor, speedFor } from './paddle.js';

/** @typedef {{ width: number, height: number }} Area */
/** @typedef {{ move: number, targetX: number | null, serve: boolean }} Intent */
/**
 * Power-up help from the host (#22), read during a step.
 * @typedef {{ magnet: boolean, absorb: () => boolean }} Aid
 */
/** @typedef {{ active: boolean, brick: number, t: number }} Pop */
/** @typedef {ReturnType<typeof layout>} Layout */
/**
 * @typedef {Layout & {
 *   px: number, prevPx: number, facing: number,
 *   bx: number, by: number, prevBx: number, prevBy: number, vx: number, vy: number,
 *   trailX: number[], trailY: number[],
 *   serving: boolean, served: boolean, losing: boolean, lostT: number,
 *   lives: number, round: number, score: number, bricksHit: number,
 *   time: number, dead: boolean, hit: 'lost' | null, deadT: number, graceT: number, events: number,
 *   reducedMotion: boolean, random: () => number,
 *   alive: Uint8Array, rects: import('./bricks.js').Rect[], pops: Pop[],
 * }} World
 */

/** @type {Intent} */
const IDLE = { move: 0, targetX: null, serve: false };

/** No power-ups: what a step gets from a host without them. @type {Aid} */
export const NO_AID = { magnet: false, absorb: () => false };

/** @param {Area} size */
function layout(size) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const unit = clamp(height / REF_HEIGHT, UNIT_MIN, UNIT_MAX);
  const ceiling = size.width < NARROW_WIDTH ? CEILING_NARROW : CEILING;
  const playW = Math.min(width - SIDE_PAD * 2, PLAY_W_MAX * unit);
  const left = (width - playW) / 2;
  const right = left + playW;
  const bottom = height - BOTTOM_PAD;
  const cell = Math.min((right - left) / GRID_COLS, CELL_MAX * unit);
  return {
    width,
    height,
    unit,
    pace: Math.max(unit, (bottom - ceiling) / REF_PLAY_H),
    ceiling,
    left,
    right,
    bottom,
    cell,
    brickW: cell - BRICK_GAP,
    brickH: Math.min(cell * BRICK_H_FRAC, BRICK_H_MAX * unit),
    gridLeft: (left + right - cell * GRID_COLS) / 2,
    gridTop: ceiling + GRID_TOP * unit,
    paddleY: bottom - PADDLE_Y * unit,
    paddleH: PADDLE_H * unit,
    ballR: Math.max(BALL_R_MIN, BALL_R * unit),
  };
}

/**
 * @template T
 * @param {number} n
 * @param {() => T} make
 * @returns {T[]}
 */
const pool = (n, make) => Array.from({ length: n }, make);

/**
 * @param {Area} size
 * @param {() => number} random
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {World}
 */
export function createWorld(size, random, options = {}) {
  const l = layout(size);
  const px = (l.left + l.right) / 2;
  /** @type {World} */
  const w = {
    ...l,
    px,
    prevPx: px,
    facing: 1,
    bx: px,
    by: 0,
    prevBx: px,
    prevBy: 0,
    vx: 0,
    vy: 0,
    trailX: pool(TRAIL, () => px),
    trailY: pool(TRAIL, () => 0),
    serving: true,
    served: false,
    losing: false,
    lostT: 0,
    lives: LIVES,
    round: 1,
    score: 0,
    bricksHit: 0,
    time: 0,
    dead: false,
    hit: null,
    deadT: 0,
    graceT: 0,
    events: 0,
    reducedMotion: Boolean(options.reducedMotion),
    random,
    alive: new Uint8Array(BRICK_COUNT),
    rects: createRects(),
    pops: pool(POP_POOL, () => ({ active: false, brick: 0, t: 0 })),
  };
  refillBricks(w);
  layoutBricks(w);
  holdBall(w);
  return w;
}

/**
 * @template {{ active: boolean }} T
 * @param {T[]} list
 * @returns {T | null}
 */
function free(list) {
  for (let i = 0; i < list.length; i++) if (!list[i].active) return list[i];
  return null;
}

/** @param {World} w @param {number} brick */
function popBrick(w, brick) {
  const p = w.reducedMotion ? null : free(w.pops);
  if (!p) return;
  p.active = true;
  p.brick = brick;
  p.t = 0;
}

/** Score a brick, and start the next round when the wall is gone. @param {World} w @param {number} brick */
function scoreBrick(w, brick) {
  w.score += BRICK_SCORE * w.round;
  w.bricksHit += 1;
  w.events |= EVENT_BRICK;
  popBrick(w, brick);
  if (bricksLeft(w) > 0) return;
  nextRound(w);
}

/**
 * Garbage Collector: the lowest row of live bricks pops at once and scores as if hit. A wall that
 * empties starts the next round as usual.
 * @param {World} w
 * @returns {number} bricks cleared
 */
export function clearRow(w) {
  const row = lowestRow(w);
  const { round } = w;
  let n = 0;
  for (let i = 0; i < BRICK_COUNT && w.round === round; i++) {
    if (!w.alive[i] || rowOf(i) !== row) continue;
    w.alive[i] = 0;
    n += 1;
    scoreBrick(w, i);
  }
  return n;
}

/** The wall is gone: bonus, a fresh wall, and the ball back on the paddle. @param {World} w */
function nextRound(w) {
  w.score += WALL_BONUS * w.round;
  w.round += 1;
  w.events |= EVENT_ROUND;
  refillBricks(w);
  w.serving = true;
  w.px = clamp(w.px, w.left + paddleWFor(w) / 2, w.right - paddleWFor(w) / 2);
  holdBall(w);
}

/** The ball fell past the bottom: a life gone, or the run. @param {World} w */
function loseBall(w) {
  w.lives -= 1;
  if (w.lives > 0) {
    w.losing = true;
    w.lostT = 0;
    w.events |= EVENT_LOST;
    return;
  }
  w.dead = true;
  w.hit = 'lost';
  w.deadT = 0;
  w.events |= EVENT_HIT;
}

/**
 * The ball fell past the bottom. The grace or a fresh twin bounces it back up off the floor;
 * otherwise it is lost.
 * @param {World} w @param {Aid} aid
 * @returns {boolean} true when the ball was saved
 */
function rescue(w, aid) {
  if (w.graceT <= 0) {
    if (!aid.absorb()) return false;
    w.graceT = GRACE_T;
  }
  w.by = w.bottom - w.ballR;
  w.vy = -Math.abs(w.vy);
  return true;
}

/**
 * Move the ball in sub-steps no longer than its radius, so it never tunnels through a brick.
 * @param {World} w @param {number} dt @param {Aid} aid
 */
function moveBall(w, dt, aid) {
  const speed = Math.hypot(w.vx, w.vy);
  const steps = Math.max(1, Math.ceil((speed * dt) / w.ballR));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    w.bx += w.vx * h;
    w.by += w.vy * h;
    bounceWalls(w);
    bouncePaddle(w, speed);
    const brick = hitBrick(w, speed);
    if (brick >= 0) {
      scoreBrick(w, brick);
      if (w.serving) return;
    }
    if (w.by > w.bottom + w.ballR && !rescue(w, aid)) {
      loseBall(w);
      return;
    }
  }
}

/** @param {World} w @param {number} dt */
function agePops(w, dt) {
  for (const p of w.pops) {
    if (!p.active) continue;
    p.t += dt;
    if (p.t >= POP_T) p.active = false;
  }
}

/** Remember where things were, for render interpolation and the trail. @param {World} w */
function keepPrevious(w) {
  w.prevPx = w.px;
  if (!w.serving && !w.losing) {
    w.trailX.copyWithin(1, 0);
    w.trailY.copyWithin(1, 0);
    w.trailX[0] = w.bx;
    w.trailY[0] = w.by;
  }
  w.prevBx = w.bx;
  w.prevBy = w.by;
}

/**
 * Advance the world one fixed step. Mutates and returns `w`.
 * @param {World} w
 * @param {Intent} intent
 * @param {number} dt
 * @param {Aid} [aid] power-up help; none by default
 * @returns {World}
 */
export function stepWorld(w, intent, dt, aid = NO_AID) {
  keepPrevious(w);
  w.events = 0;
  w.time += dt;
  agePops(w, dt);
  if (w.dead) {
    w.deadT += dt;
    return w;
  }
  w.graceT = Math.max(0, w.graceT - dt);
  if (w.losing) {
    w.lostT += dt;
    if (w.lostT < LOSE_T) return w;
    w.losing = false;
    w.serving = true;
  }
  const live = w.time > START_GRACE;
  movePaddle(w, live ? intent : IDLE, dt);
  if (w.serving) {
    holdBall(w);
    if (live && intent.serve) serve(w);
    return w;
  }
  if (aid.magnet) pullBall(w, dt);
  moveBall(w, dt, aid);
  return w;
}

/**
 * Fit a running world to a new canvas size. Positions scale with the play rect, speeds with
 * the pace, and the bricks are laid out again, so the run carries on where it was.
 * @param {World} w
 * @param {Area} size
 * @returns {World}
 */
export function resizeWorld(w, size) {
  const l = layout(size);
  const kx = (l.right - l.left) / (w.right - w.left);
  const ky = (l.bottom - l.ceiling) / (w.bottom - w.ceiling);
  const ku = l.pace / w.pace;
  /** @param {number} x */
  const sx = (x) => l.left + (x - w.left) * kx;
  /** @param {number} y */
  const sy = (y) => l.ceiling + (y - w.ceiling) * ky;
  w.px = sx(w.px);
  w.prevPx = sx(w.prevPx);
  w.bx = sx(w.bx);
  w.prevBx = sx(w.prevBx);
  w.by = sy(w.by);
  w.prevBy = sy(w.prevBy);
  for (let i = 0; i < TRAIL; i++) {
    w.trailX[i] = sx(w.trailX[i]);
    w.trailY[i] = sy(w.trailY[i]);
  }
  w.vx *= ku;
  w.vy *= ku;
  Object.assign(w, l);
  layoutBricks(w);
  const half = paddleWFor(w) / 2;
  w.px = clamp(w.px, w.left + half, w.right - half);
  if (w.serving) holdBall(w);
  w.bx = clamp(w.bx, w.left + w.ballR, w.right - w.ballR);
  w.by = clamp(w.by, w.ceiling + w.ballR, w.bottom - w.ballR);
  return w;
}
