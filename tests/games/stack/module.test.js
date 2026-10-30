import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createTracker, readDrop, resetTracker } from '../../../src/games/stack/controls.js';
import stack from '../../../src/games/stack/index.js';
import { START_GRACE } from '../../../src/games/stack/tuning.js';
import { createWorld, stepWorld, topBlock } from '../../../src/games/stack/world.js';
import { DT, fakeHost, fakeInput, seeded } from '../runner/fake-host.js';

const METHODS = ['start', 'update', 'render', 'pause', 'resume', 'destroy'];
const HINT = 'SPACE OR TAP TO DROP';
const REASON = 'The server stack toppled over.';

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

/** Press Space every `every` seconds, after the start grace. */
const dropEvery = (every) => (t, input) => {
  if (t > 0.2 && Math.round(t / DT) % Math.round(every / DT) === 0) input.pressed.add('primary');
};

/**
 * A twin world stepped with the same presses tells the pilot where the block is: the game has
 * no random choices, so the twin and the game stay in lockstep.
 */
function perfectPilot(host) {
  const twin = createWorld(host.size, seeded(1), { reducedMotion: host.reducedMotion });
  return (_t, input) => {
    const drop = twin.time + DT > START_GRACE && Math.abs(twin.x - topBlock(twin).x) <= 3;
    if (drop) input.pressed.add('primary');
    stepWorld(twin, drop, DT);
  };
}

describe('module', () => {
  test('metadata fits the contract', () => {
    assert.equal(stack.id, 'stack');
    assert.match(stack.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(stack.name, 'Stack the Server');
    assert.equal(stack.controls.keyboard, HINT);
    assert.equal(stack.controls.touch, 'TAP TO DROP');
    assert.ok(stack.controls.keyboard.length <= 40);
    assert.ok(stack.controls.touch.length <= 40);
    assert.equal(stack.bestKey, 'best');
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = stack.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('render, update, and destroy before start do not throw', () => {
    const game = stack.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
    game.render(0);
  });

  test('draws Benjo and the stack once playing', () => {
    const host = fakeHost();
    const game = stack.create(host);
    game.start();
    play(host, game, 1);
    assert.ok(host.log.sprites > 0);
    assert.ok(host.ctx.calls.count > 0);
  });

  test('shows the hint at start and clears it after 3 seconds', () => {
    const host = fakeHost();
    const game = stack.create(host);
    game.start();
    assert.equal(host.log.statuses[0], HINT);
    assert.deepEqual(host.log.scores, [0]);
    play(host, game, 2.9);
    assert.equal(host.log.statuses.length, 1);
    play(host, game, 0.2);
    assert.equal(host.log.statuses.at(-1), '');
  });

  test('a run with no input slides on instead of ending', () => {
    const host = fakeHost();
    const game = stack.create(host);
    game.start();
    play(host, game, 30);
    assert.equal(host.log.ends.length, 0);
  });

  test('a drop at the far edge misses and ends once with the reason', () => {
    const host = fakeHost();
    const game = stack.create(host);
    game.start();
    play(host, game, 0.2);
    host.input.pressed.add('primary');
    play(host, game, 2);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'HEIGHT');
    assert.equal(result.reason, REASON);
    assert.ok(result.reason.length <= 48);
    assert.equal(result.score, 0);
    game.update(DT);
    assert.equal(host.log.ends.length, 1, 'end is not called twice');
    game.destroy();
    game.destroy();
    game.render(0.5);
  });

  test('perfect drops raise the height and say PERFECT', () => {
    const host = fakeHost();
    const game = stack.create(host);
    game.start();
    play(host, game, 20, perfectPilot(host));
    assert.equal(host.log.ends.length, 0);
    assert.ok(Math.max(...host.log.scores) >= 3);
    assert.ok(host.log.statuses.includes('PERFECT'));
  });

  test('pause stops the world and resume continues it', () => {
    const host = fakeHost();
    const xs = [];
    host.drawSprite = (_sprite, x) => xs.push(x);
    const game = stack.create(host);
    game.start();
    play(host, game, 0.3);
    game.pause();
    xs.length = 0;
    play(host, game, 2, dropEvery(0.3));
    assert.equal(host.log.ends.length, 0, 'a paused game ignores drops');
    assert.equal(new Set(xs).size, 1, 'nothing moves while paused');
    game.resume();
    play(host, game, 0.1);
    host.input.pressed.add('primary');
    play(host, game, 2);
    assert.equal(host.log.ends.length, 1);
  });

  test('announces a new best once the stored best is passed', () => {
    const host = fakeHost();
    host.storage.setNumber(stack.bestKey, 2);
    const game = stack.create(host);
    game.start();
    play(host, game, 30, perfectPilot(host));
    assert.ok(Math.max(...host.log.scores) > 2, 'the pilot passed the stored best');
    assert.equal(host.log.statuses.filter((s) => s === 'NEW BEST').length, 1);
  });

  test('survives a resize mid-run', () => {
    const host = fakeHost();
    const game = stack.create(host);
    game.start();
    play(host, game, 3, perfectPilot(host));
    host.size.width = 375;
    host.size.height = 667;
    play(host, game, 1, dropEvery(0.4));
    host.size.width = 320;
    host.size.height = 240;
    game.render(0.25);
    play(host, game, 1, dropEvery(0.4));
    game.render(0.25);
  });

  test('runs with reduced motion and a tiny canvas', () => {
    const host = fakeHost({ reducedMotion: true, size: { width: 0, height: 0, dpr: 1 } });
    const game = stack.create(host);
    game.start();
    play(host, game, 3, dropEvery(0.3));
    game.render(0.5);
  });
});

describe('controls', () => {
  test('a pointer press drops on its down edge only', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 10, y: 10, down: true };
    assert.equal(readDrop(input, tracker, 1), true);
    assert.equal(readDrop(input, tracker, 1.1), false);
  });

  test('the host tap that follows a pointer press does not drop again', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 10, y: 10, down: true };
    readDrop(input, tracker, 1);
    input.pointer = { x: 10, y: 10, down: false };
    input.pressed.add('primary');
    assert.equal(readDrop(input, tracker, 1.15), false);
    assert.equal(readDrop(input, tracker, 2), true, 'a later key press still drops');
  });

  test('Space, Enter, ArrowUp, and W drop; other keys do not', () => {
    const tracker = createTracker();
    for (const [actions, expected] of [
      [['primary'], true],
      [['primary', 'up'], true],
      [['secondary', 'down'], false],
      [['left'], false],
      [['right'], false],
    ]) {
      const input = fakeInput();
      for (const action of actions) input.pressed.add(action);
      assert.equal(readDrop(input, tracker, 5), expected, actions.join('+'));
    }
  });

  test('a pointer already down at start or resume does not drop', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 10, y: 10, down: true };
    resetTracker(tracker, input);
    assert.equal(readDrop(input, tracker, 0.2), false);
  });
});
