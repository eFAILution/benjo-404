import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createTracker, readIntent, resetTracker } from '../../../src/games/breakout/controls.js';
import breakout from '../../../src/games/breakout/index.js';
import { DT, fakeHost, fakeInput, seeded } from '../runner/fake-host.js';

const METHODS = ['start', 'update', 'render', 'pause', 'resume', 'destroy'];
const REASON = "Benjo's fireball fizzled out.";

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
 * A host whose drawn fireball is tracked: the ball's core is the last arc of each frame.
 * Benjo's center is tracked from his sprite.
 */
function watchedHost(overrides = {}) {
  const host = fakeHost(overrides);
  const seen = { ball: null, benjo: null };
  host.ctx.arc = (x, y) => {
    seen.ball = { x, y };
  };
  host.drawSprite = (sprite, x, y) => {
    host.log.sprites += 1;
    if (sprite === host.theme.sprites.benjo) seen.benjo = { x, y };
  };
  return { host, seen };
}

/** Most the pilot aims off the ball, in px: inside the smallest paddle half-width. */
const AIM_PX = 20;

/**
 * Serve, then steer the pointer under the drawn ball. The aim moves off center to a new seeded
 * spot every half second, so the angles vary and the ball does not settle into one loop.
 */
function pilot(seen, seed = 11) {
  const pick = seeded(seed);
  let offset = 0;
  return (t, input) => {
    if (t > 0.2) input.pressed.add('primary');
    if (Math.round(t / DT) % 30 === 0) offset = (pick() * 2 - 1) * AIM_PX;
    if (seen.ball) input.pointer = { x: seen.ball.x + offset, y: 300, down: false };
  };
}

/** Serve whenever the ball waits, never move. */
const serveOnly = (t, input) => {
  if (t > 0.2) input.pressed.add('primary');
};

describe('module', () => {
  test('metadata fits the contract', () => {
    assert.equal(breakout.id, 'breakout');
    assert.match(breakout.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(breakout.name, 'Break the 404');
    assert.equal(breakout.controls.keyboard, 'ARROWS TO MOVE, SPACE TO SERVE');
    assert.equal(breakout.controls.touch, 'DRAG TO MOVE, TAP TO SERVE');
    assert.ok(breakout.controls.keyboard.length <= 40);
    assert.ok(breakout.controls.touch.length <= 40);
    assert.equal(breakout.bestKey, 'best');
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = breakout.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('render, update, and destroy before start do not throw', () => {
    const game = breakout.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
    game.render(0);
  });

  test('draws Benjo, the bricks, and the ball once playing', () => {
    const { host, seen } = watchedHost();
    const game = breakout.create(host);
    game.start();
    play(host, game, 2, pilot(seen));
    assert.ok(host.log.sprites > 0);
    assert.ok(host.ctx.calls.count > 0);
    assert.ok(seen.ball && seen.benjo);
    assert.ok(seen.ball.y < seen.benjo.y, 'the ball is in play above Benjo');
  });

  test('keeps the hint up while the ball waits, then clears it 3 seconds after the serve', () => {
    const { host, seen } = watchedHost();
    const game = breakout.create(host);
    game.start();
    assert.deepEqual(host.log.statuses, ['ARROWS TO MOVE, SPACE TO SERVE']);
    play(host, game, 5);
    assert.equal(host.log.statuses.length, 1, 'still waiting for the serve');
    const steer = pilot(seen);
    play(host, game, 3, steer);
    assert.equal(host.log.statuses.length, 1, 'the serve came 0.2 s in');
    play(host, game, 0.3, steer);
    assert.equal(host.log.statuses.at(-1), '');
  });

  test('shows the touch hint after touch input', () => {
    const host = fakeHost();
    host.input.touch = true;
    const game = breakout.create(host);
    game.start();
    assert.equal(host.log.statuses[0], 'DRAG TO MOVE, TAP TO SERVE');
  });

  test('a run with no input waits instead of ending', () => {
    const host = fakeHost();
    const game = breakout.create(host);
    game.start();
    play(host, game, 30);
    assert.equal(host.log.ends.length, 0);
    assert.deepEqual(host.log.scores, [0]);
  });

  test('a paddle that never moves loses three balls and ends once', () => {
    const host = fakeHost({ random: seeded(3) });
    const game = breakout.create(host);
    game.start();
    play(host, game, 120, serveOnly);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'SCORE');
    assert.equal(result.reason, REASON);
    assert.ok(result.reason.length <= 48);
    assert.ok(Number.isInteger(result.score) && result.score >= 0);
    assert.ok(host.log.statuses.includes('BALLS LEFT: 2'));
    assert.ok(host.log.statuses.includes('BALLS LEFT: 1'));
    game.update(DT);
    assert.equal(host.log.ends.length, 1, 'end is not called twice');
    game.destroy();
    game.destroy();
    game.render(0);
  });

  test('a cleared wall announces ROUND 2', () => {
    const { host, seen } = watchedHost({ size: { width: 320, height: 240, dpr: 1 } });
    const game = breakout.create(host);
    game.start();
    play(host, game, 240, pilot(seen));
    assert.ok(host.log.statuses.includes('ROUND 2'));
  });

  test('pause stops the world and resume continues it', () => {
    const { host, seen } = watchedHost();
    const game = breakout.create(host);
    game.start();
    play(host, game, 0.5, pilot(seen));
    game.pause();
    const before = { ...seen.ball };
    play(host, game, 3, pilot(seen));
    assert.deepEqual(seen.ball, before, 'a paused ball does not move');
    game.resume();
    play(host, game, 0.5, pilot(seen));
    assert.notDeepEqual(seen.ball, before);
  });

  test('announces a new best once the stored best is passed', () => {
    const { host, seen } = watchedHost();
    host.storage.setNumber(breakout.bestKey, 10);
    const game = breakout.create(host);
    game.start();
    play(host, game, 60, pilot(seen));
    assert.ok(Math.max(...host.log.scores) > 10, 'the pilot passed the stored best');
    assert.equal(host.log.statuses.filter((s) => s === 'NEW BEST').length, 1);
  });

  test('survives a resize mid-run', () => {
    const { host, seen } = watchedHost();
    const game = breakout.create(host);
    game.start();
    play(host, game, 1, pilot(seen));
    host.size.width = 375;
    host.size.height = 667;
    play(host, game, 1, pilot(seen));
    game.render(0.25);
    assert.ok(seen.ball.x > 0 && seen.ball.x < 375);
    assert.equal(host.log.ends.length, 0);
  });

  test('runs with reduced motion and a tiny canvas', () => {
    const { host, seen } = watchedHost({
      reducedMotion: true,
      size: { width: 0, height: 0, dpr: 1 },
    });
    const game = breakout.create(host);
    game.start();
    play(host, game, 2, pilot(seen));
    game.render(0.5);
  });
});

describe('controls', () => {
  test('a pointer press serves on its down edge only', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 10, y: 10, down: true };
    assert.equal(readIntent(input, tracker, 1).serve, true);
    assert.equal(readIntent(input, tracker, 1.1).serve, false);
  });

  test('the host tap that follows a pointer press does not serve again', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 10, y: 10, down: true };
    readIntent(input, tracker, 1);
    input.pointer = { x: 10, y: 10, down: false };
    input.pressed.add('primary');
    assert.equal(readIntent(input, tracker, 1.15).serve, false);
    assert.equal(readIntent(input, tracker, 2).serve, true, 'a later key press still serves');
  });

  test('keys map to serve and paddle moves', () => {
    // Each case is the set of actions one key raises (src/shell/input.js KEY_MAP).
    for (const [name, actions, serve, move] of [
      ['Space', ['primary'], true, 0],
      ['ArrowUp', ['primary', 'up'], true, 0],
      ['ArrowDown', ['secondary', 'down'], false, 0],
      ['ArrowLeft', ['left'], false, -1],
      ['ArrowRight', ['right'], false, 1],
    ]) {
      const input = fakeInput();
      for (const action of actions) {
        input.pressed.add(action);
        input.held.add(action);
      }
      const intent = readIntent(input, createTracker(), 5);
      assert.equal(intent.serve, serve, name);
      assert.equal(intent.move, move, name);
    }
  });

  test('a moving pointer sets a target, and a held key overrides it', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 200, y: 300, down: false };
    assert.equal(readIntent(input, tracker, 1).targetX, 200);
    assert.equal(readIntent(input, tracker, 1.1).targetX, 200, 'the target holds');
    input.held.add('left');
    const held = readIntent(input, tracker, 1.2);
    assert.equal(held.move, -1);
    assert.equal(held.targetX, null);
  });

  test('a pointer already down or hovering at start or resume does nothing', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 120, y: 10, down: true };
    resetTracker(tracker, input);
    const intent = readIntent(input, tracker, 0.2);
    assert.equal(intent.serve, false);
    assert.equal(intent.targetX, null);
  });
});
