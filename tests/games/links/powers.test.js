import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cursorX, cursorY } from '../../../src/games/links/draw.js';
import links from '../../../src/games/links/index.js';
import {
  CLOCK_START,
  END_T,
  GC_FIX,
  START_GRACE,
  TWIN_CLOCK,
} from '../../../src/games/links/tuning.js';
import { createWorld, fixTiles, stepWorld } from '../../../src/games/links/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const NONE = { dx: 0, dy: 0, turn: false, tapTile: -1 };

/** Run the instance like the host loop: update then render, rolling input each tick. */
function play(host, game, seconds, beforeTick = () => {}) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps && host.log.ends.length === 0; i++) {
    beforeTick(i * DT, host.input);
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
}

/** A power port with `twins` Digital Twins in hand. Counts every absorb() call. */
function powerPort(twins = 0) {
  const port = {
    twins,
    calls: 0,
    active: () => false,
    absorb() {
      port.calls += 1;
      if (port.twins <= 0) return false;
      port.twins -= 1;
      return true;
    },
  };
  return port;
}

/** A world past the start grace with `clock` seconds left. */
function ready(clock = CLOCK_START, seed = 1) {
  const w = createWorld(SIZE, seeded(seed));
  for (let i = 0; i <= Math.round(START_GRACE / DT); i++) stepWorld(w, NONE, DT);
  w.clock = clock;
  return w;
}

/** Path tiles not at their solved turn. */
function wrongTiles(w) {
  const b = w.board;
  const out = [];
  for (let cell = 0; cell < b.cols * b.rows; cell++) {
    if (b.path[cell] && b.mask[cell] !== b.solved[cell]) out.push(cell);
  }
  return out;
}

describe('module', () => {
  test('lists the twin, rollback, and the collector, but not the magnet', () => {
    assert.deepEqual(links.powers, ['twin', 'rollback', 'gc']);
  });
});

describe('Digital Twin', () => {
  test('puts time back when the clock runs out, once', () => {
    const w = ready(DT / 2);
    let calls = 0;
    let twins = 1;
    const assist = {
      absorb: () => {
        calls += 1;
        return twins-- > 0;
      },
    };
    stepWorld(w, NONE, DT, assist);
    assert.equal(w.dead, false);
    assert.equal(w.clock, TWIN_CLOCK);
    assert.equal(w.prevClock, w.clock, 'the bar jumps instead of tweening from empty');
    assert.equal(calls, 1);
    for (let i = 0; i < Math.round(TWIN_CLOCK / DT) + 2 && !w.dead; i++) {
      stepWorld(w, NONE, DT, assist);
    }
    assert.equal(w.dead, true, 'the second time out ends the run');
    assert.equal(calls, 2);
  });

  test('the clock running down never asks the twin before it hits zero', () => {
    const w = ready(5);
    let calls = 0;
    const assist = {
      absorb: () => {
        calls += 1;
        return true;
      },
    };
    for (let i = 0; i < Math.round(4.9 / DT); i++) stepWorld(w, NONE, DT, assist);
    assert.equal(calls, 0);
  });

  test('the instance plays on past 60 s with a twin, then ends', () => {
    const port = powerPort(1);
    const host = fakeHost({ power: port });
    const game = links.create(host);
    game.start();
    play(host, game, 60 + END_T + 1);
    assert.equal(host.log.ends.length, 0, 'the twin took the time out');
    assert.equal(port.twins, 0);
    play(host, game, TWIN_CLOCK);
    assert.equal(host.log.ends.length, 1);
    assert.equal(port.calls, 2);
  });
});

describe('Garbage Collector', () => {
  test(`fixes up to ${GC_FIX} wrong path tiles, leftmost first`, () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = ready(CLOCK_START, seed);
      const before = wrongTiles(w);
      const col = (cell) => cell % w.board.cols;
      const fixed = fixTiles(w);
      const after = wrongTiles(w);
      assert.equal(fixed, Math.min(GC_FIX, before.length), `seed ${seed}`);
      assert.equal(after.length, before.length - fixed);
      const done = before.filter((cell) => !after.includes(cell));
      const leftmostLeft = Math.min(...after.map(col), Number.POSITIVE_INFINITY);
      for (const cell of done) assert.ok(col(cell) <= leftmostLeft, `seed ${seed} cell ${cell}`);
      assert.equal(w.turns, 0, 'fixes are not player turns');
    }
  });

  test('keeps collecting until the board is solved and scored', () => {
    const w = ready();
    let rounds = 0;
    while (!w.connected && rounds < 20) {
      assert.ok(fixTiles(w) > 0);
      rounds += 1;
    }
    assert.equal(w.connected, true);
    assert.equal(w.solves, 1);
    assert.ok(w.score > 0);
    assert.equal(fixTiles(w), 0, 'nothing to fix on a solved board');
  });

  test('fixes nothing after time is up', () => {
    const w = ready();
    w.dead = true;
    assert.equal(fixTiles(w), 0);
  });

  test('the instance returns the count, and a solve scores and says so at once', () => {
    const host = fakeHost();
    const game = links.create(host);
    game.start();
    play(host, game, 0.5);
    let total = 0;
    for (let i = 0; i < 20 && host.log.scores.at(-1) === 0; i++) {
      const fixed = game.collect();
      assert.ok(fixed > 0 && fixed <= GC_FIX);
      total += fixed;
    }
    assert.ok(total > 0);
    assert.ok(host.log.scores.at(-1) > 0, 'the score shows before the next update');
    assert.equal(host.log.statuses.at(-1), 'LINK FIXED');
    assert.equal(game.collect(), 0);
  });

  test('collect before start, after the end, or after destroy returns 0', () => {
    const host = fakeHost();
    const game = links.create(host);
    assert.equal(game.collect(), 0);
    game.start();
    play(host, game, 61);
    assert.equal(host.log.ends.length, 1);
    assert.equal(game.collect(), 0);
    game.destroy();
    assert.equal(game.collect(), 0);
  });
});

describe('Rollback', () => {
  test('snapshot before start is null and restore(null) does nothing', () => {
    const game = links.create(fakeHost());
    assert.equal(game.snapshot(), null);
    game.restore(null);
  });

  test('a snapshot is not changed by later updates', () => {
    const host = fakeHost();
    const game = links.create(host);
    game.start();
    play(host, game, 1);
    const snap = game.snapshot();
    const copy = structuredClone(snap);
    game.collect();
    play(host, game, 2, (t, input) => {
      if (Math.round(t / DT) % 10 === 0) input.pressed.add('primary');
    });
    assert.deepEqual(snap, copy);
  });

  test('restore after a time out puts the board back and the run plays on', () => {
    const host = fakeHost();
    const game = links.create(host);
    game.start();
    play(host, game, 1);
    while (host.log.scores.at(-1) === 0) game.collect();
    play(host, game, 1);
    const score = host.log.scores.at(-1);
    assert.ok(score > 0);
    game.collect();
    play(host, game, 50);
    const snap = game.snapshot();
    const copy = structuredClone(snap);
    play(host, game, 120);
    assert.equal(host.log.ends.length, 1);
    game.restore(snap);
    assert.equal(host.log.scores.at(-1), score, 'the HUD score is back');
    assert.deepEqual(game.snapshot(), copy, 'the board and clock are back');
    host.log.ends.length = 0;
    play(host, game, 1);
    assert.equal(host.log.ends.length, 0, 'the restored run plays on');
    play(host, game, 60);
    assert.equal(host.log.ends.length, 1, 'and can time out again');
    assert.deepEqual(snap, copy, 'restore and play left the snapshot alone');
  });
});

describe('track', () => {
  test('reports the cursor tile, once per update', () => {
    const points = [];
    const host = fakeHost({ track: (x, y) => points.push([x, y]) });
    const game = links.create(host);
    game.start();
    const w = game.snapshot().world;
    play(host, game, 1);
    assert.equal(points.length, 60);
    assert.deepEqual(points[0], [cursorX(w), cursorY(w)]);
  });
});
