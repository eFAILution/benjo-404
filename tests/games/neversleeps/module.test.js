import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  createIntent,
  createTracker,
  readIntent,
  resetTracker,
} from '../../../src/games/neversleeps/controls.js';
import neverSleeps from '../../../src/games/neversleeps/index.js';
import { SHIP } from '../../../src/games/neversleeps/ship.js';
import { DT, fakeHost, fakeInput } from '../runner/fake-host.js';

const METHODS = ['start', 'update', 'render', 'pause', 'resume', 'destroy'];

/** Run the instance like the host loop: update then render, rolling input each tick. */
function play(host, game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT) && host.log.ends.length === 0; i++) {
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
}

describe('module', () => {
  test('metadata fits the contract', () => {
    assert.equal(neverSleeps.id, 'neversleeps');
    assert.match(neverSleeps.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(neverSleeps.name, 'Never Sleeps Run');
    assert.ok(neverSleeps.controls.keyboard.length <= 40);
    assert.ok(neverSleeps.controls.touch.length <= 40);
    assert.equal(typeof neverSleeps.bestKey, 'string');
  });

  test('the ship sprite uses palette colors only', () => {
    for (const path of SHIP.paths) assert.match(path.fill, /^(ink|muted|accent|glow|bg|hazard)$/);
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = neverSleeps.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('render before start and destroy before start do not throw', () => {
    const game = neverSleeps.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
  });

  test('draws the ship, Benjo, and the trench once flying', () => {
    const host = fakeHost();
    const game = neverSleeps.create(host);
    game.start();
    play(host, game, 1);
    assert.ok(host.log.sprites >= 2);
    assert.ok(host.ctx.calls.count > 0);
  });

  test('shows the keys hint, or the touch hint on a touch device', () => {
    const host = fakeHost();
    neverSleeps.create(host).start();
    assert.equal(host.log.statuses[0], 'ARROWS OR WASD TO STEER');
    const touch = fakeHost();
    touch.input.touch = true;
    neverSleeps.create(touch).start();
    assert.equal(touch.log.statuses[0], 'DRAG TO STEER');
  });

  test('an idle ship crashes, and the run ends once with the score and reason', () => {
    const host = fakeHost();
    const tracked = [];
    host.track = (x, y) => tracked.push([x, y]);
    const game = neverSleeps.create(host);
    game.start();
    play(host, game, 30);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'SCORE');
    assert.equal(result.reason, 'The USS Never Sleeps clipped a gate.');
    assert.equal(result.score, host.log.scores.at(-1));
    assert.ok(tracked.length > 0, 'the ghost is tracked');
  });

  test('pause stops the run until resume', () => {
    const host = fakeHost();
    const game = neverSleeps.create(host);
    game.start();
    play(host, game, 0.5);
    const before = game.snapshot().world.dist;
    game.pause();
    play(host, game, 1);
    assert.equal(game.snapshot().world.dist, before);
    game.resume();
    play(host, game, 0.2);
    assert.ok(game.snapshot().world.dist > before);
  });
});

describe('controls', () => {
  test('arrows steer, up is positive', () => {
    const input = fakeInput();
    const tracker = createTracker();
    resetTracker(tracker, input);
    input.held.add('right');
    input.held.add('up');
    const intent = readIntent(input, tracker, 1, createIntent());
    assert.deepEqual([intent.mx, intent.my, intent.px], [1, 1, null]);
  });

  test('the press that started the run does not drag until it lifts and comes back', () => {
    const input = fakeInput();
    input.pointer = { x: 10, y: 20, down: true };
    const tracker = createTracker();
    resetTracker(tracker, input);
    const intent = createIntent();
    assert.equal(readIntent(input, tracker, 1, intent).px, null);
    input.pointer = { x: 10, y: 20, down: false };
    readIntent(input, tracker, 1.1, intent);
    input.pointer = { x: 30, y: 40, down: true };
    readIntent(input, tracker, 1.2, intent);
    assert.deepEqual([intent.px, intent.py, intent.grab], [30, 40, true]);
    input.pointer = { x: 35, y: 45, down: true };
    readIntent(input, tracker, 1.3, intent);
    assert.deepEqual([intent.px, intent.py, intent.grab], [35, 45, false]);
  });
});
