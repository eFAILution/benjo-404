import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import neverSleeps from '../../../src/games/neversleeps/index.js';
import { GRACE_T, GRID, START_GRACE } from '../../../src/games/neversleeps/tuning.js';
import { cellX, cellY, createWorld, stepWorld } from '../../../src/games/neversleeps/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const MIDDLE = 4;
const ALL = (1 << (GRID * GRID)) - 1;
const idle = () => ({ mx: 0, my: 0, px: null, py: null, grab: false });

/** A world past the start grace with no gates, the ship in the middle cell. */
function live() {
  const w = createWorld(SIZE, seeded(1));
  while (w.time <= START_GRACE) stepWorld(w, idle(), DT);
  for (const g of w.gates) g.active = false;
  w.lastZ = Number.POSITIVE_INFINITY;
  Object.assign(w, { sx: cellX(MIDDLE), sy: cellY(MIDDLE) });
  return w;
}

/** Put gate `n` at depth `z` with the given blocked cells. */
function gate(w, n, z, mask, extra = {}) {
  Object.assign(w.gates[n], {
    active: true,
    z,
    prevZ: z,
    mask,
    orb: -1,
    port: -1,
    sprite: 0,
    ...extra,
  });
  return w.gates[n];
}

/** Step like the host loop until `seconds` pass or the run ends. */
function play(host, game, seconds) {
  const ends = host.log.ends.length;
  for (let i = 0; i < Math.round(seconds / DT) && host.log.ends.length === ends; i++) {
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
}

test('the module lists every game-assisted power', () => {
  assert.deepEqual(neverSleeps.powers, ['twin', 'rollback', 'gc', 'magnet']);
});

describe('digital twin', () => {
  test('takes one hit, then gates pass through for its grace', () => {
    const w = live();
    gate(w, 0, 0.01, ALL);
    gate(w, 1, 0.01 + 6 * GRACE_T, ALL);
    let charges = 1;
    const powers = { absorb: () => charges-- > 0 };
    stepWorld(w, idle(), DT, powers);
    assert.equal(w.dead, false);
    assert.ok(Math.abs(w.graceT - GRACE_T) < DT);
    gate(w, 2, 0.5, ALL);
    for (let i = 0; i < 0.5 / (6 * DT) + 2; i++) stepWorld(w, idle(), DT, powers);
    assert.equal(w.dead, false, 'a gate inside the grace passes through');
  });

  test('without a twin the same hit ends the run', () => {
    const w = live();
    gate(w, 0, 0.01, ALL);
    stepWorld(w, idle(), DT, { absorb: () => false });
    assert.equal(w.dead, true);
  });
});

describe('garbage collector', () => {
  test('clears the blocked panels of every gate ahead and counts them', () => {
    const host = fakeHost({ random: seeded(2) });
    const game = neverSleeps.create(host);
    assert.equal(game.collect(), 0, 'nothing before start');
    game.start();
    play(host, game, 3);
    const w = game.snapshot().world;
    const ahead = w.gates.filter((g) => g.active && g.z > 0 && g.mask).length;
    assert.ok(ahead > 0);
    assert.equal(game.collect(), ahead);
    assert.ok(game.snapshot().world.gates.every((g) => !g.active || g.z <= 0 || g.mask === 0));
  });
});

describe('magnet', () => {
  test('slides a nearby orb onto the ship before the gate arrives', () => {
    const pulled = live();
    const left = live();
    for (const w of [pulled, left]) gate(w, 0, 2.4, 0, { orb: 0, ox: cellX(0), oy: cellY(0) });
    for (let i = 0; i < 25; i++) {
      stepWorld(pulled, idle(), DT, { magnet: true });
      stepWorld(left, idle(), DT);
    }
    assert.equal(pulled.gates[0].orb, -1, 'the pulled orb was flown through');
    assert.equal(left.gates[0].orb, 0, 'the other orb is still in its corner');
    assert.ok(pulled.score > left.score);
  });
});

describe('rollback', () => {
  test('restore after a crash brings the run back, and it plays on', () => {
    const host = fakeHost({ random: seeded(4) });
    const game = neverSleeps.create(host);
    game.start();
    play(host, game, 2);
    const snap = game.snapshot();
    play(host, game, 30);
    assert.equal(host.log.ends.length, 1, 'an idle ship crashes');
    game.restore(snap);
    assert.equal(host.log.scores.at(-1), snap.world.score);
    play(host, game, 0.5);
    assert.equal(host.log.ends.length, 1, 'the restored run is still going');
  });
});
