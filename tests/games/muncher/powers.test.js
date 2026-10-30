import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import muncher from '../../../src/games/muncher/index.js';
import { BYTE_SCORE, GRACE_T, LIVES, READY_T } from '../../../src/games/muncher/tuning.js';
import {
  benjoCanEnter,
  COLS,
  clearMisses,
  createWorld,
  screenX,
  screenY,
  stepWorld,
} from '../../../src/games/muncher/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const NONE = { dir: -1 };

/** Step a world `seconds` with no input. */
function run(w, seconds, powers) {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepWorld(w, NONE, DT, powers);
  return w;
}

/** Step like the host loop until `seconds` pass or the run ends again. */
function play(host, game, seconds) {
  const ends = host.log.ends.length;
  for (let i = 0; i < Math.round(seconds / DT) && host.log.ends.length === ends; i++) {
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
}

/** A host power port with `charges` Digital Twins and the given timed powers on. */
function powerPort(charges = 0, on = []) {
  const port = {
    calls: 0,
    active: (id) => on.includes(id),
    absorb: () => {
      port.calls += 1;
      if (charges <= 0) return false;
      charges -= 1;
      return true;
    },
  };
  return port;
}

/** Is (c, r) within 2 steps of (col, row) along the paths? */
function reachable(c, r, col, row) {
  let ring = [[col, row]];
  for (let step = 0; step < 2; step++) {
    ring = ring.flatMap(([x, y]) =>
      [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ].filter(([a, b]) => benjoCanEnter(a, b)),
    );
    if (ring.some(([a, b]) => a === c && b === r)) return true;
  }
  return false;
}

/** A world past the ready pause with every cache miss parked in the pen for good. */
function ready() {
  const w = createWorld(SIZE, seeded(1));
  for (const miss of w.misses) {
    Object.assign(miss, { col: 9, row: 9, dir: -1, t: 0, x: 9.5, y: 9.5, state: 'pen' });
    miss.waitT = Number.POSITIVE_INFINITY;
  }
  return run(w, READY_T + DT);
}

/** Stand cache miss `index` on Benjo, chasing. */
function onBenjo(w, index = 0) {
  const { col, row } = w.benjo;
  Object.assign(w.misses[index], { col, row, dir: -1, t: 0, x: col + 0.5, y: row + 0.5 });
  Object.assign(w.misses[index], { state: 'out', frightened: false, waitT: 0 });
  return w.misses[index];
}

describe('digital twin', () => {
  test('takes one touch, lets the cache misses pass for the grace, then the next touch costs a life', () => {
    const w = ready();
    const port = powerPort(1);
    onBenjo(w);
    run(w, DT, port);
    assert.equal(w.lives, LIVES, 'the twin took it');
    assert.equal(w.graceT > 0, true);
    run(w, GRACE_T / 2, port);
    assert.equal(port.calls, 1, 'no second ask during the grace');
    assert.equal(w.lives, LIVES);
    run(w, GRACE_T, port);
    onBenjo(w);
    run(w, DT, port);
    assert.equal(w.lives, LIVES - 1, 'no twin left');
  });

  test('without a twin a touch costs a life as before', () => {
    const w = ready();
    onBenjo(w);
    run(w, DT);
    assert.equal(w.lives, LIVES - 1);
  });
});

describe('magnet', () => {
  test('munches the bytes around Benjo while he stands, and leaves the pellets', () => {
    const w = ready();
    const pellets = [...w.bytes].filter((b) => b === 2).length;
    run(w, DT, { magnet: true });
    const { col, row } = w.benjo;
    for (let d = 0; d < 4; d++) {
      const c = col + [1, 0, -1, 0][d];
      const r = row + [0, 1, 0, -1][d];
      if (benjoCanEnter(c, r)) assert.notEqual(w.bytes[r * COLS + c], 1, `${c},${r}`);
    }
    assert.ok(w.score >= 2 * BYTE_SCORE);
    assert.equal([...w.bytes].filter((b) => b === 2).length, pellets);
    assert.equal(run(ready(), DT).score, 0, 'no magnet, no munching while standing');
  });

  test('does not reach through a wall', () => {
    const w = ready();
    /** Bytes within 2 cells of (col, row) as the crow flies that the paths do not reach. */
    const behind = (col, row) =>
      [...w.bytes.keys()].filter((i) => {
        const c = i % COLS;
        const r = Math.floor(i / COLS);
        const near = Math.abs(c - col) + Math.abs(r - row) <= 2;
        return w.bytes[i] === 1 && near && !reachable(c, r, col, row);
      });
    // The first open cell with a byte on the far side of a wall.
    const start = [...w.bytes.keys()].find(
      (i) =>
        benjoCanEnter(i % COLS, Math.floor(i / COLS)) &&
        behind(i % COLS, Math.floor(i / COLS)).length,
    );
    const col = start % COLS;
    const row = Math.floor(start / COLS);
    Object.assign(w.benjo, { col, row, dir: -1, t: 0 });
    const cut = behind(col, row);
    run(w, DT, { magnet: true });
    assert.ok(cut.length > 0);
    for (const i of cut) assert.equal(w.bytes[i], 1, `${i % COLS},${Math.floor(i / COLS)}`);
  });

  test('the instance polls the host magnet each update', () => {
    const host = fakeHost({ power: powerPort(0, ['magnet']) });
    const game = muncher.create(host);
    game.start();
    play(host, game, READY_T + 0.1);
    assert.ok(game.snapshot().world.score > 0);
  });
});

describe('garbage collector', () => {
  test('sends every cache miss out on the board home, for no points', () => {
    const w = ready();
    onBenjo(w, 0);
    onBenjo(w, 1).state = 'leaving';
    assert.equal(clearMisses(w), 2);
    assert.deepEqual(
      w.misses.map((m) => m.state),
      ['pen', 'pen', 'pen', 'pen'],
    );
    assert.equal(w.score, 0);
    assert.equal(clearMisses(w), 0);
  });
});

describe('rollback', () => {
  test('restore puts the run back after a death and it plays on', () => {
    const host = fakeHost({ random: seeded(3) });
    const game = muncher.create(host);
    game.start();
    play(host, game, READY_T + 0.5);
    const snap = game.snapshot();
    const saved = structuredClone(snap);
    play(host, game, 600);
    assert.equal(host.log.ends.length, 1, 'the run ended');

    game.restore(snap);
    assert.deepEqual(game.snapshot(), saved);
    assert.equal(host.log.scores.at(-1), saved.world.score, 'HUD score re-synced');
    play(host, game, 0.3);
    assert.equal(host.log.ends.length, 1, 'playing on, not ended');
  });

  test('a snapshot is not changed by later updates', () => {
    const host = fakeHost();
    const game = muncher.create(host);
    assert.equal(game.snapshot(), null);
    game.start();
    play(host, game, READY_T + 0.5);
    const snap = game.snapshot();
    const saved = structuredClone(snap);
    play(host, game, 3);
    game.collect();
    assert.deepEqual(snap, saved);
  });
});

describe('track', () => {
  test('reports Benjo once per update, at his center', () => {
    const points = [];
    const host = fakeHost({ track: (x, y) => points.push([x, y]) });
    const game = muncher.create(host);
    game.start();
    const w = game.snapshot().world;
    play(host, game, 1);
    assert.equal(points.length, 60);
    assert.deepEqual(points[0], [screenX(w, w.benjo.x), screenY(w, w.benjo.y)]);
  });

  test('lists every power it supports', () => {
    assert.deepEqual(muncher.powers, ['twin', 'rollback', 'gc', 'magnet']);
  });
});
