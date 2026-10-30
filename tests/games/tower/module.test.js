import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  createIntent,
  createTracker,
  readIntent,
  resetTracker,
} from '../../../src/games/tower/controls.js';
import tower from '../../../src/games/tower/index.js';
import { SCROLL_FLOOR } from '../../../src/games/tower/tuning.js';
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
    assert.equal(tower.id, 'tower');
    assert.match(tower.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(tower.name, 'Uptime Tower');
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

  test('draws Benjo and the tower once playing, and tracks him for the ghost', () => {
    const host = fakeHost();
    const tracked = [];
    host.track = (x, y) => tracked.push([x, y]);
    const game = tower.create(host);
    game.start();
    play(host, game, 1);
    assert.ok(host.log.sprites >= 1);
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

  test('once the view climbs, standing still ends the run once, as a fall', () => {
    const host = fakeHost();
    const game = tower.create(host);
    game.start();
    const state = game.snapshot();
    state.world.best = SCROLL_FLOOR;
    game.restore(state);
    play(host, game, 60);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'SCORE');
    assert.equal(result.reason, 'Benjo fell behind the climb.');
  });
});

describe('controls', () => {
  test('arrows run, and Space or Up jump', () => {
    const input = fakeInput();
    const tracker = createTracker();
    resetTracker(tracker, input);
    input.held.add('left');
    input.pressed.add('up');
    const intent = readIntent(input, tracker, 1, createIntent());
    assert.deepEqual([intent.mx, intent.jump], [-1, true]);
  });

  test('a press jumps at once and the held finger runs, but the start press does neither', () => {
    const input = fakeInput();
    input.pointer = { x: 10, y: 20, down: true };
    const tracker = createTracker();
    resetTracker(tracker, input);
    const intent = createIntent();
    readIntent(input, tracker, 1, intent);
    assert.deepEqual([intent.jump, intent.px], [false, null]);
    input.pointer = { x: 10, y: 20, down: false };
    readIntent(input, tracker, 1.1, intent);
    input.pointer = { x: 30, y: 40, down: true };
    readIntent(input, tracker, 1.2, intent);
    assert.deepEqual([intent.jump, intent.px], [true, 30]);
    readIntent(input, tracker, 1.3, intent);
    assert.deepEqual([intent.jump, intent.px], [false, 30]);
  });
});
