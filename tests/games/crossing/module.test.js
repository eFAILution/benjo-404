import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createTracker, readHop, resetTracker } from '../../../src/games/crossing/controls.js';
import crossing from '../../../src/games/crossing/index.js';
import { DT, fakeHost, fakeInput, seeded } from '../runner/fake-host.js';

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

/** Press Up every `every` seconds, after the start grace. */
const hopEvery = (every) => (t, input) => {
  if (t > 0.2 && Math.round(t / DT) % Math.round(every / DT) === 0) input.pressed.add('up');
};

describe('module', () => {
  test('metadata fits the contract', () => {
    assert.equal(crossing.id, 'crossing');
    assert.match(crossing.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(crossing.name, 'Code Crossing');
    assert.equal(crossing.controls.keyboard, 'ARROWS OR SPACE TO HOP');
    assert.equal(crossing.controls.touch, 'TAP OR SWIPE TO HOP');
    assert.ok(crossing.controls.keyboard.length <= 40);
    assert.ok(crossing.controls.touch.length <= 40);
    assert.equal(crossing.bestKey, 'best');
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = crossing.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('render, update, and destroy before start do not throw', () => {
    const game = crossing.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
  });

  test('draws Benjo, blocks, and the board once playing', () => {
    const host = fakeHost();
    const game = crossing.create(host);
    game.start();
    play(host, game, 2, hopEvery(0.5));
    assert.ok(host.log.sprites > 0);
    assert.ok(host.ctx.calls.count > 0);
  });

  test('shows the hint at start and clears it 3 seconds in', () => {
    const host = fakeHost();
    const game = crossing.create(host);
    game.start();
    assert.equal(host.log.statuses[0], 'ARROWS OR SPACE TO HOP');
    play(host, game, 2.9);
    assert.equal(host.log.statuses.length, 1);
    play(host, game, 0.2);
    assert.equal(host.log.statuses.at(-1), '');
  });

  test('shows the touch hint when the last input was touch', () => {
    const host = fakeHost();
    host.input.touch = true;
    const game = crossing.create(host);
    game.start();
    assert.equal(host.log.statuses[0], 'TAP OR SWIPE TO HOP');
  });

  test('a run with no input times out three times and ends once', () => {
    const host = fakeHost();
    const game = crossing.create(host);
    game.start();
    play(host, game, 21);
    assert.ok(host.log.statuses.includes('LIVES LEFT: 2'));
    assert.equal(host.log.ends.length, 0);
    play(host, game, 45);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'SCORE');
    assert.equal(result.reason, "Benjo's request timed out.");
    assert.equal(result.score, 0);
    game.update(DT);
    assert.equal(host.log.ends.length, 1, 'end is not called twice');
    game.destroy();
    game.destroy();
  });

  test('hopping into traffic without looking ends with the block reason', () => {
    const host = fakeHost({ random: seeded(5) });
    const game = crossing.create(host);
    game.start();
    play(host, game, 60, hopEvery(1));
    assert.equal(host.log.ends.length, 1);
    assert.equal(host.log.ends[0].reason, 'Benjo got flattened by a code block.');
    assert.ok(host.log.ends[0].score > 0);
    assert.ok(Number.isInteger(host.log.ends[0].score));
  });

  test('reaching the goal curb announces the next level', () => {
    // Seed 6 leaves a gap at every hop when Benjo hops up every 0.2 s.
    const host = fakeHost({ random: seeded(6) });
    const game = crossing.create(host);
    game.start();
    play(host, game, 2, hopEvery(0.2));
    assert.ok(host.log.statuses.includes('LEVEL 2'));
    assert.ok(host.log.scores.includes(170), 'seven rows and the goal');
  });

  test('pause stops the world and resume continues it', () => {
    const host = fakeHost();
    const game = crossing.create(host);
    game.start();
    play(host, game, 1);
    game.pause();
    play(host, game, 25);
    assert.equal(host.log.statuses.includes('LIVES LEFT: 2'), false, 'a paused clock stops');
    game.render(0.5);
    game.resume();
    play(host, game, 20);
    assert.ok(host.log.statuses.includes('LIVES LEFT: 2'));
  });

  test('announces a new best once the stored best is passed', () => {
    const host = fakeHost();
    host.storage.setNumber(crossing.bestKey, 5);
    const game = crossing.create(host);
    game.start();
    play(host, game, 0.3);
    host.input.pressed.add('up');
    play(host, game, 0.2);
    assert.deepEqual(host.log.scores, [0, 10]);
    assert.equal(host.log.statuses.filter((s) => s === 'NEW BEST').length, 1);
  });

  test('survives a resize mid-run', () => {
    const host = fakeHost();
    const game = crossing.create(host);
    game.start();
    play(host, game, 1, hopEvery(0.4));
    host.size.width = 375;
    host.size.height = 667;
    play(host, game, 1, hopEvery(0.4));
    game.render(0.25);
  });

  test('runs with reduced motion and a tiny canvas', () => {
    const host = fakeHost({ reducedMotion: true, size: { width: 0, height: 0, dpr: 1 } });
    const game = crossing.create(host);
    game.start();
    play(host, game, 2, hopEvery(0.3));
    game.render(0.5);
  });
});

describe('controls', () => {
  test('a pointer press hops toward the pressed spot when it ends', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 300, y: 210, down: true };
    assert.equal(readHop(input, tracker, 1, 200, 200), null, 'a press may still become a swipe');
    input.pointer = { x: 300, y: 210, down: false };
    assert.equal(readHop(input, tracker, 1.1, 200, 200), 'right');
    input.pointer = { x: 190, y: 400, down: true };
    readHop(input, tracker, 2, 200, 200);
    input.pointer = { x: 190, y: 400, down: false };
    assert.equal(readHop(input, tracker, 2.1, 200, 200), 'down');
  });

  test('the host tap that echoes a pointer press does not hop again', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 200, y: 100, down: true };
    readHop(input, tracker, 1, 200, 200);
    input.pointer = { x: 200, y: 100, down: false };
    input.pressed.add('primary');
    assert.equal(readHop(input, tracker, 1.1, 200, 200), 'up');
    input.tick();
    input.pressed.add('primary');
    assert.equal(readHop(input, tracker, 1.2, 200, 200), null, 'a late echo is dropped');
    assert.equal(readHop(input, tracker, 1.3, 200, 200), null);
    input.pressed.add('primary');
    assert.equal(readHop(input, tracker, 2, 200, 200), 'up', 'a later key press still hops');
  });

  test('a swipe wins over the press it started with', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 200, y: 400, down: true };
    readHop(input, tracker, 1, 200, 200);
    input.pointer = { x: 260, y: 400, down: false };
    input.swipe = 'left';
    assert.equal(readHop(input, tracker, 1.2, 200, 200), 'left');
    input.tick();
    assert.equal(readHop(input, tracker, 1.3, 200, 200), null);
  });

  test('keys map to hops, and ArrowUp (primary and up together) hops once', () => {
    for (const [actions, expected] of [
      [['primary'], 'up'],
      [['primary', 'up'], 'up'],
      [['secondary', 'down'], 'down'],
      [['left'], 'left'],
      [['right'], 'right'],
      [['secondary'], null],
      [['pause'], null],
    ]) {
      const input = fakeInput();
      for (const action of actions) input.pressed.add(action);
      assert.equal(readHop(input, createTracker(), 5, 0, 0), expected, actions.join('+'));
    }
  });

  test('a pointer already down at start or resume does not hop', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 10, y: 10, down: true };
    resetTracker(tracker, input);
    assert.equal(readHop(input, tracker, 0.2, 200, 200), null);
    input.pointer = { x: 10, y: 10, down: false };
    assert.equal(readHop(input, tracker, 0.3, 200, 200), null);
  });
});
