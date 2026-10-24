import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createHost, MAX_STEPS } from '../../src/shell/host.js';
import { fakeGame, fakeHostOptions } from './fixtures/fake-host-env.js';

const FRAME_MS = 1000 / 60;

function setup(behavior, overrides) {
  const game = fakeGame(behavior);
  const env = fakeHostOptions(game, overrides);
  const host = createHost(env.options);
  return { game, host, ...env, frames: env.options.frames, hud: env.options.hud };
}

const count = (log, name) => log.filter((entry) => entry === name).length;

describe('createHost lifecycle', () => {
  it('runs create, start, update, render in that order on the first frame', () => {
    const { game, host, frames, classes, attract } = setup();
    host.play();
    assert.equal(host.state, 'playing');
    assert.ok(classes.has('is-playing'));
    assert.equal(attract.running, false);
    frames.run(1000);
    assert.deepEqual(game.log, ['create', 'start', 'update', 'render']);
  });

  it('gives the game a context with every HostContext member', () => {
    const { game, host } = setup();
    host.play();
    for (const key of ['root', 'canvas', 'ctx', 'size', 'input', 'theme', 'storage', 'signal']) {
      assert.ok(key in game.host, `missing ${key}`);
    }
    for (const fn of ['random', 'drawSprite', 'setScore', 'setStatus', 'end']) {
      assert.equal(typeof game.host[fn], 'function', `missing ${fn}`);
    }
    assert.equal(game.host.signal.aborted, false);
  });

  it('calls destroy exactly once when end() is called twice', () => {
    const { game, host, classes, hud } = setup();
    host.play();
    game.host.end({ score: 42, scoreLabel: 'DISTANCE', reason: 'Benjo hit a broken link.' });
    game.host.end({ score: 99 });
    host.quit();
    assert.equal(count(game.log, 'destroy'), 1);
    assert.equal(game.host.signal.aborted, true);
    const over = hud.events.find(([name]) => name === 'over');
    assert.deepEqual(over[1], {
      score: 42,
      best: 42,
      scoreLabel: 'DISTANCE',
      reason: 'Benjo hit a broken link.',
    });
    assert.ok(!classes.has('is-playing'));
  });

  it('ends from inside update without running more steps or a render', () => {
    const { game, host, frames } = setup({ update: () => game.host.end({ score: 1 }) });
    host.play();
    frames.run(0);
    frames.run(2000);
    assert.deepEqual(game.log, ['create', 'start', 'update', 'destroy']);
    assert.equal(host.state, 'over');
    assert.equal(frames.pending, 0);
  });

  it('saves the best score only when it improves', () => {
    const { game, host, options } = setup();
    host.play();
    game.host.end({ score: 50 });
    assert.equal(options.storage.getNumber('best', 0), 50);
    host.play();
    game.host.end({ score: 10 });
    assert.equal(options.storage.getNumber('best', 0), 50);
  });

  it('play again builds a fresh instance with a fresh signal', () => {
    const { game, host, classes } = setup();
    host.play();
    const firstSignal = game.host.signal;
    game.host.end({ score: 3 });
    assert.ok(classes.has('is-over'));
    host.play();
    assert.ok(!classes.has('is-over'));
    assert.notEqual(game.host.signal, firstSignal);
    assert.equal(count(game.log, 'create'), 2);
  });
});

describe('createHost stale runs', () => {
  it("ignores the previous run's end and setScore during the next run", () => {
    let stale = null;
    const { game, host, hud, frames } = setup({
      update: () => {
        stale?.end({ score: 99 });
        stale?.setScore(42);
        stale?.setStatus('stale');
      },
    });
    host.play();
    stale = game.host;
    stale.end({ score: 1 });
    host.play();
    frames.run(0);
    assert.equal(host.state, 'playing');
    assert.equal(count(game.log, 'destroy'), 1);
    assert.equal(stale.signal.aborted, true);
    assert.equal(game.host.signal.aborted, false);
    assert.ok(!hud.events.some(([name, value]) => name === 'score' && value === 42));
    assert.ok(!hud.events.some(([name, value]) => name === 'status' && value === 'stale'));
    assert.equal(hud.events.filter(([name]) => name === 'over').length, 1);
  });

  it("keeps each run's setScore dedupe separate", () => {
    const { game, host, hud } = setup();
    host.play();
    game.host.setScore(7);
    game.host.end({ score: 7 });
    host.play();
    game.host.setScore(7);
    const scores = hud.events.filter(([name]) => name === 'score').map(([, value]) => value);
    assert.deepEqual(scores, [0, 7, 0, 7]);
  });
});

describe('createHost error isolation', () => {
  it('a throwing update destroys the game, leaves is-playing, and restarts attract', () => {
    let explode = true;
    const failures = [];
    const { game, host, frames, classes, attract, errors } = setup(
      {
        update: () => {
          if (explode) throw new Error('boom');
        },
      },
      { onFailure: (n) => failures.push(n) },
    );
    host.play();
    frames.run(0);
    assert.equal(count(game.log, 'destroy'), 1);
    assert.ok(!classes.has('is-playing'));
    assert.equal(host.state, 'idle');
    assert.equal(attract.running, true);
    assert.equal(errors.length, 1);
    assert.deepEqual(failures, [1]);
    assert.equal(frames.pending, 0);

    explode = false;
    host.play();
    frames.run(100);
    assert.equal(host.state, 'playing');
    assert.equal(count(game.log, 'start'), 2);
  });

  it('survives a throwing create and a throwing destroy', () => {
    const { host, classes, errors } = setup({
      start: () => {
        throw new Error('start');
      },
      destroy: () => {
        throw new Error('destroy');
      },
    });
    host.play();
    assert.equal(host.state, 'idle');
    assert.ok(!classes.has('is-playing'));
    assert.equal(errors.length, 1);
    assert.equal(host.failures, 1);
  });
});

describe('createHost loop', () => {
  it('never runs more than five updates in one frame', () => {
    const { game, host, frames } = setup();
    host.play();
    frames.run(0);
    game.log.length = 0;
    frames.run(5000);
    assert.equal(count(game.log, 'update'), MAX_STEPS);
    assert.equal(count(game.log, 'render'), 1);
  });

  it('runs one update per 1/60 s frame', () => {
    const { game, host, frames } = setup();
    host.play();
    frames.run(0);
    game.log.length = 0;
    for (let i = 1; i <= 10; i++) frames.run(i * FRAME_MS);
    assert.equal(count(game.log, 'update'), 10);
  });

  it('pause stops the loop and resume resets the accumulator', () => {
    const { game, host, frames, classes, hud } = setup();
    host.play();
    frames.run(0);
    host.pause();
    assert.equal(host.state, 'paused');
    assert.ok(classes.has('is-paused'));
    assert.equal(frames.pending, 0);
    assert.ok(hud.events.some(([name]) => name === 'paused'));
    host.resume();
    game.log.length = 0;
    frames.run(60000);
    assert.equal(count(game.log, 'update'), 0, 'no catch-up steps after resume');
    frames.run(60000 + FRAME_MS);
    assert.equal(count(game.log, 'update'), 1);
    assert.ok(!classes.has('is-paused'));
  });

  it('moves focus to Resume on a normal pause but not on a pause from the message strip', () => {
    const { host, hud } = setup();
    host.play();
    host.pause();
    host.resume();
    host.pause({ focus: false });
    const paused = hud.events.filter(([name]) => name === 'paused').map(([, value]) => value);
    assert.deepEqual(paused, [{ focus: true }, { focus: false }]);
  });

  it('quit from pause destroys, aborts, and returns to idle', () => {
    const { game, host, classes, attract } = setup();
    host.play();
    host.pause();
    host.quit();
    assert.equal(host.state, 'idle');
    assert.equal(count(game.log, 'destroy'), 1);
    assert.equal(game.host.signal.aborted, true);
    assert.equal(classes.size, 0);
    assert.equal(attract.running, true);
  });

  it('justPressed is true for exactly one update tick', () => {
    const seen = [];
    const { game, host, frames } = setup({
      update: () => seen.push(game.host.input.justPressed('primary')),
    });
    host.play();
    frames.run(0);
    game.host.input.press('primary');
    frames.run(3 * FRAME_MS);
    assert.deepEqual(seen, [false, true, false, false]);
    assert.equal(game.host.input.isDown('primary'), true);
  });

  it('setScore only reaches the HUD when the value changes', () => {
    const { game, host, hud } = setup();
    host.play();
    game.host.setScore(5);
    game.host.setScore(5);
    game.host.setScore(6);
    const scores = hud.events.filter(([name]) => name === 'score').map(([, value]) => value);
    assert.deepEqual(scores, [0, 5, 6]);
  });
});
