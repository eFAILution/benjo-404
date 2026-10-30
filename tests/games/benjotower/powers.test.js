import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import tower from '../../../src/games/benjotower/index.js';
import { back, isOpen, step } from '../../../src/games/benjotower/maze.js';
import { GRACE_T, LIVES, START_GRACE } from '../../../src/games/benjotower/tuning.js';
import { createWorld, posX, posY, stepWorld } from '../../../src/games/benjotower/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

/** A world past the start grace, Benjo facing away from a slime about to reach him from behind. */
function ambush() {
  const w = createWorld({ width: 960, height: 540 }, seeded(1));
  while (w.time <= START_GRACE) stepWorld(w, { dir: -1 }, DT);
  for (const e of w.enemies) e.active = false;
  const d = [0, 1, 2, 3].find((way) => isOpen(w.open, w.benjo.cell, way));
  w.benjo.facing = back(d);
  const e = w.enemies[0];
  Object.assign(e, {
    active: true,
    kind: 'slime',
    cell: step(w.start, d),
    dir: back(d),
    t: 0.5,
    hp: 1,
    hurtT: 0,
    phase: 'show',
  });
  e.prevX = posX(e);
  e.prevY = posY(e);
  return w;
}

/** Step like the host loop until `seconds` pass or the run ends. */
function play(host, game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT) && host.log.ends.length === 0; i++) {
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
}

test('the module lists the powers it can honestly support: nothing to pull, so no magnet', () => {
  assert.deepEqual(tower.powers, ['twin', 'rollback', 'gc']);
});

describe('digital twin', () => {
  test('takes a hit from behind, and gives a grace', () => {
    const w = ambush();
    let charges = 1;
    const powers = { absorb: () => charges-- > 0 };
    stepWorld(w, { dir: -1 }, DT, powers);
    assert.equal(w.lives, LIVES);
    assert.ok(Math.abs(w.graceT - GRACE_T) < DT);
    for (let i = 0; i < 0.5 / DT; i++) stepWorld(w, { dir: -1 }, DT, powers);
    assert.equal(w.lives, LIVES, 'the slime passes through during the grace');
  });

  test('without a twin the same hit costs a life', () => {
    const w = ambush();
    stepWorld(w, { dir: -1 }, DT, { absorb: () => false });
    assert.equal(w.lives, LIVES - 1);
  });
});

describe('garbage collector', () => {
  test('clears every enemy on the floor, scoring them, and counts them', () => {
    const host = fakeHost({ random: seeded(2) });
    const game = tower.create(host);
    assert.equal(game.collect(), 0, 'nothing before start');
    game.start();
    const out = game.snapshot().world.enemies.filter((e) => e.active).length;
    assert.ok(out > 0);
    assert.equal(game.collect(), out);
    assert.ok(game.snapshot().world.enemies.every((e) => !e.active));
    assert.ok(game.snapshot().world.score > 0);
  });
});

describe('rollback', () => {
  test('restore after the run ends brings it back, and it plays on', () => {
    const host = fakeHost({ random: seeded(4) });
    const game = tower.create(host);
    game.start();
    play(host, game, 1);
    const snap = game.snapshot();
    play(host, game, 240);
    assert.equal(host.log.ends.length, 1, 'standing still, Benjo loses every life');
    game.restore(snap);
    assert.equal(host.log.scores.at(-1), snap.world.score);
    play(host, game, 0.5);
    assert.equal(host.log.ends.length, 1, 'the restored run is still going');
  });
});
