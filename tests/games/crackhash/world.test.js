import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { along, TRACK } from '../../../src/games/crackhash/ring.js';
import {
  ARC_MAX,
  ARC_MIN,
  BENJO_DRAW,
  BUG_LOCK,
  EVENT_MISS,
  EVENT_OPEN,
  EVENT_POP,
  FIRST_ARC,
  HIT_HALF,
  OPEN_T,
  PINS_CAP,
  PINS_START,
  PINS_STEP,
  RING_R,
  SPEED_CAP,
  SPEED_CAP_REDUCED,
  SPEED_START,
  START_GRACE,
} from '../../../src/games/crackhash/tuning.js';
import {
  createWorld,
  layout,
  pinsFor,
  resizeWorld,
  speedFor,
  stepWorld,
} from '../../../src/games/crackhash/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 600 };
const SIZES = [
  SIZE,
  { width: 375, height: 667 },
  { width: 2560, height: 1080 },
  { width: 320, height: 240 },
];
const PRESS = { press: true };
const WAIT = { press: false };

/** A world past the start grace with Benjo `d` short of the target's middle and no bug. */
function before(d, seed = 1) {
  const w = createWorld(SIZE, seeded(seed));
  w.time = START_GRACE + DT;
  w.bug.active = false;
  w.target.s = (w.s + d + TRACK) % TRACK;
  return w;
}

describe('layout', () => {
  for (const size of SIZES) {
    test(`the ring fills most of the short side and Benjo fits at ${size.width}x${size.height}`, () => {
      const l = layout(size);
      const short = Math.min(l.width, l.bottom - l.ceiling);
      const top = (RING_R + BENJO_DRAW) * l.unit;
      assert.ok(l.ceiling >= 64);
      assert.ok(l.cy - top > l.ceiling && l.cy + top < l.bottom);
      assert.ok(l.cx - top > 0 && l.cx + top < l.width);
      assert.ok((2 * RING_R * l.unit) / short > 0.65, 'the ring is big');
      assert.ok(BENJO_DRAW / RING_R > 0.3, 'Benjo is not tiny next to it');
    });
  }

  test('a run starts at the top, clockwise, with the first target FIRST_ARC ahead', () => {
    const w = createWorld(SIZE, seeded(1));
    assert.deepEqual([w.s, w.dir, w.lock, w.pins, w.v], [0, 1, 1, PINS_START, SPEED_START]);
    assert.ok(Math.abs(along(w, w.s, w.target.s) - FIRST_ARC) < 1e-9);
    assert.equal(w.bug.active, false, 'no bugs in the first lock');
  });
});

describe('tapping', () => {
  test('the press that started the run does nothing', () => {
    const w = createWorld(SIZE, seeded(1));
    stepWorld(w, PRESS, DT);
    assert.equal(w.dead, false);
  });

  test('a tap on the target pops it, turns Benjo round, and puts the next one ahead', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = before(HIT_HALF - 2, seed);
      stepWorld(w, PRESS, DT);
      assert.ok(w.events & EVENT_POP);
      assert.deepEqual([w.score, w.pins, w.dir], [1, PINS_START - 1, -1]);
      const d = along(w, w.s, w.target.s);
      assert.ok(d >= ARC_MIN - 10 && d <= ARC_MAX, `next target ${d.toFixed(1)} ahead`);
    }
  });

  test('a tap off the target ends the run', () => {
    const w = before(HIT_HALF + 5);
    stepWorld(w, PRESS, DT);
    assert.ok(w.events & EVENT_MISS);
    assert.equal(w.cause, 'early');
  });

  test('running all the way past the target ends the run', () => {
    const w = before(0);
    let steps = 0;
    while (!w.dead) {
      stepWorld(w, WAIT, DT);
      steps += 1;
    }
    assert.equal(w.cause, 'past');
    assert.ok(Math.abs(steps * DT - HIT_HALF / SPEED_START) <= DT);
  });

  test('running over a bug is harmless; tapping on it ends the run', () => {
    const w = before(200);
    Object.assign(w.bug, { active: true, s: (w.s + 20) % TRACK });
    for (let i = 0; i < 20; i++) stepWorld(w, WAIT, DT);
    assert.equal(w.dead, false);
    Object.assign(w.bug, { s: w.s });
    stepWorld(w, PRESS, DT);
    assert.equal(w.cause, 'bug');
  });
});

describe('locks', () => {
  test('the last pin opens the lock: a flourish, then more pins and more speed', () => {
    const w = before(0);
    w.pins = 1;
    stepWorld(w, PRESS, DT);
    assert.ok(w.events & EVENT_OPEN);
    assert.deepEqual([w.lock, w.pins], [2, PINS_START + PINS_STEP]);
    assert.ok(w.v > SPEED_START);
    const s = w.s;
    for (let i = 0; i < Math.round(OPEN_T / DT) - 1; i++) stepWorld(w, PRESS, DT);
    assert.equal(w.dead, false, 'taps in the flourish are ignored');
    assert.equal(w.s, s, 'Benjo waits');
    stepWorld(w, WAIT, DT);
    assert.equal(w.target.active, true);
    assert.ok(Math.abs(along(w, w.s, w.target.s) - FIRST_ARC) < 1e-9);
  });

  test('pins and speed grow per lock up to their caps, lower with reduced motion', () => {
    assert.deepEqual([pinsFor(1), pinsFor(2), pinsFor(99)], [PINS_START, 7, PINS_CAP]);
    assert.equal(speedFor(1, false), SPEED_START);
    assert.equal(speedFor(99, false), SPEED_CAP);
    assert.equal(speedFor(99, true), SPEED_CAP_REDUCED);
    assert.ok(SPEED_CAP_REDUCED < SPEED_CAP);
  });

  test(`bugs start in lock ${BUG_LOCK}`, () => {
    let bugs = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const w = before(0, seed);
      w.lock = BUG_LOCK;
      stepWorld(w, PRESS, DT);
      if (w.bug.active) bugs += 1;
    }
    assert.ok(bugs > 0 && bugs < 20, `${bugs} of 20`);
  });
});

test('a resize keeps the run and only moves the drawing', () => {
  const w = before(200);
  for (let i = 0; i < 10; i++) stepWorld(w, WAIT, DT);
  const { s, score } = w;
  resizeWorld(w, { width: 375, height: 667 });
  assert.deepEqual([w.s, w.score], [s, score]);
  assert.equal(w.cx, 375 / 2);
});
