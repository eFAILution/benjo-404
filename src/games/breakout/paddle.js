// @ts-check
// Benjo's paddle and the fireball's motion for Break the 404: speed and paddle width per round,
// steering, the serve, and the bounces off the walls and the paddle. world.js runs the step.

import {
  BALL_SPEED_CAP,
  BALL_SPEED_CAP_REDUCED,
  BALL_SPEED_START,
  BALL_SPEED_STEP,
  EVENT_BOUNCE,
  EVENT_SERVE,
  MAGNET_PULL,
  MAX_BOUNCE,
  PADDLE_SPEED,
  PADDLE_W_MIN,
  PADDLE_W_MIN_PX,
  PADDLE_W_START,
  PADDLE_W_START_PX,
  PADDLE_W_STEP,
  POINTER_SPEED,
  SERVE_SPREAD,
} from './tuning.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {import('./world.js').Intent} Intent */

/** @param {number} v @param {number} lo @param {number} hi */
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Ball speed for the current round, capped. @param {World} w */
export function speedFor(w) {
  const cap = w.reducedMotion ? BALL_SPEED_CAP_REDUCED : BALL_SPEED_CAP;
  return Math.min(cap, BALL_SPEED_START + BALL_SPEED_STEP * (w.round - 1)) * w.pace;
}

/** Paddle width for the current round: narrower each round, down to a floor. @param {World} w */
export function paddleWFor(w) {
  const start = Math.max(PADDLE_W_START_PX, PADDLE_W_START * w.unit);
  const least = Math.max(PADDLE_W_MIN_PX, PADDLE_W_MIN * w.unit);
  return Math.max(least, start - PADDLE_W_STEP * w.unit * (w.round - 1));
}

/** Sit the ball on the paddle's center and clear its trail. @param {World} w */
export function holdBall(w) {
  w.bx = w.px;
  w.by = w.paddleY - w.ballR;
  w.vx = 0;
  w.vy = 0;
  w.trailX.fill(w.bx);
  w.trailY.fill(w.by);
}

/** @param {World} w @param {Intent} intent @param {number} dt */
export function movePaddle(w, intent, dt) {
  if (intent.move !== 0) {
    w.px += intent.move * PADDLE_SPEED * w.pace * dt;
    w.facing = intent.move;
  } else if (intent.targetX !== null) {
    const reach = POINTER_SPEED * w.pace * dt;
    const d = clamp(intent.targetX - w.px, -reach, reach);
    w.px += d;
    if (Math.abs(d) > 0.5) w.facing = d < 0 ? -1 : 1;
  }
  const half = paddleWFor(w) / 2;
  w.px = clamp(w.px, w.left + half, w.right - half);
}

/** @param {World} w */
export function serve(w) {
  const speed = speedFor(w);
  const angle = (w.random() * 2 - 1) * SERVE_SPREAD;
  w.vx = speed * Math.sin(angle);
  w.vy = -speed * Math.cos(angle);
  w.serving = false;
  w.served = true;
  w.events |= EVENT_SERVE;
}

/** Bounce off the side walls and the ceiling. @param {World} w */
export function bounceWalls(w) {
  const r = w.ballR;
  if (w.bx - r < w.left) {
    w.bx = w.left + r;
    w.vx = Math.abs(w.vx);
  } else if (w.bx + r > w.right) {
    w.bx = w.right - r;
    w.vx = -Math.abs(w.vx);
  }
  if (w.by - r < w.ceiling) {
    w.by = w.ceiling + r;
    w.vy = Math.abs(w.vy);
  }
}

/**
 * Bounce off the paddle top when falling onto it. The further from center, the wider the angle.
 * @param {World} w @param {number} speed
 */
export function bouncePaddle(w, speed) {
  const half = paddleWFor(w) / 2;
  const r = w.ballR;
  if (w.vy <= 0 || w.by + r < w.paddleY || w.by > w.paddleY + w.paddleH) return;
  if (Math.abs(w.bx - w.px) > half + r) return;
  const angle = clamp((w.bx - w.px) / half, -1, 1) * MAX_BOUNCE;
  w.vx = speed * Math.sin(angle);
  w.vy = -speed * Math.cos(angle);
  w.by = w.paddleY - r;
  w.events |= EVENT_BOUNCE;
}

/** Magnet: a falling fireball drifts sideways toward the paddle. @param {World} w @param {number} dt */
export function pullBall(w, dt) {
  if (w.vy <= 0) return;
  const reach = MAGNET_PULL * w.pace * dt;
  w.bx += clamp(w.px - w.bx, -reach, reach);
}
