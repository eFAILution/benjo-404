import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  createIntent,
  createTracker,
  readIntent,
  resetTracker,
} from '../../../src/games/savefile/controls.js';
import saveFile from '../../../src/games/savefile/index.js';
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
    assert.equal(saveFile.id, 'savefile');
    assert.match(saveFile.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(saveFile.name, 'Save the File');
    assert.ok(saveFile.controls.keyboard.length <= 40);
    assert.ok(saveFile.controls.touch.length <= 40);
    assert.equal(typeof saveFile.bestKey, 'string');
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = saveFile.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('render before start and destroy before start do not throw', () => {
    const game = saveFile.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
  });

  test('draws Benjo, the thrower, and the level once playing', () => {
    const host = fakeHost();
    const game = saveFile.create(host);
    game.start();
    play(host, game, 3);
    assert.ok(host.log.sprites >= 3);
    assert.ok(host.ctx.calls.count > 0);
  });

  test('shows the keys hint, or the touch hint on a touch device', () => {
    const host = fakeHost();
    saveFile.create(host).start();
    assert.equal(host.log.statuses[0], saveFile.controls.keyboard);
    const touch = fakeHost();
    touch.input.touch = true;
    saveFile.create(touch).start();
    assert.equal(touch.log.statuses[0], saveFile.controls.touch);
  });

  test('standing still, Benjo loses every life, and the run ends once', () => {
    const host = fakeHost();
    const tracked = [];
    host.track = (x, y) => tracked.push([x, y]);
    const game = saveFile.create(host);
    game.start();
    play(host, game, 240);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'SCORE');
    assert.match(result.reason, /bug|clock/);
    assert.ok(host.log.statuses.includes('LIVES LEFT: 2'));
    assert.ok(tracked.length > 0, 'the ghost is tracked');
  });
});

describe('controls', () => {
  test('arrows walk and climb; Space jumps, but Up does not', () => {
    const input = fakeInput();
    const tracker = createTracker();
    resetTracker(tracker, input);
    input.held.add('right');
    input.held.add('up');
    input.pressed.add('primary');
    const intent = readIntent(input, tracker, 1, createIntent());
    assert.deepEqual([intent.mx, intent.my, intent.jump], [1, -1, false]);
    input.held.delete('up');
    assert.equal(readIntent(input, tracker, 1, intent).jump, true);
  });

  test('a swipe climbs, and a fresh held finger reports how long it has been down', () => {
    const input = fakeInput();
    const tracker = createTracker();
    resetTracker(tracker, input);
    input.swipe = 'up';
    const intent = readIntent(input, tracker, 1, createIntent());
    assert.equal(intent.climb, -1);
    input.swipe = null;
    input.pointer = { x: 50, y: 60, down: true };
    readIntent(input, tracker, 2, intent);
    assert.deepEqual([intent.px, intent.held], [50, 0]);
    readIntent(input, tracker, 2.3, intent);
    assert.ok(Math.abs(intent.held - 0.3) < 1e-9);
  });
});
