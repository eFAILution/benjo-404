import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { bugR, speedupFor, waveSize } from '../../../src/games/bugbelt/belt.js';
import {
  BUG_SCORE,
  EVENT_HIT,
  EVENT_ORB,
  EVENT_POP,
  EVENT_SHOT,
  EVENT_WAVE,
  FIRE_GAP,
  GRACE_T,
  LIVES,
  MAX_V,
  ORB_SCORE,
  RESPAWN_T,
  SHOT_POOL,
  SPEEDUP_CAP,
  SPEEDUP_CAP_REDUCED,
  START_GRACE,
  TURN_RATE,
  WAVE_BONUS,
  WAVE_MAX,
  WAVE_PAUSE,
  WAVE_START,
} from '../../../src/games/bugbelt/tuning.js';
import { createWorld, layout, resizeWorld, stepWorld } from '../../../src/games/bugbelt/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const SIZES = [
  SIZE,
  { width: 375, height: 667 },
  { width: 2560, height: 1080 },
  { width: 320, height: 240 },
];
const idle = () => ({ turn: 0, thrust: false, fire: false, firing: false, px: null, py: null });
const BIG = 0;
const SMALL = 2;

/** Step `seconds` with `intent(w)`. */
function run(w, seconds, intent = idle) {
  for (let i = 0; i < Math.round(seconds / DT) && !w.dead; i++) stepWorld(w, intent(w), DT);
  return w;
}

/** A world past the start grace with no bugs and no next wave coming. */
function quiet(size = SIZE, seed = 1) {
  const w = run(createWorld(size, seeded(seed)), START_GRACE + DT);
  for (const b of w.bugs) b.active = false;
  w.waveT = Number.POSITIVE_INFINITY;
  return w;
}

/** Park a still bug of `size` at (x, y). */
function bugAt(w, size, x, y) {
  const b = w.bugs.find((it) => !it.active);
  Object.assign(b, { active: true, size, x, y, prevX: x, prevY: y, vx: 0, vy: 0, spin: 0 });
  return b;
}

const active = (list) => list.filter((it) => it.active);

describe('layout', () => {
  for (const size of SIZES) {
    test(`the field fits under the HUD at ${size.width}x${size.height}`, () => {
      const l = layout(size);
      assert.ok(l.ceiling >= 64);
      assert.ok(l.bottom <= size.height);
      assert.ok(l.safeR * 2 < Math.min(l.width, l.bottom - l.ceiling));
    });
  }

  test('a new run starts with the ship still in the middle, pointing up', () => {
    const w = createWorld(SIZE, seeded(1));
    assert.equal(w.x, w.width / 2);
    assert.equal(w.y, (w.ceiling + w.bottom) / 2);
    assert.equal(w.a, -Math.PI / 2);
    assert.equal(w.lives, LIVES);
    assert.equal(active(w.bugs).length, WAVE_START);
  });
});

describe('the ship', () => {
  test('ignores input for the start grace', () => {
    const w = createWorld(SIZE, seeded(1));
    stepWorld(w, { ...idle(), turn: 1, thrust: true, fire: true }, DT);
    assert.equal(w.a, -Math.PI / 2);
    assert.equal(active(w.shots).length, 0);
  });

  test('turns with the keys at its turn rate', () => {
    const w = quiet();
    const a = w.a;
    run(w, 0.25, () => ({ ...idle(), turn: 1 }));
    assert.ok(Math.abs(w.a - (a + TURN_RATE * 0.25)) < 0.01);
  });

  test('thrusts along its heading, coasts slower, and tops out', () => {
    const w = quiet();
    run(w, 0.5, () => ({ ...idle(), thrust: true }));
    assert.ok(w.vy < 0 && Math.abs(w.vx) < 1e-9, 'up is -y');
    const fast = Math.hypot(w.vx, w.vy);
    run(w, 0.5);
    assert.ok(Math.hypot(w.vx, w.vy) < fast, 'drag slows it');
    run(w, 5, () => ({ ...idle(), thrust: true }));
    assert.ok(Math.hypot(w.vx, w.vy) <= MAX_V * w.unit + 1e-9);
  });

  test('wraps from one edge to the other', () => {
    const w = quiet();
    Object.assign(w, { x: w.width - 1, vx: 300, vy: 0, a: 0 });
    stepWorld(w, idle(), DT);
    assert.ok(w.x < 10);
    Object.assign(w, { y: w.ceiling + 1, vx: 0, vy: -300 });
    stepWorld(w, idle(), DT);
    assert.ok(w.y > w.bottom - 10);
  });

  test('a held pointer far away turns the ship and flies it there; a near one only aims', () => {
    const far = quiet();
    run(far, 1, (w) => ({ ...idle(), px: w.x + 300, py: w.y }));
    assert.ok(Math.abs(far.a) < 0.05 || Math.abs(far.a - 2 * Math.PI) < 0.05, 'nose points right');
    assert.ok(far.vx > 0, 'and it flies there');
    const near = quiet();
    run(near, 1, (w) => ({ ...idle(), px: w.x + 20, py: w.y }));
    assert.equal(near.vx, 0, 'a finger beside the ship only aims');
  });
});

describe('shots', () => {
  test('one press, one shot from the nose', () => {
    const w = quiet();
    stepWorld(w, { ...idle(), fire: true }, DT);
    assert.ok(w.events & EVENT_SHOT);
    const [s] = active(w.shots);
    assert.ok(s.y < w.y, 'ahead of an upward ship');
    assert.ok(s.vy < 0);
  });

  test('held fire shoots once per fire gap, and never more than the pool', () => {
    const w = quiet();
    let shots = 0;
    for (let i = 0; i < Math.round(1 / DT); i++) {
      stepWorld(w, { ...idle(), firing: true }, DT);
      if (w.events & EVENT_SHOT) shots += 1;
    }
    assert.ok(Math.abs(shots - Math.ceil(1 / FIRE_GAP)) <= 1, `${shots} shots`);
    for (let i = 0; i < 10; i++) stepWorld(w, { ...idle(), fire: true }, DT);
    assert.ok(active(w.shots).length <= SHOT_POOL);
  });

  test('a shot splits a big bug into two mediums, then two smalls each, and a small one pops', () => {
    const w = quiet();
    const sizes = [];
    for (let size = BIG; size <= SMALL; size++) {
      for (const b of w.bugs) b.active = false;
      bugAt(w, size, w.x, w.y - 120 * w.unit);
      const score = w.score;
      let presses = 1;
      run(w, 0.4, () => ({ ...idle(), fire: presses-- > 0 }));
      assert.equal(w.score, score + BUG_SCORE[size]);
      sizes.push(active(w.bugs).map((it) => it.size));
    }
    assert.deepEqual(sizes, [[1, 1], [2, 2], []]);
  });
});

describe('lives', () => {
  test('a bump costs a life; the ship comes back in the middle with grace once it is clear', () => {
    const w = quiet();
    bugAt(w, BIG, w.x, w.y);
    stepWorld(w, idle(), DT);
    assert.ok(w.events & EVENT_HIT);
    assert.ok(w.events & EVENT_POP, 'the bug that hit it splits');
    assert.equal(w.lives, LIVES - 1);
    assert.equal(w.alive, false);
    const blocker = bugAt(w, BIG, w.width / 2, (w.ceiling + w.bottom) / 2);
    run(w, RESPAWN_T + 0.5);
    assert.equal(w.alive, false, 'waits while the middle is crowded');
    blocker.active = false;
    for (const b of w.bugs) b.active = false;
    run(w, 2 * DT);
    assert.equal(w.alive, true);
    assert.ok(w.graceT > GRACE_T - 2 * DT);
  });

  test('the last bump ends the run', () => {
    const w = quiet();
    w.lives = 1;
    bugAt(w, SMALL, w.x, w.y);
    stepWorld(w, idle(), DT);
    assert.equal(w.dead, true);
  });
});

describe('waves', () => {
  test('a cleared belt scores a bonus, and the next wave has one more bug', () => {
    const w = run(createWorld(SIZE, seeded(3)), START_GRACE + DT);
    for (const b of w.bugs) b.active = false;
    const score = w.score;
    stepWorld(w, idle(), DT);
    assert.equal(w.score, score + WAVE_BONUS);
    let waved = false;
    for (let i = 0; i < Math.round(WAVE_PAUSE / DT) + 2; i++) {
      stepWorld(w, idle(), DT);
      waved ||= Boolean(w.events & EVENT_WAVE);
    }
    assert.ok(waved);
    assert.equal(w.wave, 2);
    assert.equal(active(w.bugs).length, WAVE_START + 1);
  });

  test('waves grow to a cap, and bugs speed up to a lower cap with reduced motion', () => {
    assert.equal(waveSize(1), WAVE_START);
    assert.equal(waveSize(99), WAVE_MAX);
    const w = createWorld(SIZE, seeded(1));
    w.wave = 99;
    assert.equal(speedupFor(w), SPEEDUP_CAP);
    w.reducedMotion = true;
    assert.equal(speedupFor(w), SPEEDUP_CAP_REDUCED);
  });
});

test('flying into an orb scores it', () => {
  const w = quiet();
  Object.assign(w.orbs[0], { active: true, x: w.x, y: w.y, vx: 0, vy: 0, life: 5 });
  stepWorld(w, idle(), DT);
  assert.ok(w.events & EVENT_ORB);
  assert.equal(w.score, ORB_SCORE);
});

test('a resize keeps everything at its share of the field', () => {
  const w = quiet();
  const b = bugAt(w, BIG, w.width / 4, w.ceiling + (w.bottom - w.ceiling) / 4);
  resizeWorld(w, { width: 375, height: 667 });
  assert.ok(Math.abs(b.x - w.width / 4) < 1e-6);
  assert.ok(Math.abs(b.y - (w.ceiling + (w.bottom - w.ceiling) / 4)) < 1e-6);
  assert.ok(Math.abs(w.x - w.width / 2) < 1e-6);
  assert.ok(bugR(w, BIG) > 0);
});
