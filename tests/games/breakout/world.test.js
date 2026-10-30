import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BRICK_COUNT, bricksLeft } from '../../../src/games/breakout/bricks.js';
import {
  BALL_SPEED_CAP,
  BALL_SPEED_CAP_REDUCED,
  BRICK_SCORE,
  EVENT_BOUNCE,
  EVENT_BRICK,
  EVENT_HIT,
  EVENT_LOST,
  EVENT_ROUND,
  EVENT_SERVE,
  LIVES,
  LOSE_T,
  MAX_BOUNCE,
  MIN_HEIGHT,
  MIN_VY_FRAC,
  MIN_WIDTH,
  SERVE_SPREAD,
  START_GRACE,
  WALL_BONUS,
} from '../../../src/games/breakout/tuning.js';
import {
  createWorld,
  paddleWFor,
  resizeWorld,
  speedFor,
  stepWorld,
} from '../../../src/games/breakout/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const EPS = 1e-9;
const still = () => ({ move: 0, targetX: null, serve: false });

/** Step `seconds` of world time with the intent `intentFor(w)` returns. */
function run(w, seconds, intentFor = still) {
  for (let i = 0; i < Math.round(seconds / DT) && !w.dead; i++) stepWorld(w, intentFor(w), DT);
  return w;
}

/** A world past the start grace, ball still on the paddle. */
const ready = (size = SIZE, seed = 1, options = {}) =>
  run(createWorld(size, seeded(seed), options), START_GRACE + DT);

/** Put the ball in flight at (x, y) with velocity (vx, vy). */
function launch(w, x, y, vx, vy) {
  Object.assign(w, { serving: false, served: true, bx: x, by: y, vx, vy });
  return w;
}

/** Step until one of the event bits fires, up to two seconds. */
function stepUntil(w, bits) {
  for (let i = 0; i < 120; i++) {
    stepWorld(w, still(), DT);
    if (w.events & bits) return w;
  }
  assert.fail(`no event ${bits} within two seconds`);
}

/** Aim the ball straight up at a brick from just below it. */
function aimAt(w, brick) {
  const r = w.rects[brick];
  return launch(w, r.x + r.w / 2, r.y + r.h + w.ballR + 2, 0, -speedFor(w));
}

const angleOf = (w) => Math.atan2(w.vx, -w.vy);

describe('serve', () => {
  test('the ball waits on the paddle and follows it until serve', () => {
    const w = ready();
    run(w, 1, () => ({ move: 1, targetX: null, serve: false }));
    assert.equal(w.serving, true);
    assert.ok(w.px > (w.left + w.right) / 2, 'the paddle moved right');
    assert.equal(w.bx, w.px);
    assert.equal(w.by, w.paddleY - w.ballR);
    run(w, 5);
    assert.equal(w.serving, true, 'it waits with no input');
  });

  test('a serve inside the start grace is the press that started the run', () => {
    const w = createWorld(SIZE, seeded(1));
    stepWorld(w, { move: 0, targetX: null, serve: true }, DT);
    assert.equal(w.serving, true);
  });

  test('serve sends the ball up within 20 degrees of straight up', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const w = ready(SIZE, seed);
      stepWorld(w, { move: 0, targetX: null, serve: true }, DT);
      assert.ok(w.events & EVENT_SERVE);
      assert.equal(w.serving, false);
      assert.ok(w.vy < 0);
      assert.ok(Math.abs(angleOf(w)) <= SERVE_SPREAD + EPS, `seed ${seed}`);
      assert.ok(Math.abs(Math.hypot(w.vx, w.vy) - speedFor(w)) < 1e-6);
    }
  });
});

describe('ball', () => {
  test('paddle bounce angle grows with the hit offset and stays within 60 degrees', () => {
    let last = -1;
    for (const k of [0, 0.25, 0.5, 0.75, 1, 1.1]) {
      const w = ready();
      const half = paddleWFor(w) / 2;
      launch(w, w.px + k * half, w.paddleY - w.ballR - 1, 0, speedFor(w));
      stepUntil(w, EVENT_BOUNCE);
      const angle = angleOf(w);
      assert.ok(w.vy < 0, 'the ball goes back up');
      assert.ok(angle >= last, `offset ${k}`);
      assert.ok(angle <= MAX_BOUNCE + EPS);
      last = angle;
    }
    assert.ok(Math.abs(last - MAX_BOUNCE) < EPS, 'the paddle edge gives the widest angle');
  });

  test('hitting a brick removes it, scores 10 per round, and raises an event', () => {
    const w = aimAt(ready(), 0);
    stepUntil(w, EVENT_BRICK);
    assert.equal(w.alive[0], 0);
    assert.equal(bricksLeft(w), BRICK_COUNT - 1);
    assert.equal(w.score, BRICK_SCORE);
    assert.ok(w.vy > 0, 'the ball bounces back down');
    w.round = 3;
    aimAt(w, 1);
    stepUntil(w, EVENT_BRICK);
    assert.equal(w.score, BRICK_SCORE + BRICK_SCORE * 3);
  });

  test('a flat hit leaves vertical speed of at least a quarter of the speed', () => {
    const w = ready();
    w.alive.fill(0);
    w.alive[0] = 1;
    w.alive[1] = 1;
    const r = w.rects[0];
    const speed = speedFor(w);
    launch(w, r.x - w.ballR - 2, r.y + r.h / 2, speed * 0.99, -speed * Math.sqrt(1 - 0.99 ** 2));
    stepUntil(w, EVENT_BRICK);
    assert.ok(w.vx < 0, 'the side hit sends it back left');
    assert.ok(Math.abs(w.vy) >= MIN_VY_FRAC * speed - EPS);
    assert.ok(Math.abs(Math.hypot(w.vx, w.vy) - speed) < 1e-6, 'speed is unchanged');
  });

  test('|vy| never drops below a quarter of the speed after any brick hit', () => {
    const w = ready(SIZE, 4);
    let hits = 0;
    run(w, 40, (world) => {
      if (world.events & EVENT_BRICK) {
        hits += 1;
        assert.ok(Math.abs(world.vy) >= MIN_VY_FRAC * speedFor(world) - EPS);
      }
      return { move: 0, targetX: world.bx + 9, serve: true };
    });
    assert.ok(hits > 5);
  });

  test('walls and ceiling keep the ball inside the play rect for 20 s', () => {
    const w = ready(SIZE, 2);
    for (let i = 0; i < 20 * 60; i++) {
      stepWorld(w, { move: 0, targetX: w.bx + 7, serve: true }, DT);
      assert.ok(w.bx >= w.left + w.ballR - EPS && w.bx <= w.right - w.ballR + EPS, `x at ${i}`);
      assert.ok(w.by >= w.ceiling + w.ballR - EPS && w.by <= w.paddleY, `y at ${i}`);
    }
    assert.equal(w.lives, LIVES);
  });
});

describe('rounds and lives', () => {
  test('clearing the wall starts round 2: faster ball, narrower paddle, 100 bonus', () => {
    const w = ready();
    const speed = speedFor(w);
    const paddleW = paddleWFor(w);
    w.alive.fill(0);
    w.alive[5] = 1;
    aimAt(w, 5);
    stepUntil(w, EVENT_ROUND);
    assert.equal(w.round, 2);
    assert.equal(w.score, BRICK_SCORE + WALL_BONUS);
    assert.equal(bricksLeft(w), BRICK_COUNT);
    assert.equal(w.serving, true);
    assert.ok(speedFor(w) > speed);
    assert.ok(paddleWFor(w) < paddleW);
  });

  test('speed and paddle width stop at their caps, lower speed with reduced motion', () => {
    const w = createWorld(SIZE, seeded(1));
    w.round = 1000;
    assert.equal(speedFor(w), BALL_SPEED_CAP * w.pace);
    assert.ok(paddleWFor(w) > 0);
    assert.equal(paddleWFor(w), paddleWFor({ ...w, round: 2000 }));
    w.reducedMotion = true;
    assert.equal(speedFor(w), BALL_SPEED_CAP_REDUCED * w.pace);
  });

  test('a ball below the bottom costs a life, then returns to serve', () => {
    const w = ready();
    launch(w, w.left + 30, w.bottom, 0, speedFor(w));
    stepUntil(w, EVENT_LOST);
    assert.equal(w.lives, LIVES - 1);
    assert.equal(w.losing, true);
    assert.equal(w.dead, false);
    run(w, LOSE_T + DT);
    assert.equal(w.losing, false);
    assert.equal(w.serving, true);
    assert.equal(w.bx, w.px);
  });

  test('the third lost ball ends the run with a lost hit', () => {
    const w = ready();
    for (let n = 0; n < LIVES; n++) {
      run(w, LOSE_T + DT);
      launch(w, w.right - 30, w.bottom, 0, speedFor(w));
      stepUntil(w, n < LIVES - 1 ? EVENT_LOST : EVENT_HIT);
    }
    assert.equal(w.dead, true);
    assert.equal(w.hit, 'lost');
    assert.equal(w.lives, 0);
  });

  test('pops fade out, and reduced motion makes none', () => {
    const w = aimAt(ready(), 0);
    stepUntil(w, EVENT_BRICK);
    assert.ok(w.pops.some((p) => p.active));
    run(w, 0.3);
    assert.ok(w.pops.every((p) => !p.active));
    const calm = aimAt(ready(SIZE, 1, { reducedMotion: true }), 0);
    stepUntil(calm, EVENT_BRICK);
    assert.ok(calm.pops.every((p) => !p.active));
  });

  test('the same seed and inputs give the same run', () => {
    const play = () => run(ready(SIZE, 9), 20, (w) => ({ move: 0, targetX: w.bx, serve: true }));
    const a = play();
    const b = play();
    assert.deepEqual([a.bx, a.by, a.score, a.lives], [b.bx, b.by, b.score, b.lives]);
  });
});

describe('resize', () => {
  for (const size of [
    { width: 375, height: 667 },
    { width: 2560, height: 1080 },
    { width: 320, height: 240 },
  ]) {
    test(`keeps everything inside and rebuilds the bricks at ${size.width}x${size.height}`, () => {
      const w = run(ready(SIZE, 3), 3, (world) => ({
        move: 0,
        targetX: world.bx + 5,
        serve: true,
      }));
      assert.equal(w.serving, false);
      resizeWorld(w, size);
      const half = paddleWFor(w) / 2;
      assert.ok(w.px - half >= w.left - EPS && w.px + half <= w.right + EPS);
      assert.ok(w.bx - w.ballR >= w.left - EPS && w.bx + w.ballR <= w.right + EPS);
      assert.ok(w.by - w.ballR >= w.ceiling - EPS && w.by + w.ballR <= w.bottom + EPS);
      assert.ok(Math.abs(Math.hypot(w.vx, w.vy) - speedFor(w)) < 1e-6, 'speed follows pace');
      assert.equal(w.rects.length, BRICK_COUNT);
      for (const r of w.rects) {
        assert.ok(r.x >= w.left && r.x + r.w <= w.right, 'brick inside the walls');
        assert.ok(r.y >= w.ceiling && r.y + r.h < w.paddleY, 'brick between HUD and paddle');
      }
      run(w, 2, (world) => ({ move: 0, targetX: world.bx, serve: true }));
      assert.equal(w.dead, false);
    });
  }

  test('a tiny canvas is treated as the minimum size', () => {
    const w = createWorld({ width: 0, height: 0 }, seeded(1));
    assert.equal(w.width, MIN_WIDTH);
    assert.equal(w.height, MIN_HEIGHT);
    assert.ok(w.paddleY > w.rects.at(-1).y + w.rects.at(-1).h);
    run(w, 2, (world) => ({ move: 0, targetX: world.bx, serve: true }));
  });
});
