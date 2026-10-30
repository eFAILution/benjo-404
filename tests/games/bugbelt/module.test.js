import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  createIntent,
  createTracker,
  readIntent,
  resetTracker,
} from '../../../src/games/bugbelt/controls.js';
import bugBelt from '../../../src/games/bugbelt/index.js';
import { SHIP } from '../../../src/games/bugbelt/ship.js';
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
    assert.equal(bugBelt.id, 'bugbelt');
    assert.match(bugBelt.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(bugBelt.name, 'Bug Belt');
    assert.ok(bugBelt.controls.keyboard.length <= 40);
    assert.ok(bugBelt.controls.touch.length <= 40);
    assert.equal(typeof bugBelt.bestKey, 'string');
  });

  test('the ship sprite uses palette colors only', () => {
    for (const path of SHIP.paths) assert.match(path.fill, /^(ink|muted|accent|glow|bg|hazard)$/);
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = bugBelt.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('render before start and destroy before start do not throw', () => {
    const game = bugBelt.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
  });

  test('draws the ship, Benjo, and the bugs once flying', () => {
    const host = fakeHost();
    const game = bugBelt.create(host);
    game.start();
    play(host, game, 1);
    assert.ok(host.log.sprites >= 6);
    assert.ok(host.ctx.calls.count > 0);
  });

  test('shows the keys hint, or the touch hint on a touch device', () => {
    const host = fakeHost();
    bugBelt.create(host).start();
    assert.equal(host.log.statuses[0], 'TURN, THRUST, SPACE TO FIRE');
    const touch = fakeHost();
    touch.input.touch = true;
    bugBelt.create(touch).start();
    assert.equal(touch.log.statuses[0], 'HOLD TO FLY AND FIRE');
  });

  test('losing the last ship ends the run once with the score and reason', () => {
    const host = fakeHost();
    const tracked = [];
    host.track = (x, y) => tracked.push([x, y]);
    const game = bugBelt.create(host);
    game.start();
    play(host, game, 0.5);
    const snap = game.snapshot();
    const { world } = snap;
    Object.assign(world, { lives: 1, graceT: 0 });
    Object.assign(world.bugs[0], { active: true, size: 0, x: world.x, y: world.y, vx: 0, vy: 0 });
    game.restore(snap);
    play(host, game, 3);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'SCORE');
    assert.equal(result.reason, 'The bugs took the last ship.');
    assert.equal(result.score, host.log.scores.at(-1));
    assert.ok(tracked.length > 0, 'the ghost is tracked');
  });

  test('a lost ship that is not the last one keeps the run going', () => {
    const host = fakeHost();
    const game = bugBelt.create(host);
    game.start();
    play(host, game, 0.5);
    const snap = game.snapshot();
    const { world } = snap;
    Object.assign(world.bugs[0], { active: true, size: 2, x: world.x, y: world.y, vx: 0, vy: 0 });
    game.restore(snap);
    play(host, game, 1);
    assert.equal(game.snapshot().world.lives, 2);
    assert.equal(host.log.ends.length, 0);
    assert.equal(host.log.statuses.at(-1), 'LIVES LEFT: 2');
  });

  test('pause stops the run until resume', () => {
    const host = fakeHost();
    const game = bugBelt.create(host);
    game.start();
    play(host, game, 0.5);
    const before = game.snapshot().world.time;
    game.pause();
    play(host, game, 1);
    assert.equal(game.snapshot().world.time, before);
    game.resume();
    play(host, game, 0.2);
    assert.ok(game.snapshot().world.time > before);
  });
});

describe('controls', () => {
  /** A tracker past the start, with nothing held. */
  function fresh(input = fakeInput()) {
    const tracker = createTracker();
    resetTracker(tracker, input);
    return { input, tracker, intent: createIntent() };
  }

  test('left and right turn, and Up thrusts without firing', () => {
    const { input, tracker, intent } = fresh();
    input.held.add('right');
    input.held.add('up');
    input.held.add('primary');
    input.pressed.add('up');
    input.pressed.add('primary');
    readIntent(input, tracker, 1, intent);
    assert.deepEqual(
      [intent.turn, intent.thrust, intent.fire, intent.firing],
      [1, true, false, false],
    );
  });

  test('Space fires on the press and keeps firing while held', () => {
    const { input, tracker, intent } = fresh();
    input.held.add('primary');
    input.pressed.add('primary');
    readIntent(input, tracker, 1, intent);
    assert.deepEqual([intent.fire, intent.firing], [true, true]);
    input.tick();
    readIntent(input, tracker, 1.1, intent);
    assert.deepEqual([intent.fire, intent.firing], [false, true]);
  });

  test('a Space still held from the start does not fire until it comes back up', () => {
    const input = fakeInput();
    input.held.add('primary');
    const { tracker, intent } = fresh(input);
    readIntent(input, tracker, 1, intent);
    assert.equal(intent.firing, false);
    input.held.delete('primary');
    readIntent(input, tracker, 1.1, intent);
    input.held.add('primary');
    input.pressed.add('primary');
    readIntent(input, tracker, 1.2, intent);
    assert.equal(intent.fire, true);
  });

  test('a pointer press fires and steers; the host tap echo of it does not fire again', () => {
    const { input, tracker, intent } = fresh();
    input.pointer = { x: 30, y: 40, down: true };
    readIntent(input, tracker, 1, intent);
    assert.deepEqual([intent.fire, intent.firing, intent.px, intent.py], [true, true, 30, 40]);
    input.pointer = { x: 30, y: 40, down: false };
    input.pressed.add('primary');
    readIntent(input, tracker, 1.1, intent);
    assert.deepEqual([intent.fire, intent.px], [false, null]);
  });

  test('the press that started the run does not steer until it lifts and comes back', () => {
    const input = fakeInput();
    input.pointer = { x: 10, y: 20, down: true };
    const { tracker, intent } = fresh(input);
    readIntent(input, tracker, 1, intent);
    assert.deepEqual([intent.px, intent.firing], [null, false]);
  });
});
