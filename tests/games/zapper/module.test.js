import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  createIntent,
  createTracker,
  readIntent,
  resetTracker,
} from '../../../src/games/zapper/controls.js';
import zapper from '../../../src/games/zapper/index.js';
import { DT, fakeHost, fakeInput } from '../runner/fake-host.js';

const METHODS = ['start', 'update', 'render', 'pause', 'resume', 'destroy'];
const REASON_BITE = "A bug got into Benjo's code.";
const REASON_REACHED = 'The bugs reached the server room.';
const SMALL = { width: 320, height: 240, dpr: 1 };

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

/**
 * A host that remembers where the last frame drew Benjo and the bugs, so a test can steer from
 * what is on screen.
 */
function watchedHost(overrides) {
  const host = fakeHost(overrides);
  const frame = { benjo: 0, bugs: [] };
  host.drawSprite = (sprite, x) => {
    if (sprite === host.theme.sprites.benjo) frame.benjo = x;
    else if (host.theme.sprites.hazards.includes(sprite)) frame.bugs.push(x);
  };
  return { host, frame };
}

/** Hold the arrow keys toward `pick(bugXs, benjoX)`, optionally holding Space too. */
const steer =
  (frame, pick, fire = false) =>
  (t, input) => {
    input.held.clear();
    if (fire && t > 0.2) input.held.add('primary');
    const target = frame.bugs.length ? pick(frame.bugs, frame.benjo) : frame.benjo;
    if (Math.abs(target - frame.benjo) > 3) input.held.add(target > frame.benjo ? 'right' : 'left');
    frame.bugs = [];
  };
const leftmost = (xs) => Math.min(...xs);
const nearest = (xs, at) => xs.reduce((a, b) => (Math.abs(b - at) < Math.abs(a - at) ? b : a));

describe('module', () => {
  test('metadata fits the contract', () => {
    assert.equal(zapper.id, 'zapper');
    assert.match(zapper.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(zapper.name, 'Bug Zapper');
    assert.equal(zapper.controls.keyboard, 'ARROWS TO MOVE, SPACE TO BREATHE FIRE');
    assert.equal(zapper.controls.touch, 'DRAG TO MOVE, TAP TO BREATHE FIRE');
    assert.ok(zapper.controls.keyboard.length <= 40);
    assert.ok(zapper.controls.touch.length <= 40);
    assert.equal(zapper.bestKey, 'best');
    assert.ok(REASON_BITE.length <= 48 && REASON_REACHED.length <= 48);
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = zapper.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('render, update, and destroy before start do not throw', () => {
    const game = zapper.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
    game.render(0);
  });

  test('draws Benjo, the bugs, and the backdrop once playing', () => {
    const host = fakeHost();
    const game = zapper.create(host);
    game.start();
    play(host, game, 1);
    assert.ok(host.log.sprites >= 19, 'Benjo and 18 bugs');
    assert.ok(host.ctx.calls.count > 0);
  });

  test('shows the hint at start and clears it 3 seconds in', () => {
    const host = fakeHost();
    const game = zapper.create(host);
    game.start();
    assert.equal(host.log.statuses[0], zapper.controls.keyboard);
    play(host, game, 2.5);
    assert.equal(host.log.statuses.length, 1);
    play(host, game, 1);
    assert.equal(host.log.statuses.at(-1), '');
  });

  test('shows the touch hint after a touch', () => {
    const host = fakeHost();
    host.input.touch = true;
    const game = zapper.create(host);
    game.start();
    assert.equal(host.log.statuses[0], zapper.controls.touch);
  });

  test('a run with no input ends on its own, because the bugs keep coming', () => {
    const host = fakeHost({ size: { ...SMALL } });
    const game = zapper.create(host);
    game.start();
    play(host, game, 120);
    assert.equal(host.log.ends.length, 1);
    assert.ok([REASON_BITE, REASON_REACHED].includes(host.log.ends[0].reason));
  });

  test('three bites end the run once with the bite reason', () => {
    // random 0 always picks the leftmost column, and Benjo stands under it.
    const { host, frame } = watchedHost({ random: () => 0, size: { ...SMALL } });
    const game = zapper.create(host);
    game.start();
    play(host, game, 30, steer(frame, leftmost));
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.reason, REASON_BITE);
    assert.equal(result.scoreLabel, 'SCORE');
    assert.equal(result.score, 0);
    assert.ok(host.log.statuses.includes('LIVES LEFT: 2'));
    assert.ok(host.log.statuses.includes('LIVES LEFT: 1'));
    assert.ok(!host.log.statuses.includes('LIVES LEFT: 0'));
    game.update(DT);
    assert.equal(host.log.ends.length, 1, 'end is not called twice');
    game.destroy();
    game.destroy();
    game.render(0);
  });

  test('bugs that reach Benjo row end the run with the reached reason', () => {
    // random near 1 always picks the rightmost column, and Benjo hides at the far left.
    const host = fakeHost({ random: () => 0.999, size: { ...SMALL } });
    const game = zapper.create(host);
    game.start();
    host.input.held.add('left');
    play(host, game, 120);
    assert.equal(host.log.ends.length, 1);
    assert.equal(host.log.ends[0].reason, REASON_REACHED);
  });

  test('pause stops the world and resume continues it', () => {
    const { host, frame } = watchedHost({ random: () => 0, size: { ...SMALL } });
    const game = zapper.create(host);
    game.start();
    play(host, game, 0.5, steer(frame, leftmost));
    game.pause();
    const statuses = host.log.statuses.length;
    play(host, game, 30, steer(frame, leftmost));
    assert.equal(host.log.ends.length, 0, 'a paused Benjo is never bitten');
    assert.equal(host.log.statuses.length, statuses);
    game.render(0.5);
    game.resume();
    play(host, game, 30, steer(frame, leftmost));
    assert.equal(host.log.ends.length, 1);
  });

  test('announces a new best once the stored best is passed, and the next wave', () => {
    const { host, frame } = watchedHost({ random: () => 0.999, size: { ...SMALL } });
    host.storage.setNumber(zapper.bestKey, 5);
    const game = zapper.create(host);
    game.start();
    play(host, game, 40, steer(frame, nearest, true));
    assert.ok(Math.max(...host.log.scores) > 5);
    assert.equal(host.log.statuses.filter((s) => s === 'NEW BEST').length, 1);
    assert.ok(host.log.statuses.includes('WAVE 2'));
    assert.ok(host.log.scores.every(Number.isInteger));
  });

  test('survives a resize mid-run', () => {
    const { host, frame } = watchedHost();
    const game = zapper.create(host);
    game.start();
    play(host, game, 2, steer(frame, nearest, true));
    host.size.width = 375;
    host.size.height = 667;
    play(host, game, 2, steer(frame, nearest, true));
    host.size.width = 320;
    host.size.height = 240;
    game.render(0.25);
    play(host, game, 1, steer(frame, nearest, true));
    assert.equal(host.log.ends.length, 0);
  });

  test('runs with reduced motion and a tiny canvas', () => {
    const host = fakeHost({ reducedMotion: true, size: { width: 0, height: 0, dpr: 1 } });
    const game = zapper.create(host);
    game.start();
    play(host, game, 2, (_t, input) => input.held.add('primary'));
    assert.ok(host.log.sprites > 0);
  });
});

describe('controls', () => {
  test('a pointer press fires on its down edge, keeps firing while held, and drags', () => {
    const input = fakeInput();
    const tracker = createTracker();
    const intent = createIntent();
    input.pointer = { x: 120, y: 10, down: true };
    assert.equal(readIntent(input, tracker, 1, intent).fire, true);
    assert.equal(intent.targetX, 120);
    readIntent(input, tracker, 1.1, intent);
    assert.equal(intent.fire, false);
    assert.equal(intent.firing, true);
    input.pointer = { x: 120, y: 10, down: false };
    readIntent(input, tracker, 1.2, intent);
    assert.equal(intent.targetX, null, 'a hovering pointer does not drag');
  });

  test('the host tap that follows a pointer press does not fire again', () => {
    const input = fakeInput();
    const tracker = createTracker();
    const intent = createIntent();
    input.pointer = { x: 10, y: 10, down: true };
    readIntent(input, tracker, 1, intent);
    input.pointer = { x: 10, y: 10, down: false };
    input.pressed.add('primary');
    input.held.add('primary');
    readIntent(input, tracker, 1.15, intent);
    assert.equal(intent.fire, false);
    assert.equal(intent.firing, false);
    assert.equal(readIntent(input, tracker, 2, intent).fire, true, 'a later key press fires');
  });

  test('maps keys to moves and fire, with ArrowUp (primary and up) as one shot', () => {
    const tracker = createTracker();
    for (const [actions, move, fire] of [
      [['primary'], 0, true],
      [['primary', 'up'], 0, true],
      [['up'], 0, true],
      [['secondary', 'down'], 0, false],
      [['left'], -1, false],
      [['right'], 1, false],
      [['left', 'right'], 0, false],
    ]) {
      const input = fakeInput();
      for (const action of actions) {
        input.pressed.add(action);
        input.held.add(action);
      }
      const intent = readIntent(input, tracker, 5, createIntent());
      assert.equal(intent.move, move, actions.join('+'));
      assert.equal(intent.fire, fire, actions.join('+'));
      assert.equal(intent.firing, fire, actions.join('+'));
    }
  });

  test('a pointer or key already down at start or resume does not fire until let go', () => {
    for (const hold of ['pointer', 'primary', 'up']) {
      const input = fakeInput();
      const tracker = createTracker();
      const intent = createIntent();
      if (hold === 'pointer') input.pointer = { x: 10, y: 10, down: true };
      else input.held.add(hold);
      resetTracker(tracker, input);
      readIntent(input, tracker, 0.2, intent);
      assert.equal(intent.fire || intent.firing, false, hold);
      input.pointer = null;
      input.held.clear();
      readIntent(input, tracker, 0.3, intent);
      input.held.add('primary');
      assert.equal(readIntent(input, tracker, 0.4, intent).firing, true, `${hold} rearms`);
    }
  });
});
