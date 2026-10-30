import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import crackHash from '../../../src/games/crackhash/index.js';
import { along, TRACK } from '../../../src/games/crackhash/ring.js';
import {
  EVENT_POP,
  EVENT_SAVED,
  HIT_HALF,
  MAGNET_WIDEN,
  START_GRACE,
} from '../../../src/games/crackhash/tuning.js';
import { createWorld, stepWorld } from '../../../src/games/crackhash/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 600 };
const PRESS = { press: true };
const WAIT = { press: false };

/** A world past the start grace with Benjo `d` short of the target's middle and no bug. */
function before(d) {
  const w = createWorld(SIZE, seeded(1));
  w.time = START_GRACE + DT;
  w.bug.active = false;
  w.target.s = (w.s + d + TRACK) % TRACK;
  return w;
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
  assert.deepEqual(crackHash.powers, ['twin', 'rollback', 'gc', 'magnet']);
});

describe('digital twin', () => {
  test('forgives one tap off the target, and the next one ends the run', () => {
    const w = before(100);
    let charges = 1;
    const powers = { absorb: () => charges-- > 0 };
    stepWorld(w, PRESS, DT, powers);
    assert.ok(w.events & EVENT_SAVED);
    assert.equal(w.dead, false);
    stepWorld(w, PRESS, DT, powers);
    assert.equal(w.dead, true);
  });

  test('forgives a run past the target by turning Benjo round to it', () => {
    const w = before(0);
    let charges = 1;
    const powers = { absorb: () => charges-- > 0 };
    for (let i = 0; i < 30 && !(w.events & EVENT_SAVED); i++) stepWorld(w, WAIT, DT, powers);
    assert.equal(w.dir, -1);
    assert.ok(along(w, w.s, w.target.s) < HIT_HALF + 10, 'the target is just ahead again');
    assert.equal(w.dead, false);
  });

  test('forgives a tap on a bug, and the bug goes', () => {
    const w = before(200);
    Object.assign(w.bug, { active: true, s: w.s });
    stepWorld(w, PRESS, DT, { absorb: () => true });
    assert.equal(w.dead, false);
    assert.equal(w.bug.active, false);
  });
});

describe('garbage collector', () => {
  test('clears the bug off the ring and counts it', () => {
    const host = fakeHost();
    const game = crackHash.create(host);
    assert.equal(game.collect(), 0, 'nothing before start');
    game.start();
    play(host, game, 0.3);
    assert.equal(game.collect(), 0, 'no bug yet');
    const snap = game.snapshot();
    Object.assign(snap.world.bug, { active: true, s: snap.world.s + 100 });
    game.restore(snap);
    assert.equal(game.collect(), 1);
    assert.equal(game.snapshot().world.bug.active, false);
  });
});

describe('load balancer', () => {
  test('widens the hit window while it runs', () => {
    const off = HIT_HALF * ((1 + MAGNET_WIDEN) / 2);
    const wide = before(off);
    stepWorld(wide, PRESS, DT, { magnet: true });
    assert.ok(wide.events & EVENT_POP);
    const plain = before(off);
    stepWorld(plain, PRESS, DT);
    assert.equal(plain.dead, true);
  });
});

describe('rollback', () => {
  test('restore after a miss brings the run back, and it plays on', () => {
    const host = fakeHost();
    const game = crackHash.create(host);
    game.start();
    play(host, game, 0.3);
    const snap = game.snapshot();
    host.input.pressed.add('primary');
    play(host, game, 1);
    assert.equal(host.log.ends.length, 1, 'the tap off the target ends the run');
    game.restore(snap);
    assert.equal(host.log.scores.at(-1), snap.world.score);
    assert.equal(game.snapshot().world.dead, false);
    play(host, game, 0.3);
    assert.equal(host.log.ends.length, 1, 'the restored run is still going');
  });
});
