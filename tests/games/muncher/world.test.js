import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  BENJO_START,
  BYTE_SCORE,
  CLEAR_T,
  HIT_T,
  LIVES,
  MAZE,
  MISS_SCORE,
  PELLET_SCORE,
  PEN_EXIT,
  READY_T,
  RELEASE_T,
} from '../../../src/games/muncher/tuning.js';
import {
  benjoCanEnter,
  benjoSpeed,
  COLS,
  cellAt,
  createWorld,
  DX,
  DY,
  missSpeed,
  ROWS,
  resizeWorld,
  scattering,
  stepWorld,
  targetOf,
} from '../../../src/games/muncher/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const NONE = { dir: -1 };
const RIGHT = 0;
const LEFT = 2;
const UP = 3;

/** Step `seconds` with one intent held. */
function run(w, seconds, intent = NONE) {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepWorld(w, intent, DT);
  return w;
}

/** Every cache miss parked in the pen for good, so Benjo can move about alone. */
function quiet(w) {
  for (const miss of w.misses) {
    Object.assign(miss, { col: 9, row: 9, dir: -1, t: 0, x: 9.5, y: 9.5, state: 'pen' });
    miss.waitT = Number.POSITIVE_INFINITY;
  }
  return w;
}

/** A quiet world past the ready pause. */
function ready(options = {}) {
  return run(quiet(createWorld(SIZE, seeded(1), options)), READY_T + DT);
}

/** Put a cache miss out on the board at a cell, standing. */
function missAt(w, index, col, row) {
  const miss = w.misses[index];
  Object.assign(miss, { col, row, dir: -1, t: 0, x: col + 0.5, y: row + 0.5, state: 'out' });
  return miss;
}

describe('maze', () => {
  test('every row is the same width and the edges are walls', () => {
    for (const row of MAZE) assert.equal(row.length, COLS);
    for (let col = 0; col < COLS; col++)
      assert.ok(!benjoCanEnter(col, 0) && !benjoCanEnter(col, ROWS - 1));
    for (let row = 0; row < ROWS; row++)
      assert.ok(!benjoCanEnter(0, row) && !benjoCanEnter(COLS - 1, row));
  });

  test('every path cell is connected, with no dead ends to be trapped in', () => {
    const open = [];
    for (let row = 0; row < ROWS; row++)
      for (let col = 0; col < COLS; col++) if (benjoCanEnter(col, row)) open.push([col, row]);
    const seen = new Set([open[0].join()]);
    const queue = [open[0]];
    for (let head = 0; head < queue.length; head++) {
      const [c, r] = queue[head];
      let ways = 0;
      for (let d = 0; d < 4; d++) {
        if (!benjoCanEnter(c + DX[d], r + DY[d])) continue;
        ways += 1;
        const key = `${c + DX[d]},${r + DY[d]}`;
        if (!seen.has(key)) {
          seen.add(key);
          queue.push([c + DX[d], r + DY[d]]);
        }
      }
      assert.ok(ways >= 2, `dead end at ${c},${r}`);
    }
    assert.equal(seen.size, open.length);
  });

  test('Benjo starts on an empty path, and the pen and its door are off limits to him', () => {
    assert.equal(cellAt(BENJO_START[0], BENJO_START[1]), ' ');
    assert.equal(cellAt(PEN_EXIT[0], PEN_EXIT[1] + 1), '=');
    assert.ok(!benjoCanEnter(PEN_EXIT[0], PEN_EXIT[1] + 1));
    assert.ok(!benjoCanEnter(9, 9));
  });

  test('the board fills with every byte and pellet', () => {
    const w = createWorld(SIZE, seeded(1));
    const count = MAZE.join('')
      .split('')
      .filter((c) => c === '.' || c === 'o').length;
    assert.equal(w.left, count);
    assert.equal([...w.bytes].filter((b) => b === 2).length, 4);
  });

  test('the board fits inside the play area below the HUD at every size', () => {
    for (const size of [
      SIZE,
      { width: 375, height: 667 },
      { width: 2560, height: 1080 },
      { width: 320, height: 240 },
    ]) {
      const w = resizeWorld(createWorld(SIZE, seeded(1)), size);
      assert.ok(w.boardX >= 0 && w.boardX + COLS * w.cell <= w.width + 1e-9, `${size.width} wide`);
      assert.ok(
        w.boardY >= w.ceiling - 1e-9 && w.boardY + ROWS * w.cell <= w.height + 1e-9,
        `${size.height} tall`,
      );
    }
  });
});

describe('Benjo', () => {
  test('nothing moves during the ready pause', () => {
    const w = quiet(createWorld(SIZE, seeded(1)));
    run(w, READY_T - 0.1, { dir: LEFT });
    assert.deepEqual([w.benjo.col, w.benjo.x], [BENJO_START[0], BENJO_START[0] + 0.5]);
  });

  test('moves the way asked, munches bytes on the way, and stops at a wall', () => {
    const w = ready();
    run(w, 2, { dir: LEFT });
    assert.equal(w.benjo.row, BENJO_START[1]);
    assert.equal(w.benjo.col, 4, 'stopped against the wall at column 3');
    assert.equal(w.benjo.dir, -1);
    assert.equal(w.score, 5 * BYTE_SCORE, 'columns 8 down to 4');
  });

  test('a turn asked early waits for the next opening', () => {
    const w = ready();
    stepWorld(w, { dir: LEFT }, DT);
    stepWorld(w, { dir: UP }, DT);
    assert.equal(w.benjo.dir, LEFT, 'no opening up yet');
    run(w, 1);
    assert.equal(w.benjo.col, 8, 'turned up at the first gap, column 8');
    assert.ok(w.benjo.row < BENJO_START[1]);
  });

  test('a reverse happens at once, mid cell', () => {
    const w = ready();
    run(w, 0.05, { dir: LEFT });
    const x = w.benjo.x;
    stepWorld(w, { dir: RIGHT }, DT);
    assert.equal(w.benjo.dir, RIGHT);
    assert.ok(w.benjo.x > x);
  });
});

describe('pellets and cache misses', () => {
  test('a pellet scores, turns the cache misses out gray, and sends them back the way they came', () => {
    const w = ready();
    const miss = missAt(w, 0, 9, 13);
    miss.dir = RIGHT;
    Object.assign(w.benjo, { col: 2, row: 15, dir: LEFT, t: 0 });
    run(w, 0.3, { dir: LEFT });
    assert.equal(w.score, PELLET_SCORE);
    assert.ok(w.frightT > 0);
    assert.equal(miss.frightened, true);
    assert.equal(miss.dir, LEFT);
  });

  test('munching gray cache misses doubles, and sends them back to the pen', () => {
    const w = ready();
    w.frightT = 5;
    for (const i of [0, 1]) {
      const miss = missAt(w, i, w.benjo.col, w.benjo.row);
      miss.frightened = true;
      run(w, DT);
    }
    assert.equal(w.score, MISS_SCORE + 2 * MISS_SCORE);
    assert.equal(w.munched, 2);
    for (const i of [0, 1]) assert.equal(w.misses[i].state, 'pen');
  });

  test('the cache misses wait in the pen in release order', () => {
    const w = createWorld(SIZE, seeded(1));
    assert.deepEqual(
      w.misses.map((m) => m.state),
      ['out', 'pen', 'pen', 'pen'],
    );
    assert.deepEqual(
      w.misses.map((m) => m.waitT),
      RELEASE_T,
    );
  });

  test('a released cache miss walks out through the door, which then shuts behind it', () => {
    const w = ready();
    const miss = w.misses[1];
    Object.assign(miss, { col: 8, row: 9, x: 8.5, y: 9.5, waitT: 0 });
    const cells = new Set();
    for (let i = 0; i < 120 && miss.state !== 'out'; i++) {
      run(w, DT);
      cells.add(cellAt(miss.col, miss.row));
    }
    assert.equal(miss.state, 'out');
    assert.deepEqual([miss.col, miss.row], PEN_EXIT);
    assert.ok(cells.has('='), 'it crossed the door');
    for (let i = 0; i < 180; i++) {
      run(w, DT);
      assert.ok(!'=G'.includes(cellAt(miss.col, miss.row)), 'it never goes back in');
    }
  });

  test('a cache miss chases Benjo, and scatters to its corner at the start', () => {
    const w = createWorld(SIZE, seeded(1));
    assert.equal(scattering(w), true);
    assert.deepEqual(targetOf(w, w.misses[0]), [17, 1]);
    w.modeT = 7;
    assert.equal(scattering(w), false);
    assert.deepEqual(targetOf(w, w.misses[0]), BENJO_START);
  });

  test('cache misses start slower than Benjo, and slower still while gray', () => {
    const w = createWorld(SIZE, seeded(1));
    assert.ok(missSpeed(w, w.misses[0]) < benjoSpeed(w));
    w.misses[0].frightened = true;
    assert.ok(missSpeed(w, w.misses[0]) < missSpeed(w, w.misses[1]));
  });
});

describe('lives and levels', () => {
  test('touching a cache miss costs a life, then everyone goes back to the start', () => {
    const w = ready();
    missAt(w, 0, w.benjo.col, w.benjo.row);
    run(w, DT);
    assert.equal(w.lives, LIVES - 1);
    run(w, HIT_T + DT);
    assert.deepEqual([w.benjo.col, w.benjo.row], BENJO_START);
    assert.equal(w.misses[0].state, 'out');
    assert.equal(w.misses[1].state, 'pen');
  });

  test('the last life ends the run', () => {
    const w = ready();
    w.lives = 1;
    missAt(w, 0, w.benjo.col, w.benjo.row);
    run(w, DT);
    assert.equal(w.dead, true);
  });

  test('munching the last byte starts a faster level with a full board', () => {
    const w = ready();
    const speed = benjoSpeed(w);
    w.bytes.fill(0);
    const i = BENJO_START[1] * COLS + BENJO_START[0] - 1;
    w.bytes[i] = 1;
    w.left = 1;
    run(w, 0.3, { dir: LEFT });
    assert.equal(w.left, 0);
    run(w, CLEAR_T + DT);
    assert.equal(w.level, 2);
    assert.ok(w.left > 100);
    assert.ok(benjoSpeed(w) > speed);
  });
});
