import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  createIntent,
  createTracker,
  readIntent,
  resetTracker,
} from '../../../src/games/crackhash/controls.js';
import crackHash from '../../../src/games/crackhash/index.js';
import { DT, fakeHost, fakeInput, fakeStorage } from '../runner/fake-host.js';

const METHODS = ['start', 'update', 'render', 'pause', 'resume', 'destroy'];

/** Run the instance like the host loop: update then render, rolling input each tick. */
function play(host, game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT) && host.log.ends.length === 0; i++) {
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
}

/** Change the running world through a snapshot, as the host's Rollback would. */
function edit(game, change) {
  const snap = game.snapshot();
  change(snap.world);
  game.restore(snap);
}

describe('module', () => {
  test('metadata fits the contract', () => {
    assert.equal(crackHash.id, 'crackhash');
    assert.match(crackHash.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(crackHash.name, 'Crack the Hash');
    assert.ok(crackHash.controls.keyboard.length <= 40);
    assert.ok(crackHash.controls.touch.length <= 40);
    assert.equal(typeof crackHash.bestKey, 'string');
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = crackHash.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('render before start and destroy before start do not throw', () => {
    const game = crackHash.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
  });

  test('draws Benjo and the target, and the bug when there is one', () => {
    const host = fakeHost();
    const game = crackHash.create(host);
    game.start();
    host.log.sprites = 0;
    game.render(0.5);
    assert.equal(host.log.sprites, 2, 'Benjo and the target');
    edit(game, (w) => {
      Object.assign(w.bug, { active: true, s: w.s + 100 });
    });
    host.log.sprites = 0;
    game.render(0.5);
    assert.equal(host.log.sprites, 3);
    assert.ok(host.ctx.calls.count > 0);
  });

  test('shows the keys hint, or the touch hint on a touch device', () => {
    const host = fakeHost();
    crackHash.create(host).start();
    assert.equal(host.log.statuses[0], 'SPACE ON THE TARGET');
    const touch = fakeHost();
    touch.input.touch = true;
    crackHash.create(touch).start();
    assert.equal(touch.log.statuses[0], 'TAP ON THE TARGET');
  });

  test('shows HASH n CRACKED, and NEW BEST once the best is passed', () => {
    const host = fakeHost({ storage: fakeStorage({ best: '1' }) });
    const game = crackHash.create(host);
    game.start();
    play(host, game, 0.2);
    edit(game, (w) => {
      Object.assign(w, { pins: 1, score: 1 });
      w.target.s = w.s;
    });
    host.input.pressed.add('primary');
    play(host, game, 0.1);
    assert.ok(host.log.statuses.includes('NEW BEST'));
    edit(game, (w) => {
      w.pins = 1;
      w.openT = 0;
      w.target.s = w.s;
    });
    host.input.pressed.add('primary');
    play(host, game, 0.1);
    assert.equal(host.log.statuses.at(-1), 'HASH 2 CRACKED');
  });

  test('a miss ends the run once with the pops and the reason, and the ghost is tracked', () => {
    const host = fakeHost();
    const tracked = [];
    host.track = (x, y) => tracked.push([x, y]);
    const game = crackHash.create(host);
    game.start();
    play(host, game, 3);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'POPS');
    assert.equal(result.reason, 'Benjo ran past the target.');
    assert.equal(result.score, 0);
    assert.ok(tracked.length > 0);
    assert.ok(tracked.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
  });

  test('pause stops the run until resume', () => {
    const host = fakeHost();
    const game = crackHash.create(host);
    game.start();
    play(host, game, 0.3);
    const before = game.snapshot().world.time;
    game.pause();
    play(host, game, 1);
    assert.equal(game.snapshot().world.time, before);
    game.resume();
    play(host, game, 0.2);
    assert.ok(game.snapshot().world.time > before);
  });
});

describe('controls', () => {
  /** A tracker past the start, with nothing held. */
  function fresh(input = fakeInput()) {
    const tracker = createTracker();
    resetTracker(tracker, input);
    return { input, tracker, intent: createIntent() };
  }

  test('Space, Up and W tap on the press, and holding does not tap again', () => {
    const { input, tracker, intent } = fresh();
    for (const keys of [['primary'], ['primary', 'up']]) {
      for (const key of keys) {
        input.held.add(key);
        input.pressed.add(key);
      }
      readIntent(input, tracker, 1, intent);
      assert.equal(intent.press, true, keys.join('+'));
      input.tick();
      readIntent(input, tracker, 1.1, intent);
      assert.equal(intent.press, false, `${keys.join('+')} held`);
      input.held.clear();
    }
  });

  test('a pointer press taps once; the host tap echo of it is dropped', () => {
    const { input, tracker, intent } = fresh();
    input.pointer = { x: 30, y: 40, down: true };
    readIntent(input, tracker, 1, intent);
    assert.equal(intent.press, true);
    input.pointer = { x: 30, y: 40, down: false };
    input.pressed.add('primary');
    readIntent(input, tracker, 1.1, intent);
    assert.equal(intent.press, false);
  });

  test('the press that started the run does not tap', () => {
    const input = fakeInput();
    input.pointer = { x: 10, y: 20, down: true };
    const { tracker, intent } = fresh(input);
    readIntent(input, tracker, 1, intent);
    assert.equal(intent.press, false);
  });
});
