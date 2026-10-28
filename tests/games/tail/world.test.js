import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  COLS_MIN,
  DOWN,
  LEFT,
  MOVE_T_MIN,
  MOVE_T_MIN_REDUCED,
  MOVE_T_START,
  MOVE_T_STEP,
  NONE,
  RIGHT,
  ROWS_MIN,
  START_GRACE,
  START_LEN,
  UP,
} from '../../../src/games/tail/tuning.js';
import {
  createWorld,
  moveTFor,
  nthFree,
  resizeWorld,
  segment,
  spawnFood,
  stepWorld,
} from '../../../src/games/tail/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };

/** Step `seconds` of world time with no input. */
function run(w, seconds) {
  for (let i = 0; i < Math.round(seconds / DT) && !w.dead; i++) stepWorld(w, NONE, DT);
  return w;
}

/** Step until the head has moved `moves` more times, steering with `turn` on the first step. */
function moves(w, count, turn = NONE) {
  let left = count;
  let head = w.head;
  let first = true;
  while (left > 0 && !w.dead) {
    stepWorld(w, first ? turn : NONE, DT);
    first = false;
    if (w.head !== head) {
      head = w.head;
      left -= 1;
    }
  }
  return w;
}

/** A world past the start grace, with the food moved out of the way. */
function waiting(size = SIZE, seed = 1, options = {}) {
  const w = run(createWorld(size, seeded(seed), options), START_GRACE + DT);
  placeFood(w, 0, 0);
  return w;
}

/** @returns {[number, number]} */
const headCell = (w) => [w.xs[w.head], w.ys[w.head]];

function placeFood(w, x, y) {
  w.foodX = x;
  w.foodY = y;
}

/** Count occupied cells. */
const filled = (w) => w.occupied.reduce((sum, v) => sum + v, 0);

describe('ready state', () => {
  test('holds still for 10 s with no input', () => {
    const w = createWorld(SIZE, seeded(1));
    const start = headCell(w);
    run(w, 10);
    assert.equal(w.ready, true);
    assert.equal(w.dead, false);
    assert.deepEqual(headCell(w), start);
  });

  test('left is ignored while ready because it reverses', () => {
    const w = waiting();
    stepWorld(w, LEFT, DT);
    run(w, 1);
    assert.equal(w.ready, true);
  });

  test('a turn inside the start grace is the press that started the run', () => {
    const w = createWorld(SIZE, seeded(1));
    stepWorld(w, UP, DT);
    assert.equal(w.ready, true);
  });

  for (const [name, dir, dx, dy] of [
    ['right', RIGHT, 1, 0],
    ['up', UP, 0, -1],
    ['down', DOWN, 0, 1],
  ]) {
    test(`${name} starts the run and moves the head that way`, () => {
      const w = waiting();
      const [x, y] = headCell(w);
      stepWorld(w, dir, DT);
      assert.equal(w.ready, false);
      assert.deepEqual(headCell(w), [x + dx, y + dy]);
    });
  }
});

describe('movement', () => {
  test('starts as a line of START_LEN at the grid center heading right', () => {
    const w = createWorld(SIZE, seeded(1));
    assert.equal(w.length, START_LEN);
    assert.deepEqual(headCell(w), [Math.floor(w.cols / 2), Math.floor(w.rows / 2)]);
    assert.equal(w.dir, RIGHT);
    assert.equal(filled(w), START_LEN);
  });

  test('advances exactly one cell per MOVE_T', () => {
    const w = waiting();
    const [x] = headCell(w);
    stepWorld(w, RIGHT, DT);
    const steps = Math.round((5.2 * MOVE_T_START) / DT);
    for (let i = 0; i < steps; i++) stepWorld(w, NONE, DT);
    assert.deepEqual(headCell(w)[0], x + 1 + 5);
    assert.equal(w.length, START_LEN);
    assert.equal(filled(w), START_LEN);
  });

  test('a reverse input is ignored', () => {
    const w = waiting();
    moves(w, 1, RIGHT);
    const [x, y] = headCell(w);
    moves(w, 1, LEFT);
    assert.equal(w.dead, false);
    assert.deepEqual(headCell(w), [x + 1, y]);
  });

  test('two queued turns apply on successive moves', () => {
    const w = waiting();
    moves(w, 1, RIGHT);
    const [x, y] = headCell(w);
    stepWorld(w, UP, DT);
    stepWorld(w, LEFT, DT);
    assert.equal(w.queued, 2);
    moves(w, 1);
    assert.deepEqual(headCell(w), [x, y - 1]);
    moves(w, 1);
    assert.deepEqual(headCell(w), [x - 1, y - 1]);
    assert.equal(w.dir, LEFT);
  });

  test('a third queued turn is dropped', () => {
    const w = waiting();
    moves(w, 1, RIGHT);
    stepWorld(w, UP, DT);
    stepWorld(w, LEFT, DT);
    stepWorld(w, DOWN, DT);
    assert.equal(w.queued, 2);
  });
});

describe('eating', () => {
  test('grows by one, scores one page, and speeds up', () => {
    const w = waiting();
    const [x, y] = headCell(w);
    placeFood(w, x + 1, y);
    moves(w, 1, RIGHT);
    assert.equal(w.length, START_LEN + 1);
    assert.equal(w.score, 1);
    assert.equal(w.moveT, MOVE_T_START - MOVE_T_STEP);
    assert.equal(filled(w), START_LEN + 1);
    assert.notDeepEqual([w.foodX, w.foodY], [x + 1, y]);
  });

  test('speed stops at the floor, higher with reduced motion', () => {
    const w = createWorld(SIZE, seeded(1));
    w.score = 1000;
    assert.equal(moveTFor(w), MOVE_T_MIN);
    w.reducedMotion = true;
    assert.equal(moveTFor(w), MOVE_T_MIN_REDUCED);
  });

  test('food never spawns on the snake', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const w = createWorld(SIZE, seeded(seed));
      for (let n = 0; n < 20; n++) {
        assert.equal(w.occupied[w.foodY * w.cols + w.foodX], 0, `seed ${seed}`);
        spawnFood(w);
      }
    }
  });

  test('the k-th free cell walk is exact', () => {
    const grid = new Uint8Array(9).fill(1);
    grid[5] = 0;
    assert.equal(nthFree(grid, 0), 5);
    assert.equal(nthFree(grid, 1), -1);
    const sparse = Uint8Array.from([1, 0, 1, 0, 0, 1, 1, 1, 0]);
    assert.deepEqual(
      [0, 1, 2, 3].map((k) => nthFree(sparse, k)),
      [1, 3, 4, 8],
    );
  });

  test('a 3x3 board with one free cell spawns there', () => {
    const w = createWorld(SIZE, seeded(3));
    w.cols = 3;
    w.rows = 3;
    w.occupied = new Uint8Array(9).fill(1);
    w.occupied[7] = 0;
    w.length = 8;
    spawnFood(w);
    assert.deepEqual([w.foodX, w.foodY], [1, 2]);
    assert.equal(w.dead, false);
  });

  test('a filled board ends the run as a win', () => {
    const w = waiting();
    const [x, y] = headCell(w);
    w.occupied.fill(1);
    w.occupied[y * w.cols + x + 1] = 0;
    w.length = w.cols * w.rows - 1;
    placeFood(w, x + 1, y);
    moves(w, 1, RIGHT);
    assert.equal(w.dead, true);
    assert.equal(w.hit, 'full');
    assert.equal(w.score, 1);
  });
});

describe('collisions', () => {
  test('running into the wall sets hit wall', () => {
    const w = waiting();
    moves(w, w.cols, RIGHT);
    assert.equal(w.dead, true);
    assert.equal(w.hit, 'wall');
    assert.equal(headCell(w)[0], w.cols - 1, 'the head stays inside the grid');
  });

  test('running into the tail sets hit tail', () => {
    const w = waiting();
    w.length = 6;
    const [x, y] = headCell(w);
    for (let i = 3; i < 6; i++) {
      const at = segment(w, i);
      w.xs[at] = x - i;
      w.ys[at] = y;
      w.occupied[y * w.cols + x - i] = 1;
    }
    moves(w, 1, UP);
    stepWorld(w, LEFT, DT);
    moves(w, 1);
    stepWorld(w, DOWN, DT);
    moves(w, 1);
    assert.equal(w.dead, true);
    assert.equal(w.hit, 'tail');
  });

  test('moving into the departing tip is allowed', () => {
    const w = waiting();
    w.length = 4;
    const [x, y] = headCell(w);
    const at = segment(w, 3);
    w.xs[at] = x - 3;
    w.ys[at] = y;
    w.occupied[y * w.cols + x - 3] = 1;
    moves(w, 1, UP);
    stepWorld(w, LEFT, DT);
    moves(w, 1);
    stepWorld(w, DOWN, DT);
    moves(w, 1);
    assert.equal(w.dead, false);
    assert.deepEqual(headCell(w), [x - 1, y]);
    assert.equal(filled(w), 4);
  });
});

describe('resize', () => {
  test('keeps cols and rows and moves nothing', () => {
    const w = waiting();
    moves(w, 3, UP);
    const before = { cols: w.cols, rows: w.rows, head: headCell(w), food: [w.foodX, w.foodY] };
    for (const size of [
      { width: 375, height: 667 },
      { width: 320, height: 240 },
      { width: 2560, height: 1080 },
    ]) {
      resizeWorld(w, size);
      assert.equal(w.cols, before.cols);
      assert.equal(w.rows, before.rows);
      assert.deepEqual(headCell(w), before.head);
      assert.deepEqual([w.foodX, w.foodY], before.food);
      assert.ok(w.cell >= 1);
      assert.ok(w.originX >= 16 && w.originX + w.cols * w.cell <= size.width - 16);
      assert.ok(w.originY >= w.ceiling && w.originY + w.rows * w.cell <= size.height - 16);
    }
  });

  test('a tiny canvas gives at least an 8x6 grid', () => {
    const w = createWorld({ width: 0, height: 0 }, seeded(1));
    assert.ok(w.cols >= COLS_MIN && w.rows >= ROWS_MIN);
    assert.ok(w.cell >= 1);
    run(w, 1);
  });
});
