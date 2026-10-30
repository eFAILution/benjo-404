import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  CORNER,
  createBoard,
  E,
  endCell,
  flood,
  generateBoard,
  N,
  rotate,
  S,
  STRAIGHT,
  startCell,
  W,
} from '../../../src/games/links/board.js';
import {
  BOARD_SCORE,
  CLOCK_CAP,
  CLOCK_START,
  MIN_HEIGHT,
  MIN_WIDTH,
  SOLVE_BONUS_T,
  SOLVED_T,
  START_GRACE,
} from '../../../src/games/links/tuning.js';
import {
  boardSize,
  createWorld,
  resizeWorld,
  stepWorld,
  tileAt,
} from '../../../src/games/links/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const BOARDS = [
  [4, 4],
  [5, 4],
  [5, 5],
  [6, 5],
];

const idle = () => ({ dx: 0, dy: 0, turn: false, tapTile: -1 });

/** Step `seconds` of world time with the same intent each step. */
function run(w, seconds, intent = idle()) {
  for (let i = 0; i < Math.round(seconds / DT) && !w.dead; i++) stepWorld(w, intent, DT);
  return w;
}

/** A world past the start grace, ready for input. */
const ready = (seed = 1, options = {}) => run(createWorld(SIZE, seeded(seed), options), 0.2);

/** Set every tile to its solved mask except one, which is turned one step short. */
function almostSolve(w) {
  const b = w.board;
  b.mask.set(b.solved);
  const cell = startCell(b);
  b.mask[cell] = rotate(rotate(rotate(b.solved[cell])));
  flood(b);
  return cell;
}

describe('board', () => {
  test('rotate maps N to E to S to W and cycles back in four turns', () => {
    assert.equal(rotate(N), E);
    assert.equal(rotate(E), S);
    assert.equal(rotate(S), W);
    assert.equal(rotate(W), N);
    for (let m = 0; m < 16; m++) assert.equal(rotate(rotate(rotate(rotate(m)))), m);
    assert.equal(rotate(STRAIGHT), E | W);
    assert.equal(rotate(CORNER), E | S);
  });

  test('the flood joins two tiles only when both arms meet', () => {
    const b = createBoard();
    generateBoard(b, 4, 4, seeded(1));
    b.mask.fill(0);
    b.startRow = 0;
    b.endRow = 0;
    b.mask[0] = W | E;
    b.mask[1] = N | S;
    flood(b);
    assert.equal(b.lit[1], 0, 'one arm alone does not connect');
    b.mask[1] = W | E;
    b.mask[2] = W | E;
    b.mask[3] = W;
    assert.equal(flood(b), false, 'the end tile needs its E arm');
    assert.equal(b.lit[3], 1);
    b.mask[3] = W | E;
    assert.equal(flood(b), true);
    b.mask[0] = N | E;
    assert.equal(flood(b), false, 'the start tile needs its W arm');
    assert.equal(b.lit[0], 0);
  });

  for (const [cols, rows] of BOARDS) {
    test(`${cols}x${rows} boards are solvable from solvedMask and start scrambled`, () => {
      const b = createBoard();
      for (let seed = 1; seed <= 300; seed++) {
        generateBoard(b, cols, rows, seeded(seed));
        assert.equal(flood(b), false, `seed ${seed} starts solved`);
        assert.ok(b.solved[startCell(b)] & W, `seed ${seed} start lacks W`);
        assert.ok(b.solved[endCell(b)] & E, `seed ${seed} end lacks E`);
        for (let cell = 0; cell < cols * rows; cell++) assert.notEqual(b.mask[cell], 0);
        b.mask.set(b.solved);
        assert.equal(flood(b), true, `seed ${seed} is not solvable`);
      }
    });
  }

  test('the same seed deals the same board', () => {
    const a = generateBoard(createBoard(), 6, 5, seeded(9));
    const b = generateBoard(createBoard(), 6, 5, seeded(9));
    assert.deepEqual(a.mask, b.mask);
    assert.deepEqual(a.solved, b.solved);
    assert.equal(a.startRow, b.startRow);
  });
});

describe('world', () => {
  test('starts on a 4x4 board with a 60 s clock and the cursor on the start tile', () => {
    const w = createWorld(SIZE, seeded(1));
    assert.equal(w.board.cols, 4);
    assert.equal(w.board.rows, 4);
    assert.equal(w.clock, CLOCK_START);
    assert.equal(w.cursor, startCell(w.board));
  });

  test('input in the start grace is ignored', () => {
    const w = createWorld(SIZE, seeded(1));
    const before = w.board.mask.slice();
    stepWorld(w, { dx: 1, dy: 0, turn: true, tapTile: -1 }, DT);
    assert.ok(w.time < START_GRACE);
    assert.deepEqual(w.board.mask, before);
  });

  test('a turn on the cursor tile updates the flood', () => {
    const w = ready();
    const cell = almostSolve(w);
    assert.equal(w.cursor, cell);
    assert.equal(w.board.lit[endCell(w.board)], 0);
    stepWorld(w, { dx: 0, dy: 0, turn: true, tapTile: -1 }, DT);
    assert.equal(w.board.mask[cell], w.board.solved[cell]);
    assert.equal(w.board.lit[endCell(w.board)], 1);
    assert.equal(w.connected, true);
  });

  test('solving scores 100 x round plus the clock, adds 15 s, then deals the next size', () => {
    const w = ready();
    const clock = w.clock;
    almostSolve(w);
    stepWorld(w, { dx: 0, dy: 0, turn: true, tapTile: -1 }, DT);
    assert.equal(w.score, BOARD_SCORE * 1 + Math.floor(clock));
    assert.equal(w.clock, clock + SOLVE_BONUS_T);
    run(w, SOLVED_T / 2, { dx: 1, dy: 0, turn: true, tapTile: -1 });
    assert.equal(w.round, 1, 'input waits during the solved pause');
    assert.equal(w.clock, clock + SOLVE_BONUS_T, 'the clock waits too');
    run(w, SOLVED_T / 2 + DT * 2);
    assert.equal(w.round, 2);
    assert.equal(w.board.cols, 5);
    assert.equal(w.board.rows, 4);
    assert.equal(w.cursor, startCell(w.board));
    assert.equal(w.connected, false);
    assert.equal(flood(w.board), false);
  });

  test('the clock bonus is capped at 90 s', () => {
    const w = ready();
    w.clock = CLOCK_CAP - 5;
    almostSolve(w);
    stepWorld(w, { dx: 0, dy: 0, turn: true, tapTile: -1 }, DT);
    assert.equal(w.clock, CLOCK_CAP);
  });

  test('board size follows the round and holds at 6x5', () => {
    assert.deepEqual(boardSize(1), { cols: 4, rows: 4 });
    assert.deepEqual(boardSize(2), { cols: 5, rows: 4 });
    assert.deepEqual(boardSize(3), { cols: 5, rows: 5 });
    assert.deepEqual(boardSize(4), { cols: 6, rows: 5 });
    assert.deepEqual(boardSize(12), { cols: 6, rows: 5 });
  });

  test('the clock reaching 0 ends the run', () => {
    const w = run(createWorld(SIZE, seeded(1)), CLOCK_START - 0.5);
    assert.equal(w.dead, false);
    run(w, 1);
    assert.equal(w.dead, true);
    assert.equal(w.clock, 0);
  });

  test('the cursor clamps to the board', () => {
    const w = ready();
    run(w, 1, { dx: -1, dy: -1, turn: false, tapTile: -1 });
    assert.equal(w.cursor, 0);
    run(w, 1, { dx: 1, dy: 1, turn: false, tapTile: -1 });
    assert.equal(w.cursor, w.board.cols * w.board.rows - 1);
  });

  test('a tap turns that tile and moves the cursor to it', () => {
    const w = ready();
    const before = w.board.mask[5];
    stepWorld(w, { dx: 0, dy: 0, turn: false, tapTile: 5 }, DT);
    assert.equal(w.cursor, 5);
    assert.equal(w.board.mask[5], rotate(before));
  });

  test('tileAt maps tile centers back to their index and misses outside', () => {
    const w = ready();
    const half = w.tile / 2;
    assert.equal(tileAt(w, w.boardLeft + half, w.boardTop + half), 0);
    assert.equal(tileAt(w, w.boardLeft + w.tile * 3 + half, w.boardTop + w.tile + half), 7);
    assert.equal(tileAt(w, w.boardLeft - 1, w.boardTop + half), -1);
    assert.equal(tileAt(w, w.boardLeft + half, w.boardTop + w.tile * 4 + 1), -1);
  });

  test('resize changes no tile and keeps the board and Benjo inside the play area', () => {
    const w = ready();
    run(w, 0.2, { dx: 1, dy: 0, turn: true, tapTile: -1 });
    const masks = w.board.mask.slice();
    const cursor = w.cursor;
    for (const size of [
      { width: 320, height: 480 },
      { width: 320, height: 240 },
      { width: 2560, height: 1080 },
    ]) {
      resizeWorld(w, size);
      assert.deepEqual(w.board.mask, masks);
      assert.equal(w.cursor, cursor);
      assert.ok(w.boardLeft - w.tile * 1.05 >= 0, `${size.width} Benjo off the left`);
      assert.ok(w.boardLeft + w.tile * (w.board.cols + 1.05) <= w.width, 'home off the right');
      assert.ok(w.boardTop > w.barY + w.barH, 'board under the timer bar');
      assert.ok(w.boardTop + w.tile * w.board.rows <= w.height, 'board above the bottom');
      assert.ok(w.barY >= w.ceiling, 'bar below the HUD strip');
    }
  });

  test('a tiny canvas is treated as the minimum', () => {
    const w = createWorld({ width: 0, height: 0 }, seeded(1));
    assert.equal(w.width, MIN_WIDTH);
    assert.equal(w.height, MIN_HEIGHT);
    assert.ok(w.tile >= 1);
    run(w, 1, { dx: 1, dy: 0, turn: true, tapTile: -1 });
  });
});
