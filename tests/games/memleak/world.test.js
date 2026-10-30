import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { cellAt, colTop, landing } from '../../../src/games/memleak/heap.js';
import {
  COLS,
  COMPACT_CHARGE,
  EVENT_COMPACT,
  EVENT_FLUSH,
  EVENT_FREE,
  EVENT_LAND,
  EVENT_OVERFLOW,
  EVENT_READY,
  FALL_CAP,
  FALL_CAP_REDUCED,
  FALL_START,
  FIRST_GAP,
  FREE_SCORE,
  GAP_MIN,
  GAP_START,
  LIFE_MAX,
  LIFE_SPREAD,
  LIFE_START,
  MAX_W,
  MIN_W,
  MOVE_DELAY,
  MOVE_GAP,
  ROW_BONUS,
  ROWS,
} from '../../../src/games/memleak/tuning.js';
import {
  createWorld,
  fallSpeed,
  gapFor,
  heapRect,
  layout,
  lifeFor,
  resizeWorld,
  SPAWN_Y,
  spawnX,
  stepWorld,
} from '../../../src/games/memleak/world.js';
import { DT, seeded } from '../runner/fake-host.js';
import { block, fall, idle, quiet, run, SIZE, SIZES, used } from './kit.js';

describe('layout', () => {
  for (const size of SIZES) {
    test(`the heap and its lane fit under the HUD at ${size.width}x${size.height}`, () => {
      const w = createWorld(size, seeded(1));
      const rect = heapRect(w);
      assert.ok(w.cell >= 8, `cells are ${w.cell} px`);
      assert.ok(rect.y >= w.ceiling);
      assert.ok(rect.y + rect.height <= w.bottom);
      assert.ok(rect.x >= 0 && w.left + (COLS + 0.8) * w.cell <= w.width, 'the meter fits too');
      assert.ok(Math.abs(rect.x + rect.width / 2 - w.width / 2) <= w.cell, 'roughly centered');
    });
  }

  test('a resize keeps the heap and only moves the layout', () => {
    const w = quiet();
    block(w, 2, 0, 3);
    resizeWorld(w, { width: 375, height: 667 });
    assert.deepEqual(layout({ width: 375, height: 667 }).cell, w.cell);
    assert.equal(colTop(w, 3), 1);
  });
});

describe('a new block', () => {
  test('appears after the first gap, in the middle at the top of the lane, 1 to 4 wide', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = createWorld(SIZE, seeded(seed));
      run(w, FIRST_GAP - 2 * DT);
      assert.equal(w.fall.active, false);
      run(w, 3 * DT);
      assert.equal(w.fall.active, true);
      assert.ok(w.fall.w >= MIN_W && w.fall.w <= MAX_W);
      assert.equal(w.fall.x, spawnX(w.fall.w));
      assert.ok(w.fall.y <= SPAWN_Y && w.fall.y > ROWS);
    }
  });

  test('shrinks to the widest width that fits when the planned one fits nowhere', () => {
    const w = quiet();
    // Every column but 0, 1 and 5 is full to the top; the top row never fills, so it never flushes.
    for (let col = 2; col < COLS; col++) if (col !== 5) block(w, col, ROWS - 1, 1);
    w.random = () => 0.99;
    w.spawnT = 0;
    stepWorld(w, idle(), DT);
    assert.equal(w.fall.active, true);
    assert.equal(w.fall.w, 2);
  });

  test('when not even a 1-wide block fits, the heap overflows and the run ends', () => {
    const w = quiet();
    for (let col = 0; col < COLS; col++) block(w, col, ROWS - 1, 1);
    w.spawnT = 0;
    stepWorld(w, idle(), DT);
    assert.equal(w.fall.active, false);
    assert.equal(w.dead, true);
    assert.ok(w.events & EVENT_OVERFLOW);
  });
});

describe('the falling block', () => {
  test('falls at the fall speed and lands on the highest used cell under any of its columns', () => {
    const w = quiet();
    block(w, 4, 0, 1);
    block(w, 4, 1, 1);
    block(w, 2, 0, 1);
    fall(w, 2, 3);
    const y = w.fall.y;
    stepWorld(w, idle(), DT);
    assert.ok(Math.abs(y - w.fall.y - FALL_START * DT) < 0.01);
    while (w.fall.active) stepWorld(w, idle(), DT);
    assert.equal(cellAt(w, 3, 2) >= 0, true, 'it rests on the taller column');
    assert.equal(cellAt(w, 3, 1), -1, 'leaving a hole under it');
  });

  test('Down drops it at once', () => {
    const w = quiet();
    fall(w, 3, 2);
    stepWorld(w, { ...idle(), drop: true }, DT);
    assert.ok(w.events & EVENT_LAND);
    assert.equal(w.fall.active, false);
    assert.equal(colTop(w, 3), 1);
    assert.equal(colTop(w, 4), 1);
  });

  test('slides freely in the lane, and not into a taller column inside the heap', () => {
    const w = quiet();
    for (let row = 0; row < 6; row++) block(w, 6, row, 1);
    fall(w, 4, 2);
    stepWorld(w, { ...idle(), dir: 1, fresh: true }, DT);
    assert.equal(w.fall.x, 5, 'over the tall column while still in the lane');
    fall(w, 4, 2, 3);
    stepWorld(w, { ...idle(), dir: 1, fresh: true }, DT);
    assert.equal(w.fall.x, 4, 'blocked by the column beside it');
    stepWorld(w, { ...idle(), dir: -1, fresh: true }, DT);
    assert.equal(w.fall.x, 3);
  });

  test('a held arrow moves once, waits, then repeats', () => {
    const w = quiet();
    fall(w, 4, 1);
    const moves = [];
    let x = w.fall.x;
    for (let i = 0; i < Math.round((MOVE_DELAY + 2.5 * MOVE_GAP) / DT); i++) {
      stepWorld(w, { ...idle(), dir: 1, fresh: i === 0 }, DT);
      if (w.fall.x !== x) moves.push(i * DT);
      x = w.fall.x;
    }
    assert.equal(moves.length, 4);
    assert.equal(moves[0], 0);
    assert.ok(Math.abs(moves[1] - MOVE_DELAY) <= DT);
    assert.ok(Math.abs(moves[2] - moves[1] - MOVE_GAP) <= DT);
  });

  test('a dragging finger moves it a column a step toward its column', () => {
    const w = quiet();
    fall(w, 4, 1);
    run(w, 3 * DT, () => ({ ...idle(), target: 1 }));
    assert.equal(w.fall.x, 1);
  });

  test('landing over a column full to the top overflows the heap', () => {
    const w = quiet();
    for (let row = 0; row < ROWS; row++) block(w, 5, row, 1);
    fall(w, 4, 2);
    run(w, 5);
    assert.equal(w.dead, true);
    assert.equal(w.fall.y, ROWS);
  });

  test('ignores input for the start grace', () => {
    const w = createWorld(SIZE, seeded(1));
    fall(w, 4, 1);
    stepWorld(w, { ...idle(), dir: 1, fresh: true, drop: true }, DT);
    assert.equal(w.fall.x, 4);
    assert.equal(w.fall.active, true);
  });
});

describe('blocks free themselves', () => {
  test('when their life runs out: points by size, a hole, and nothing above falls', () => {
    const w = quiet();
    block(w, 0, 0, 4, 0.5);
    block(w, 1, 1, 2);
    run(w, 0.5 + 2 * DT);
    assert.equal(w.score, FREE_SCORE[4]);
    assert.equal(cellAt(w, 0, 0), -1);
    assert.ok(cellAt(w, 1, 1) >= 0, 'the block above stays put');
    assert.equal(w.charge, 4);
  });

  test('a new block lives longer as the run goes on, within its spread', () => {
    const w = createWorld(SIZE, () => 0.5);
    assert.equal(lifeFor(w), LIFE_START);
    w.time = 1e6;
    assert.equal(lifeFor(w), LIFE_MAX);
    w.random = () => 0;
    assert.ok(Math.abs(lifeFor(w) - LIFE_MAX * (1 - LIFE_SPREAD)) < 1e-9);
  });
});

describe('compact', () => {
  test('needs a full meter, and freed blocks fill it', () => {
    const w = quiet();
    block(w, 0, 3, 2);
    stepWorld(w, { ...idle(), compact: true }, DT);
    assert.equal(colTop(w, 0), 4, 'nothing happens on an empty meter');
    let ready = 0;
    for (let i = 0; i < COMPACT_CHARGE; i++) {
      block(w, 9, 0, 1, DT / 2);
      stepWorld(w, idle(), DT);
      if (w.events & EVENT_READY) ready += 1;
      assert.ok(w.events & EVENT_FREE);
    }
    assert.equal(w.charge, COMPACT_CHARGE);
    assert.equal(ready, 1);
    stepWorld(w, { ...idle(), compact: true }, DT);
    assert.ok(w.events & EVENT_COMPACT);
    assert.equal(w.charge, 0);
    assert.equal(colTop(w, 0), 1);
  });

  test('every block falls as one piece until it rests on something', () => {
    const w = quiet();
    block(w, 0, 0, 1);
    block(w, 0, 4, 3); // rests on column 0 only
    block(w, 2, 7, 2); // lands on the 3-wide block's last cell
    block(w, 5, 9, 1); // falls to the floor
    w.charge = COMPACT_CHARGE;
    stepWorld(w, { ...idle(), compact: true }, DT);
    assert.equal(cellAt(w, 0, 1), cellAt(w, 2, 1), 'the 3-wide block sits on row 1');
    assert.ok(cellAt(w, 1, 0) < 0, 'with a hole under its middle');
    assert.ok(cellAt(w, 3, 2) >= 0 && cellAt(w, 2, 2) >= 0);
    assert.ok(cellAt(w, 5, 0) >= 0);
    assert.equal(used(w), 1 + 3 + 2 + 1);
  });

  test('rows a compact fills flush', () => {
    const w = quiet();
    block(w, 0, 0, 4);
    block(w, 4, 2, 4);
    block(w, 8, 5, 2);
    w.charge = COMPACT_CHARGE;
    stepWorld(w, { ...idle(), compact: true }, DT);
    assert.ok(w.events & EVENT_FLUSH);
    assert.equal(used(w), 0);
    assert.equal(w.score, ROW_BONUS + FREE_SCORE[4] * 2 + FREE_SCORE[2]);
  });
});

test('a full row flushes for a bonus and the points of its blocks; the rows above stay', () => {
  const w = quiet();
  block(w, 0, 0, 4);
  block(w, 4, 0, 4);
  block(w, 0, 1, 1);
  fall(w, 8, 2, 0.5);
  stepWorld(w, { ...idle(), drop: true }, DT);
  assert.ok(w.events & EVENT_FLUSH);
  assert.equal(w.flushes, 1);
  assert.equal(w.score, ROW_BONUS + 2 * FREE_SCORE[4] + FREE_SCORE[2]);
  assert.ok(cellAt(w, 0, 1) >= 0, 'the block above is still on row 1');
  assert.equal(landing(w, 0, 1), 2);
});

describe('pace', () => {
  test('falls faster and waits less over time, up to caps; the fall cap is lower with reduced motion', () => {
    const w = createWorld(SIZE, seeded(1));
    assert.equal(fallSpeed(w), FALL_START);
    assert.equal(gapFor(w), GAP_START);
    w.time = 60;
    assert.ok(fallSpeed(w) > FALL_START && gapFor(w) < GAP_START);
    w.time = 1e6;
    assert.equal(fallSpeed(w), FALL_CAP);
    assert.equal(gapFor(w), GAP_MIN);
    w.reducedMotion = true;
    assert.equal(fallSpeed(w), FALL_CAP_REDUCED);
    assert.ok(FALL_CAP_REDUCED < FALL_CAP);
  });
});
