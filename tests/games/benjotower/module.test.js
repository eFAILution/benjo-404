import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  createIntent,
  createTracker,
  readIntent,
  resetTracker,
} from '../../../src/games/benjotower/controls.js';
import tower from '../../../src/games/benjotower/index.js';
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
    assert.equal(tower.id, 'benjotower');
    assert.match(tower.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(tower.name, 'Tower of Benjo');
    assert.ok(tower.controls.keyboard.length <= 40);
    assert.ok(tower.controls.touch.length <= 40);
    assert.equal(typeof tower.bestKey, 'string');
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = tower.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('render before start and destroy before start do not throw', () => {
    const game = tower.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
  });

  test('draws Benjo, the enemies, and the maze, and tracks Benjo for the ghost', () => {
    const host = fakeHost();
    const tracked = [];
    host.track = (x, y) => tracked.push([x, y]);
    const game = tower.create(host);
    game.start();
    play(host, game, 1);
    assert.ok(host.log.sprites >= 3);
    assert.ok(host.ctx.calls.count > 0);
    assert.equal(tracked.length, 60);
  });

  test('shows the keys hint, or the touch hint on a touch device', () => {
    const host = fakeHost();
    tower.create(host).start();
    assert.equal(host.log.statuses[0], tower.controls.keyboard);
    const touch = fakeHost();
    touch.input.touch = true;
    tower.create(touch).start();
    assert.equal(touch.log.statuses[0], tower.controls.touch);
  });

  test('standing still, Benjo loses every life, and the run ends once with its reason', () => {
    const host = fakeHost();
    const game = tower.create(host);
    game.start();
    play(host, game, 240);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'SCORE');
    assert.ok(result.reason.length > 0);
    assert.ok(host.log.statuses.includes('LIVES LEFT: 2'));
  });
});

describe('controls', () => {
  test('the newest arrow held wins, and letting go stops', () => {
    const input = fakeInput();
    const tracker = createTracker();
    resetTracker(tracker, input);
    const intent = createIntent();
    input.held.add('up');
    input.pressed.add('up');
    assert.equal(readIntent(input, tracker, 1, 0, 0, intent).dir, 0);
    input.tick();
    input.held.add('right');
    input.pressed.add('right');
    assert.equal(readIntent(input, tracker, 1, 0, 0, intent).dir, 1);
    input.tick();
    input.held.clear();
    assert.equal(readIntent(input, tracker, 1, 0, 0, intent).dir, -1);
  });

  test('a held finger walks toward itself on its farther axis; the start press does not', () => {
    const input = fakeInput();
    input.pointer = { x: 100, y: 0, down: true };
    const tracker = createTracker();
    resetTracker(tracker, input);
    const intent = createIntent();
    assert.equal(readIntent(input, tracker, 1, 0, 0, intent).dir, -1);
    input.pointer = { x: 100, y: 0, down: false };
    readIntent(input, tracker, 1.1, 0, 0, intent);
    input.pointer = { x: 10, y: 90, down: true };
    assert.equal(readIntent(input, tracker, 1.2, 0, 0, intent).dir, 2);
    input.pointer = { x: -80, y: 10, down: true };
    assert.equal(readIntent(input, tracker, 1.3, 0, 0, intent).dir, 3);
  });
});
