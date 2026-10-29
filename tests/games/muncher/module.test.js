import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  createTracker,
  readTurn,
  resetTracker,
  towards,
} from '../../../src/games/muncher/controls.js';
import muncher from '../../../src/games/muncher/index.js';
import { DT, fakeHost, fakeInput } from '../runner/fake-host.js';

const METHODS = ['start', 'update', 'render', 'pause', 'resume', 'destroy'];

/** Run the instance like the host loop: update then render, rolling input each tick. */
function play(host, game, seconds, beforeTick = () => {}) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps && host.log.ends.length === 0; i++) {
    beforeTick(i * DT, host.input);
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
}

describe('module', () => {
  test('metadata fits the contract', () => {
    assert.equal(muncher.id, 'muncher');
    assert.match(muncher.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(muncher.name, 'Cache Muncher');
    assert.equal(muncher.controls.keyboard, 'ARROWS TO TURN');
    assert.equal(muncher.controls.touch, 'SWIPE OR TAP TO TURN');
    assert.ok(muncher.controls.keyboard.length <= 40);
    assert.ok(muncher.controls.touch.length <= 40);
    assert.equal(muncher.bestKey, 'best');
    assert.ok(muncher.howTo);
  });
});

describe('controls', () => {
  test('arrow keys ask for that way, and nothing else asks', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pressed.add('left');
    assert.equal(readTurn(input, tracker, 0, 0), 2);
    input.tick();
    input.pressed.add('primary');
    assert.equal(readTurn(input, tracker, 0, 0), -1, 'Space does not turn');
  });

  test('a swipe wins, and a tap turns toward the tapped spot along the longer axis', () => {
    assert.equal(towards(10, 2), 0);
    assert.equal(towards(-1, 8), 1);
    assert.equal(towards(-9, 3), 2);
    assert.equal(towards(0, 0), 3);
    const input = fakeInput();
    const tracker = createTracker();
    resetTracker(tracker, input);
    input.pointer = { x: 50, y: 10, down: true };
    assert.equal(readTurn(input, tracker, 10, 10), -1, 'a press waits for its release');
    input.pointer = { x: 50, y: 10, down: false };
    assert.equal(readTurn(input, tracker, 10, 10), 0);
    input.swipe = 'up';
    assert.equal(readTurn(input, tracker, 10, 10), 3);
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = muncher.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('render, update, and destroy before start do not throw', () => {
    const game = muncher.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
  });

  test('draws Benjo, the cache misses, and the maze once playing', () => {
    const host = fakeHost();
    const game = muncher.create(host);
    game.start();
    play(host, game, 2);
    assert.ok(host.log.sprites > 0);
    assert.ok(host.ctx.calls.count > 0);
  });

  test('shows the hint at start, or the touch hint after touch', () => {
    const host = fakeHost();
    const game = muncher.create(host);
    game.start();
    assert.equal(host.log.statuses[0], 'ARROWS TO TURN');
    const touchHost = fakeHost();
    touchHost.input.touch = true;
    const touchGame = muncher.create(touchHost);
    touchGame.start();
    assert.equal(touchHost.log.statuses[0], 'SWIPE OR TAP TO TURN');
  });

  test('standing still, Benjo is caught three times and the run ends once', () => {
    const host = fakeHost();
    const game = muncher.create(host);
    game.start();
    play(host, game, 120);
    assert.ok(host.log.statuses.includes('LIVES LEFT: 2'));
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'SCORE');
    assert.equal(result.reason, 'A cache miss caught Benjo.');
    assert.equal(result.score, 0);
    game.update(DT);
    assert.equal(host.log.ends.length, 1, 'end is not called twice');
    game.destroy();
    game.destroy();
  });

  test('moving munches bytes and scores', () => {
    const host = fakeHost();
    const game = muncher.create(host);
    game.start();
    play(host, game, 2, (t, input) => {
      if (t > 0.3) input.pressed.add('left');
    });
    assert.ok(host.log.scores.at(-1) >= 40);
  });

  test('pause stops the world and resume continues it', () => {
    const host = fakeHost();
    const game = muncher.create(host);
    game.start();
    play(host, game, 1.5, (t, input) => {
      if (t > 0.3) input.pressed.add('left');
    });
    const score = host.log.scores.at(-1);
    game.pause();
    play(host, game, 3, (_, input) => input.pressed.add('left'));
    assert.equal(host.log.scores.at(-1), score, 'a paused world does not move');
    game.render(0.5);
    game.resume();
    play(host, game, 1, (_, input) => input.pressed.add('up'));
    assert.ok(host.log.scores.at(-1) > score);
  });
});
