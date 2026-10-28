import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createTracker, readTurn, resetTracker } from '../../../src/games/tail/controls.js';
import tail from '../../../src/games/tail/index.js';
import { DOWN, LEFT, NONE, RIGHT, UP } from '../../../src/games/tail/tuning.js';
import { createWorld } from '../../../src/games/tail/world.js';
import { DT, fakeHost, fakeInput, seeded } from '../runner/fake-host.js';
import { followCycle, plainCtx, play, press, watchedHost } from './pilots.js';

const METHODS = ['start', 'update', 'render', 'pause', 'resume', 'destroy'];

describe('module', () => {
  test('metadata fits the contract', () => {
    assert.equal(tail.id, 'tail');
    assert.match(tail.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(tail.name, 'Dragon Tail');
    assert.equal(tail.controls.keyboard, 'ARROWS TO TURN');
    assert.equal(tail.controls.touch, 'SWIPE OR TAP TO TURN');
    assert.ok(tail.controls.keyboard.length <= 40);
    assert.ok(tail.controls.touch.length <= 40);
    assert.equal(tail.bestKey, 'best');
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = tail.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('render, update, and destroy before start do not throw', () => {
    const game = tail.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
    game.render(0);
  });

  test('draws Benjo, the page, and the grid once playing', () => {
    const host = fakeHost();
    const game = tail.create(host);
    game.start();
    play(host, game, 0.3);
    press(host.input, DOWN);
    play(host, game, 0.5);
    assert.ok(host.log.sprites >= 2);
    assert.ok(host.ctx.calls.count > 0);
  });

  test('keeps the hint up while Benjo waits, then clears it 3 seconds into the run', () => {
    const host = fakeHost();
    const game = tail.create(host);
    game.start();
    assert.equal(host.log.statuses[0], 'ARROWS TO TURN');
    play(host, game, 5);
    assert.equal(host.log.statuses.length, 1, 'still waiting for the first turn');
    // Circle a small square so the run lasts past the hint.
    play(host, game, 3.5, (t, input) => {
      if (Math.round(t / DT) % 30 === 0)
        press(input, [UP, RIGHT, DOWN, LEFT][Math.round(t / 0.5) % 4]);
    });
    assert.equal(host.log.ends.length, 0);
    assert.equal(host.log.statuses.at(-1), '');
  });

  test('a run with no input waits instead of ending', () => {
    const host = fakeHost();
    const game = tail.create(host);
    game.start();
    play(host, game, 30);
    assert.equal(host.log.ends.length, 0);
    assert.deepEqual(host.log.scores, [0]);
  });

  test('Space alone never starts the run', () => {
    const host = fakeHost();
    const game = tail.create(host);
    game.start();
    play(host, game, 10, (_t, input) => input.pressed.add('primary'));
    assert.equal(host.log.ends.length, 0);
  });

  test('heading straight for the wall ends once with the wall reason', () => {
    const host = fakeHost({ random: seeded(3) });
    const game = tail.create(host);
    game.start();
    play(host, game, 0.3);
    press(host.input, UP);
    play(host, game, 10);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'PAGES');
    assert.equal(result.reason, 'Benjo ran off the edge of the map.');
    assert.ok(Number.isInteger(result.score) && result.score >= 0);
    game.update(DT);
    assert.equal(host.log.ends.length, 1, 'end is not called twice');
    game.destroy();
    game.destroy();
  });

  test('a tap above Benjo starts the run upward, into the top wall', () => {
    const host = fakeHost();
    const ref = createWorld(host.size, seeded(1));
    const headX = ref.originX + (ref.xs[ref.head] + 0.5) * ref.cell;
    const game = tail.create(host);
    game.start();
    play(host, game, 0.3);
    host.input.pointer = { x: headX, y: ref.originY, down: true };
    play(host, game, 0.1);
    host.input.pointer = { x: headX, y: ref.originY, down: false };
    host.input.pressed.add('primary');
    play(host, game, 10);
    assert.equal(host.log.ends.length, 1);
    assert.equal(host.log.ends[0].reason, 'Benjo ran off the edge of the map.');
  });

  test('a tight U-turn on a long tail ends with the tail reason', () => {
    const { host, ref, seen } = watchedHost({ size: { width: 320, height: 240, dpr: 1 } });
    const game = tail.create(host);
    game.start();
    const follow = followCycle(seen, ref);
    const turns = [];
    let turning = false;
    play(host, game, 120, (t, input) => {
      const midRow = seen.col > 1 && seen.col < ref.cols - 1 && seen.row > 0;
      if (!turning && seen.moved && host.log.scores.at(-1) >= 3 && midRow) {
        // Mid-row the walker heads right on odd rows and left on even ones. Go up, back, then
        // down onto the old neck.
        turning = true;
        turns.push(UP, seen.row % 2 === 1 ? LEFT : RIGHT, DOWN);
      }
      if (!turning) return follow(t, input);
      if (!seen.moved || turns.length === 0) return;
      seen.moved = false;
      press(input, turns.shift());
    });
    assert.equal(host.log.ends.length, 1);
    assert.equal(host.log.ends[0].reason, 'Benjo tripped over his own tail.');
  });

  test('filling the whole board ends once with the win reason', () => {
    const { host, ref, seen } = watchedHost({ size: { width: 320, height: 240, dpr: 1 } });
    host.ctx = plainCtx();
    const game = tail.create(host);
    game.start();
    // Moves come at most every 5 steps, so a render every 2 still sees each new cell in time.
    play(host, game, 3000, followCycle(seen, ref), 2);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.reason, 'Benjo found every lost page.');
    assert.equal(result.score, ref.cols * ref.rows - 3);
  });

  test('pause stops the world and resume continues it', () => {
    const host = fakeHost();
    const game = tail.create(host);
    game.start();
    play(host, game, 0.3);
    press(host.input, UP);
    play(host, game, 0.1);
    game.pause();
    play(host, game, 10);
    game.render(0.5);
    assert.equal(host.log.ends.length, 0, 'a paused Benjo does not move');
    game.resume();
    play(host, game, 10);
    assert.equal(host.log.ends.length, 1);
  });

  test('announces a new best once the stored best is passed', () => {
    const { host, ref, seen } = watchedHost({ size: { width: 320, height: 240, dpr: 1 } });
    host.storage.setNumber(tail.bestKey, 1);
    const game = tail.create(host);
    game.start();
    play(host, game, 60, followCycle(seen, ref));
    assert.ok(Math.max(...host.log.scores) > 1, 'the walker passed the stored best');
    assert.equal(host.log.statuses.filter((s) => s === 'NEW BEST').length, 1);
  });

  test('survives a resize mid-run', () => {
    const host = fakeHost();
    const game = tail.create(host);
    game.start();
    play(host, game, 0.3);
    press(host.input, DOWN);
    play(host, game, 0.3);
    host.size.width = 375;
    host.size.height = 667;
    play(host, game, 0.3);
    game.render(0.25);
    host.size.width = 2560;
    host.size.height = 1080;
    play(host, game, 0.3);
    assert.equal(host.log.ends.length, 0);
  });

  test('runs with reduced motion and a tiny canvas', () => {
    const host = fakeHost({ reducedMotion: true, size: { width: 0, height: 0, dpr: 1 } });
    const game = tail.create(host);
    game.start();
    play(host, game, 0.3);
    press(host.input, RIGHT);
    play(host, game, 10);
    assert.equal(host.log.ends.length, 1);
  });
});

describe('controls', () => {
  /** Press at x, y, then release with the host's tap pulse after `hold` seconds. */
  function tap(input, tracker, x, y, now, hold = 0.1) {
    input.pointer = { x, y, down: true };
    const onDown = readTurn(input, tracker, now, 100, 200);
    input.pointer = { x, y, down: false };
    input.pressed.add('primary');
    const onUp = readTurn(input, tracker, now + hold, 100, 200);
    input.tick();
    return [onDown, onUp];
  }

  test('a tap turns on release, toward the side of the head it landed on', () => {
    const input = fakeInput();
    const tracker = createTracker();
    for (const [x, y, dir] of [
      [100, 40, UP],
      [300, 210, RIGHT],
      [10, 190, LEFT],
      [110, 400, DOWN],
      [150, 150, RIGHT],
    ]) {
      assert.deepEqual(tap(input, tracker, x, y, 1), [NONE, dir], `${x},${y}`);
    }
  });

  test('a press held past the tap window does not turn', () => {
    const input = fakeInput();
    const tracker = createTracker();
    assert.deepEqual(tap(input, tracker, 100, 40, 1, 0.5), [NONE, NONE]);
  });

  test('a swipe turns once, not also toward where the finger landed', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 100, y: 400, down: true };
    assert.equal(readTurn(input, tracker, 1, 100, 200), NONE);
    input.pointer = { x: 100, y: 300, down: false };
    input.swipe = 'up';
    assert.equal(readTurn(input, tracker, 1.2, 100, 200), UP);
  });

  test('Space alone does not turn, even with the pointer resting on the canvas', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 300, y: 10, down: false };
    input.pressed.add('primary');
    assert.equal(readTurn(input, tracker, 5, 100, 200), NONE);
  });

  test('keys and swipes map to turns, and ArrowUp turns up despite raising primary', () => {
    const tracker = createTracker();
    for (const [actions, expected] of [
      [['primary', 'up'], UP],
      [['secondary', 'down'], DOWN],
      [['left'], LEFT],
      [['right'], RIGHT],
      [['primary'], NONE],
      [['secondary'], NONE],
    ]) {
      const input = fakeInput();
      for (const action of actions) input.pressed.add(action);
      assert.equal(readTurn(input, tracker, 5, 0, 0), expected, actions.join('+'));
    }
    for (const [swipe, expected] of [
      ['up', UP],
      ['down', DOWN],
      ['left', LEFT],
      ['right', RIGHT],
    ]) {
      const input = fakeInput();
      input.swipe = swipe;
      assert.equal(readTurn(input, tracker, 5, 0, 0), expected, swipe);
    }
  });

  test('a pointer already down at start or resume does not turn when it lifts', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 10, y: 10, down: true };
    resetTracker(tracker, input);
    assert.equal(readTurn(input, tracker, 0.2, 100, 100), NONE);
    input.pointer = { x: 10, y: 10, down: false };
    input.pressed.add('primary');
    assert.equal(readTurn(input, tracker, 0.25, 100, 100), NONE);
  });
});
