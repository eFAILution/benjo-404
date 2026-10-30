import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import bugBelt from '../../../src/games/bugbelt/index.js';
import { BUG_SCORE, GRACE_T, LIVES, START_GRACE } from '../../../src/games/bugbelt/tuning.js';
import { createWorld, stepWorld } from '../../../src/games/bugbelt/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const idle = () => ({ turn: 0, thrust: false, fire: false, firing: false, px: null, py: null });

/** A world past the start grace with no bugs and no next wave coming. */
function quiet() {
  const w = createWorld(SIZE, seeded(1));
  while (w.time <= START_GRACE) stepWorld(w, idle(), DT);
  for (const b of w.bugs) b.active = false;
  w.waveT = Number.POSITIVE_INFINITY;
  return w;
}

/** Park a still bug of `size` at (x, y). */
function bugAt(w, size, x, y) {
  const b = w.bugs.find((it) => !it.active);
  Object.assign(b, { active: true, size, x, y, prevX: x, prevY: y, vx: 0, vy: 0, spin: 0 });
  return b;
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
  assert.deepEqual(bugBelt.powers, ['twin', 'rollback', 'gc', 'magnet']);
});

describe('digital twin', () => {
  test('takes one bump, then bugs pass through for its grace', () => {
    const w = quiet();
    bugAt(w, 0, w.x, w.y);
    let charges = 1;
    const powers = { absorb: () => charges-- > 0 };
    stepWorld(w, idle(), DT, powers);
    assert.equal(w.lives, LIVES);
    assert.equal(w.alive, true);
    assert.ok(Math.abs(w.graceT - GRACE_T) < DT);
    for (let i = 0; i < (GRACE_T - 0.5) / DT; i++) stepWorld(w, idle(), DT, powers);
    assert.equal(w.lives, LIVES, 'a bug inside the grace passes through');
  });

  test('without a twin the same bump costs a life', () => {
    const w = quiet();
    bugAt(w, 0, w.x, w.y);
    stepWorld(w, idle(), DT, { absorb: () => false });
    assert.equal(w.lives, LIVES - 1);
  });
});

describe('garbage collector', () => {
  test('pops every bug on screen for its score, and counts them', () => {
    const host = fakeHost({ random: seeded(2) });
    const game = bugBelt.create(host);
    assert.equal(game.collect(), 0, 'nothing before start');
    game.start();
    play(host, game, 1);
    const w = game.snapshot().world;
    const live = w.bugs.filter((b) => b.active);
    assert.ok(live.length > 0);
    const worth = live.reduce((sum, b) => sum + BUG_SCORE[b.size], 0);
    assert.equal(game.collect(), live.length);
    const after = game.snapshot().world;
    assert.equal(after.bugs.filter((b) => b.active).length, 0, 'none split');
    assert.equal(after.score, w.score + worth);
  });
});

describe('magnet', () => {
  test('slides a nearby orb onto the ship', () => {
    const pulled = quiet();
    const left = quiet();
    for (const w of [pulled, left]) {
      Object.assign(w.orbs[0], { active: true, x: w.x + 120, y: w.y, vx: 0, vy: 0, life: 5 });
    }
    for (let i = 0; i < 60; i++) {
      stepWorld(pulled, idle(), DT, { magnet: true });
      stepWorld(left, idle(), DT);
    }
    assert.equal(pulled.orbs[0].active, false, 'the pulled orb was picked up');
    assert.equal(left.orbs[0].active, true, 'the other orb is still out there');
    assert.ok(pulled.score > left.score);
  });
});

describe('rollback', () => {
  test('restore after the last ship is lost brings the run back, and it plays on', () => {
    const host = fakeHost({ random: seeded(4) });
    const game = bugBelt.create(host);
    game.start();
    play(host, game, 2);
    const snap = game.snapshot();
    const doomed = game.snapshot();
    Object.assign(doomed.world, { lives: 1, graceT: 0 });
    Object.assign(doomed.world.bugs[0], {
      active: true,
      size: 0,
      x: doomed.world.x,
      y: doomed.world.y,
      vx: 0,
      vy: 0,
    });
    game.restore(doomed);
    play(host, game, 3);
    assert.equal(host.log.ends.length, 1, 'the last bump ends the run');
    game.restore(snap);
    assert.equal(host.log.scores.at(-1), snap.world.score);
    assert.equal(game.snapshot().world.lives, LIVES);
    play(host, game, 0.5);
    assert.equal(host.log.ends.length, 1, 'the restored run is still going');
  });
});
