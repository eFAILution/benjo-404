import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  createIntent,
  createTracker,
  readIntent,
  resetTracker,
} from '../../../src/games/runner/controls.js';
import runner from '../../../src/games/runner/index.js';
import { DT, fakeHost, fakeInput, seeded } from './fake-host.js';

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
    assert.match(runner.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(runner.name, 'Benjo Run');
    assert.ok(runner.controls.keyboard.length <= 40);
    assert.ok(runner.controls.touch.length <= 40);
    assert.equal(typeof runner.bestKey, 'string');
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = runner.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('update and render do not throw with a stub host', () => {
    const host = fakeHost();
    const game = runner.create(host);
    game.start();
    play(host, game, 2);
    assert.ok(host.log.sprites > 0, 'drew sprites');
    assert.ok(host.ctx.calls.count > 0, 'drew on the context');
  });

  test('render before start and destroy before start do not throw', () => {
    const game = runner.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
  });

  test('shows the controls hint, then clears it after 3 seconds', () => {
    const host = fakeHost();
    const game = runner.create(host);
    game.start();
    assert.equal(host.log.statuses[0], 'SPACE TO JUMP');
    play(host, game, 3.2);
    assert.equal(host.log.statuses.at(-1), '');
  });

  test('shows the touch hint on a touch device (#64)', () => {
    const host = fakeHost();
    host.input.touch = true;
    runner.create(host).start();
    assert.equal(host.log.statuses[0], 'TAP TO JUMP');
  });

  test('a run with no input ends once, with the spec result', () => {
    const host = fakeHost({ random: seeded(3) });
    const game = runner.create(host);
    game.start();
    play(host, game, 30);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'DISTANCE');
    assert.equal(result.reason, 'Benjo hit a broken link.');
    assert.ok(result.score > 0);
    assert.equal(result.score, host.log.scores.at(-1));
    game.update(DT);
    assert.equal(host.log.ends.length, 1, 'end is not called twice');
    game.destroy();
    game.destroy();
  });

  test('pause stops the world and resume continues it', () => {
    const host = fakeHost();
    const game = runner.create(host);
    game.start();
    play(host, game, 1);
    const scored = host.log.scores.length;
    game.pause();
    play(host, game, 1);
    assert.equal(host.log.scores.length, scored);
    game.resume();
    play(host, game, 0.5);
    assert.ok(host.log.scores.length > scored);
  });

  test('announces a new best once the stored best is passed', () => {
    const host = fakeHost();
    host.storage.setNumber(runner.bestKey, 5);
    const game = runner.create(host);
    game.start();
    play(host, game, 1.5);
    assert.ok(host.log.statuses.includes('NEW BEST'));
  });

  test('survives a resize mid-run', () => {
    const host = fakeHost();
    const game = runner.create(host);
    game.start();
    play(host, game, 1);
    host.size.width = 375;
    host.size.height = 667;
    play(host, game, 1);
    game.render(0.25);
  });

  test('runs with reduced motion and a tiny canvas', () => {
    const host = fakeHost({ reducedMotion: true, size: { width: 0, height: 0, dpr: 1 } });
    const game = runner.create(host);
    game.start();
    play(host, game, 2);
  });
});

describe('controls', () => {
  const read = (input, tracker, now) => ({ ...readIntent(input, createIntent(), tracker, now) });

  test('a pointer press jumps on its down edge and holds while down', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 10, y: 10, down: true };
    assert.deepEqual(read(input, tracker, 1), {
      jumpPressed: true,
      jumpHeld: true,
      duckHeld: false,
      duckTap: false,
    });
    assert.equal(read(input, tracker, 1.1).jumpPressed, false);
    assert.equal(read(input, tracker, 1.1).jumpHeld, true);
  });

  test('the host tap that follows a pointer press does not jump again', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 10, y: 10, down: true };
    read(input, tracker, 1);
    input.pointer = { x: 10, y: 10, down: false };
    input.pressed.add('primary');
    assert.equal(read(input, tracker, 1.15).jumpPressed, false);
    assert.equal(read(input, tracker, 2).jumpPressed, true, 'a later key press still jumps');
  });

  test('keys jump and duck, and swipe down ducks', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pressed.add('primary');
    input.held.add('primary');
    input.held.add('down');
    input.swipe = 'down';
    assert.deepEqual(read(input, tracker, 1), {
      jumpPressed: true,
      jumpHeld: true,
      duckHeld: true,
      duckTap: true,
    });
  });

  test('a pointer already down at start or resume does not jump', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 10, y: 10, down: true };
    resetTracker(tracker, input);
    assert.equal(read(input, tracker, 0.2).jumpPressed, false);
  });
});
