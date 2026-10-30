import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import saveFile from '../../../src/games/savefile/index.js';
import { girderY, START_X } from '../../../src/games/savefile/level.js';
import { BUG_R, GRACE_T, LIVES, START_GRACE } from '../../../src/games/savefile/tuning.js';
import { createWorld, stepWorld } from '../../../src/games/savefile/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

const idle = () => ({ mx: 0, my: 0, jump: false, climb: 0, px: null, held: 0 });

/** A world past the start grace with no throws or orbs. */
function live() {
  const w = createWorld({ width: 960, height: 540 }, seeded(1));
  while (w.time <= START_GRACE) stepWorld(w, idle(), DT);
  w.throwT = Number.POSITIVE_INFINITY;
  for (const o of w.orbs) o.active = false;
  return w;
}

/** A bug rolling on the bottom girder at `x`, toward the bin. */
function bugAt(w, x, n = 0) {
  const b = w.bugs[n];
  Object.assign(b, {
    active: true,
    state: 'roll',
    g: 0,
    x,
    dir: -1,
    vy: 0,
    ladder: -1,
    sprite: 0,
    hopped: 0,
  });
  b.y = girderY(0, x) - BUG_R;
  b.prevX = x;
  b.prevY = b.y;
  return b;
}

/** Step like the host loop until `seconds` pass or the run ends. */
function play(host, game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT) && host.log.ends.length === 0; i++) {
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
}

test('the module lists every game-assisted power', () => {
  assert.deepEqual(saveFile.powers, ['twin', 'rollback', 'gc', 'magnet']);
});

describe('digital twin', () => {
  test('takes one bug, then bugs pass through for its grace', () => {
    const w = live();
    bugAt(w, START_X + 2);
    let charges = 1;
    const powers = { absorb: () => charges-- > 0 };
    stepWorld(w, idle(), DT, powers);
    assert.equal(w.lives, LIVES);
    assert.ok(Math.abs(w.graceT - GRACE_T) < DT);
    bugAt(w, START_X + 30, 1);
    for (let i = 0; i < 0.5 / DT; i++) stepWorld(w, idle(), DT, powers);
    assert.equal(w.lives, LIVES, 'a second bug inside the grace passes through');
  });

  test('without a twin the same bug costs a life', () => {
    const w = live();
    bugAt(w, START_X + 2);
    stepWorld(w, idle(), DT, { absorb: () => false });
    assert.equal(w.lives, LIVES - 1);
  });
});

describe('garbage collector', () => {
  test('sends every bug to the bin and counts them', () => {
    const host = fakeHost({ random: seeded(2) });
    const game = saveFile.create(host);
    assert.equal(game.collect(), 0, 'nothing before start');
    game.start();
    play(host, game, 4);
    const out = game.snapshot().world.bugs.filter((b) => b.active).length;
    assert.ok(out > 0);
    assert.equal(game.collect(), out);
    assert.ok(game.snapshot().world.bugs.every((b) => !b.active));
  });
});

describe('magnet', () => {
  test("slides an orb on Benjo's girder over to him", () => {
    const pulled = live();
    const left = live();
    for (const w of [pulled, left]) Object.assign(w.orbs[0], { active: true, g: 0, x: 300 });
    for (let i = 0; i < 2.5 / DT; i++) {
      stepWorld(pulled, idle(), DT, { magnet: true });
      stepWorld(left, idle(), DT);
    }
    assert.equal(pulled.orbs[0].active, false);
    assert.equal(left.orbs[0].active, true);
    assert.ok(pulled.score > left.score);
  });
});

describe('rollback', () => {
  test('restore after the run ends brings it back, and it plays on', () => {
    const host = fakeHost({ random: seeded(4) });
    const game = saveFile.create(host);
    game.start();
    play(host, game, 1);
    const snap = game.snapshot();
    play(host, game, 200);
    assert.equal(host.log.ends.length, 1, 'standing still, Benjo runs out of lives');
    game.restore(snap);
    assert.equal(host.log.scores.at(-1), snap.world.score);
    play(host, game, 0.5);
    assert.equal(host.log.ends.length, 1, 'the restored run is still going');
  });
});
