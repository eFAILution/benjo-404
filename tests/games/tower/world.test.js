import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  BENJO_HALF_W,
  COMBO_T,
  EVENT_COMBO,
  EVENT_JUMP,
  FLOOR_GAP,
  FLOOR_SCORE,
  FLOOR_SHIFT,
  GRAVITY,
  JUMP_BASE,
  ORB_SCORE,
  REST_EVERY,
  RUN_MAX,
  SCROLL_CAP,
  SCROLL_CAP_REDUCED,
  SCROLL_FLOOR,
  START_GRACE,
  TOWER_W,
} from '../../../src/games/tower/tuning.js';
import {
  createWorld,
  floorAt,
  resizeWorld,
  scrollFor,
  stepWorld,
} from '../../../src/games/tower/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const idle = () => ({ mx: 0, jump: false, px: null });

/** Step `seconds` with `intent(w)`. */
function run(w, seconds, intent = idle) {
  for (let i = 0; i < Math.round(seconds / DT) && !w.dead; i++) stepWorld(w, intent(w), DT);
  return w;
}

/** A world past the start grace. */
const live = (seed = 1) => run(createWorld(SIZE, seeded(seed)), START_GRACE + DT);

/** Make floor `n` span the whole tower with nothing on it. */
function clearFloor(w, n) {
  Object.assign(floorAt(w, n), { n, x: 0, w: TOWER_W, bug: false, orb: false });
}

describe('floors', () => {
  test('the ground and every REST_EVERY-th floor span the tower', () => {
    const w = createWorld(SIZE, seeded(2));
    assert.deepEqual([floorAt(w, 0).x, floorAt(w, 0).w], [0, TOWER_W]);
    while (w.top < REST_EVERY) {
      w.camY += FLOOR_GAP;
      resizeWorld(w, SIZE);
    }
    assert.deepEqual([floorAt(w, REST_EVERY).x, floorAt(w, REST_EVERY).w], [0, TOWER_W]);
    assert.equal(floorAt(w, REST_EVERY).bug, false);
  });

  test("each floor's middle is within FLOOR_SHIFT of the floor below's, inside the tower", () => {
    const w = createWorld(SIZE, seeded(3));
    let below = floorAt(w, 0);
    let mid = below.x + below.w / 2;
    for (let n = 1; n < 120; n++) {
      w.camY += FLOOR_GAP;
      resizeWorld(w, SIZE);
      const f = floorAt(w, n);
      assert.equal(f.n, n);
      assert.ok(f.x >= 0 && f.x + f.w <= TOWER_W);
      if (n % REST_EVERY)
        assert.ok(Math.abs(f.x + f.w / 2 - mid) <= FLOOR_SHIFT + 1e-9, `floor ${n}`);
      mid = f.x + f.w / 2;
      below = f;
    }
  });

  test('a standing jump clears one floor, a running jump two', () => {
    const one = (JUMP_BASE * JUMP_BASE) / (2 * GRAVITY);
    assert.ok(one > FLOOR_GAP && one < 2 * FLOOR_GAP);
    const v = JUMP_BASE + 0.75 * RUN_MAX;
    const two = (v * v) / (2 * GRAVITY);
    assert.ok(two > 2 * FLOOR_GAP);
  });
});

describe('Benjo', () => {
  test('runs up to RUN_MAX and bounces off a wall', () => {
    const w = live();
    run(w, 0.6, () => ({ ...idle(), mx: 1 }));
    assert.ok(w.vx > 0);
    run(w, 1.2, () => ({ ...idle(), mx: 0 }));
    assert.ok(w.vx <= RUN_MAX);
    const fast = live();
    fast.x = TOWER_W - BENJO_HALF_W - 1;
    fast.vx = RUN_MAX;
    stepWorld(fast, idle(), DT);
    assert.ok(fast.vx < 0, 'turned round by the wall');
  });

  test('jumps up through the floor above and lands on it', () => {
    const w = live();
    clearFloor(w, 1);
    let events = 0;
    stepWorld(w, { ...idle(), jump: true }, DT);
    events |= w.events;
    run(w, 0.8);
    assert.ok(events & EVENT_JUMP);
    assert.equal(w.on, 1);
    assert.equal(w.y, FLOOR_GAP);
    assert.equal(w.best, 1);
    assert.equal(w.score, FLOOR_SCORE);
  });

  test('a held finger runs him toward it', () => {
    const w = live();
    run(w, 0.4, () => ({ ...idle(), px: w.ox + 300 * w.k }));
    assert.ok(w.x > TOWER_W / 2 + 10);
  });

  test('input inside the start grace is the press that started the run', () => {
    const w = createWorld(SIZE, seeded(1));
    stepWorld(w, { mx: 1, jump: true, px: null }, DT);
    assert.equal(w.on, 0);
    assert.equal(w.vx, 0);
  });
});

describe('combos', () => {
  test('two jumps of two floors each score their floors squared', () => {
    const w = live();
    for (let n = 1; n <= 6; n++) clearFloor(w, n);
    let events = 0;
    for (const target of [2, 4]) {
      w.vx = RUN_MAX;
      stepWorld(w, { ...idle(), mx: 1, jump: true }, DT);
      for (let i = 0; i < 90 && w.on !== target; i++) {
        stepWorld(w, { ...idle(), mx: w.x > 260 ? -1 : 1 }, DT);
        events |= w.events;
      }
      assert.equal(w.on, target);
    }
    run(w, COMBO_T + 0.1);
    for (let i = 0; i < 2; i++) events |= w.events;
    assert.equal(w.score, 4 * FLOOR_SCORE + 16);
    assert.equal(w.lastCombo, 4);
    assert.ok(EVENT_COMBO);
  });
});

describe('the view', () => {
  test(`starts climbing at floor ${SCROLL_FLOOR}, speeds up, and caps lower with reduced motion`, () => {
    const w = live();
    assert.equal(scrollFor(w), 0);
    w.best = SCROLL_FLOOR;
    const start = scrollFor(w);
    assert.ok(start > 0);
    w.scrollT = 600;
    assert.equal(scrollFor(w), SCROLL_CAP);
    w.reducedMotion = true;
    assert.equal(scrollFor(w), SCROLL_CAP_REDUCED);
  });

  test('falling off the bottom of the view ends the run', () => {
    const w = live();
    w.best = SCROLL_FLOOR;
    run(w, 20);
    assert.equal(w.dead, true);
    assert.equal(w.hit, 'fall');
  });
});

describe('bugs and orbs', () => {
  test('touching a bug ends the run', () => {
    const w = live();
    Object.assign(floorAt(w, 0), { bug: true, bx: w.x + 4, prevBx: w.x + 4, bdir: -1 });
    stepWorld(w, idle(), DT);
    assert.equal(w.dead, true);
    assert.equal(w.hit, 'bug');
  });

  test('a standing jump clears a bug crawling under Benjo, with time to spare', () => {
    // At the slowest bug speed, any jump from 13 to 17 units before the bug reaches Benjo clears it.
    for (const d of [13, 15, 17]) {
      const w = live();
      Object.assign(floorAt(w, 0), { bug: true, bx: w.x + d, prevBx: w.x + d, bdir: -1 });
      floorAt(w, 1).w = 0;
      stepWorld(w, { ...idle(), jump: true }, DT);
      run(w, 1);
      assert.equal(w.dead, false, `jumping at ${d}`);
    }
  });

  test('a bug that reaches Benjo standing still ends the run', () => {
    const w = live();
    Object.assign(floorAt(w, 0), { bug: true, bx: w.x + 40, prevBx: w.x + 40, bdir: -1 });
    run(w, 2);
    assert.equal(w.dead, true);
  });

  test('an orb scores when Benjo runs into it', () => {
    const w = live();
    Object.assign(floorAt(w, 0), { orb: true, ox: w.x + 20 });
    run(w, 0.4, () => ({ ...idle(), mx: 1 }));
    assert.equal(w.score, ORB_SCORE);
  });
});

test('a resize keeps Benjo and the view where they are in the tower', () => {
  const w = live();
  run(w, 0.3, () => ({ ...idle(), mx: 1 }));
  const { x, y, camY } = w;
  resizeWorld(w, { width: 375, height: 667 });
  assert.equal(w.width, 375);
  assert.deepEqual([w.x, w.y, w.camY], [x, y, camY]);
  assert.ok(w.ox >= 0 && w.ox + TOWER_W * w.k <= w.width + 1e-9);
});
