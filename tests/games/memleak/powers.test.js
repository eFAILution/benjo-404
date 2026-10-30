import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { colTop } from '../../../src/games/memleak/heap.js';
import memoryLeak from '../../../src/games/memleak/index.js';
import { COLS, FREE_SCORE, ROWS, TWIN_ROWS } from '../../../src/games/memleak/tuning.js';
import { stepWorld } from '../../../src/games/memleak/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';
import { block, fall, idle, quiet, run, used } from './kit.js';

/** Step like the host loop until `seconds` pass or the run ends. */
function play(host, game, seconds) {
  const ends = host.log.ends.length;
  for (let i = 0; i < Math.round(seconds / DT) && host.log.ends.length === ends; i++) {
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
}

/** A heap whose column 4 is full to the top, with a block falling onto it. */
function doomed(w) {
  for (let row = 0; row < ROWS; row++) block(w, 4, row, 1);
  block(w, 0, 0, 2);
  fall(w, 3, 2);
  return w;
}

test('the module lists every game-assisted power but the magnet', () => {
  assert.deepEqual(memoryLeak.powers, ['twin', 'rollback', 'gc']);
});

describe('digital twin', () => {
  test('takes an overflow by clearing the top rows, and the block lands', () => {
    const w = doomed(quiet());
    let charges = 1;
    const powers = { absorb: () => charges-- > 0 };
    while (w.fall.active && !w.dead) stepWorld(w, idle(), DT, powers);
    assert.equal(w.dead, false);
    assert.equal(colTop(w, 4), ROWS - TWIN_ROWS + 1, 'the block landed on the cleared column');
    assert.equal(w.score, 0, 'the cleared blocks score nothing');
    assert.ok(colTop(w, 0) === 1, 'the rest of the heap is untouched');
  });

  test('takes a heap too full for any block', () => {
    const w = quiet();
    for (let col = 0; col < COLS; col++) block(w, col, ROWS - 1, 1);
    w.spawnT = 0;
    stepWorld(w, idle(), DT, { absorb: () => true });
    assert.equal(w.dead, false);
    stepWorld(w, idle(), DT, { absorb: () => true });
    assert.equal(w.fall.active, true, 'the next block appears');
  });

  test('without a twin the same overflow ends the run', () => {
    const w = doomed(quiet());
    run(w, 5, idle, { absorb: () => false });
    assert.equal(w.dead, true);
  });
});

describe('garbage collector', () => {
  test('frees every block in the heap for its points, and counts them', () => {
    const host = fakeHost({ random: seeded(2) });
    const game = memoryLeak.create(host);
    assert.equal(game.collect(), 0, 'nothing before start');
    game.start();
    const snap = game.snapshot();
    block(snap.world, 0, 0, 4);
    block(snap.world, 6, 3, 3);
    block(snap.world, 2, 1, 1);
    game.restore(snap);
    assert.equal(game.collect(), 3);
    const after = game.snapshot().world;
    assert.equal(used(after), 0);
    assert.equal(after.score, FREE_SCORE[4] + FREE_SCORE[3] + FREE_SCORE[1]);
    play(host, game, DT);
    assert.equal(host.log.scores.at(-1), after.score, 'the HUD catches up on the next step');
  });
});

describe('rollback', () => {
  test('restore after an overflow brings the run back, and it plays on', () => {
    const host = fakeHost({ random: seeded(4) });
    const game = memoryLeak.create(host);
    game.start();
    play(host, game, 1);
    const snap = game.snapshot();
    const lost = game.snapshot();
    doomed(lost.world);
    game.restore(lost);
    play(host, game, 5);
    assert.equal(host.log.ends.length, 1, 'the overflow ends the run');
    game.restore(snap);
    assert.equal(host.log.scores.at(-1), snap.world.score);
    assert.equal(game.snapshot().world.dead, false);
    play(host, game, 1);
    assert.equal(host.log.ends.length, 1, 'the restored run is still going');
  });
});
