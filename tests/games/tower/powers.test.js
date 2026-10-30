import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import tower from '../../../src/games/tower/index.js';
import { GRACE_T, SCROLL_FLOOR, START_GRACE } from '../../../src/games/tower/tuning.js';
import { createWorld, floorAt, stepWorld } from '../../../src/games/tower/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

const idle = () => ({ mx: 0, jump: false, px: null });

/** A world past the start grace. */
function live() {
  const w = createWorld({ width: 960, height: 540 }, seeded(1));
  while (w.time <= START_GRACE) stepWorld(w, idle(), DT);
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

test('the module lists every game-assisted power', () => {
  assert.deepEqual(tower.powers, ['twin', 'rollback', 'gc', 'magnet']);
});

describe('digital twin', () => {
  test('takes a bug, then bugs pass through for its grace', () => {
    const w = live();
    Object.assign(floorAt(w, 0), { bug: true, bx: w.x + 2, prevBx: w.x + 2, bdir: -1 });
    let charges = 1;
    const powers = { absorb: () => charges-- > 0 };
    stepWorld(w, idle(), DT, powers);
    assert.equal(w.dead, false);
    assert.ok(Math.abs(w.graceT - GRACE_T) < DT);
    for (let i = 0; i < 0.5 / DT; i++) stepWorld(w, idle(), DT, powers);
    assert.equal(w.dead, false);
  });

  test('throws Benjo back up when he falls off the bottom, once', () => {
    const w = live();
    w.best = SCROLL_FLOOR;
    let charges = 1;
    const powers = { absorb: () => charges-- > 0 };
    let rescued = false;
    for (let i = 0; i < 30 / DT && !w.dead; i++) {
      stepWorld(w, idle(), DT, powers);
      if (w.vy > 900) rescued = true;
    }
    assert.ok(rescued, 'the twin threw him up');
    assert.equal(w.dead, true, 'and the next fall ends the run');
    assert.equal(w.hit, 'fall');
  });
});

describe('garbage collector', () => {
  test('clears every bug in the tower and counts them', () => {
    const host = fakeHost({ random: seeded(2) });
    const game = tower.create(host);
    assert.equal(game.collect(), 0, 'nothing before start');
    game.start();
    const w = game.snapshot().world;
    assert.ok(
      w.floors.every((f) => !f.bug),
      'no bugs on the low floors',
    );
    const state = game.snapshot();
    for (const f of state.world.floors) Object.assign(f, { n: Math.max(f.n, 0), bug: true });
    game.restore(state);
    assert.equal(game.collect(), state.world.floors.length);
    assert.ok(game.snapshot().world.floors.every((f) => !f.bug));
  });
});

describe('magnet', () => {
  test('slides an orb on a nearby floor over to Benjo', () => {
    const pulled = live();
    const left = live();
    for (const w of [pulled, left]) Object.assign(floorAt(w, 0), { orb: true, ox: w.x + 120 });
    for (let i = 0; i < 1.2 / DT; i++) {
      stepWorld(pulled, idle(), DT, { magnet: true });
      stepWorld(left, idle(), DT);
    }
    assert.equal(floorAt(pulled, 0).orb, false);
    assert.equal(floorAt(left, 0).orb, true);
    assert.ok(pulled.score > left.score);
  });
});

describe('rollback', () => {
  test('restore after the run ends brings it back, and it plays on', () => {
    const host = fakeHost({ random: seeded(4) });
    const game = tower.create(host);
    game.start();
    play(host, game, 1);
    const snap = game.snapshot();
    const state = game.snapshot();
    state.world.best = SCROLL_FLOOR;
    game.restore(state);
    play(host, game, 30);
    assert.equal(host.log.ends.length, 1, 'standing still, Benjo falls behind');
    game.restore(snap);
    assert.equal(host.log.scores.at(-1), snap.world.score);
    play(host, game, 0.5);
    assert.equal(host.log.ends.length, 1, 'the restored run is still going');
  });
});
