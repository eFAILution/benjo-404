import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  createIntent,
  createTracker,
  readIntent,
  resetTracker,
} from '../../../src/games/memleak/controls.js';
import memoryLeak from '../../../src/games/memleak/index.js';
import { COLS, COMPACT_CHARGE, DRAG_PX, ROWS } from '../../../src/games/memleak/tuning.js';
import { createWorld } from '../../../src/games/memleak/world.js';
import { DT, fakeHost, fakeInput, seeded } from '../runner/fake-host.js';
import { block, fall, SIZE } from './kit.js';

const METHODS = ['start', 'update', 'render', 'pause', 'resume', 'destroy'];

/** Run the instance like the host loop: update then render, rolling input each tick. */
function play(host, game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT) && host.log.ends.length === 0; i++) {
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
}

/** Swap the running world for a changed copy of itself. */
function edit(game, change) {
  const snap = game.snapshot();
  change(snap.world);
  game.restore(snap);
}

describe('module', () => {
  test('metadata fits the contract', () => {
    assert.equal(memoryLeak.id, 'memleak');
    assert.match(memoryLeak.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(memoryLeak.name, 'Memory Leak');
    assert.ok(memoryLeak.controls.keyboard.length <= 40);
    assert.ok(memoryLeak.controls.touch.length <= 40);
    assert.equal(typeof memoryLeak.bestKey, 'string');
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = memoryLeak.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('render before start and destroy before start do not throw', () => {
    const game = memoryLeak.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
  });

  test('draws the heap, and cuts the hazard sprite out of placed blocks', () => {
    const host = fakeHost();
    const game = memoryLeak.create(host);
    game.start();
    edit(game, (w) => block(w, 0, 0, 3));
    play(host, game, 0.5);
    assert.ok(host.log.sprites >= 1);
    assert.ok(host.ctx.calls.count > 0);
  });

  test('shows the keys hint, or the touch hint on a touch device', () => {
    const host = fakeHost();
    memoryLeak.create(host).start();
    assert.equal(host.log.statuses[0], 'ARROWS MOVE, DOWN DROPS, SPACE COMPACTS');
    const touch = fakeHost();
    touch.input.touch = true;
    memoryLeak.create(touch).start();
    assert.equal(touch.log.statuses[0], 'DRAG, TAP TO DROP, SWIPE UP TO COMPACT');
  });

  test('says COMPACT READY when the meter fills', () => {
    const host = fakeHost();
    const game = memoryLeak.create(host);
    game.start();
    edit(game, (w) => {
      w.charge = COMPACT_CHARGE - 1;
      block(w, 9, 0, 1, DT / 2);
    });
    play(host, game, 2 * DT);
    assert.equal(host.log.statuses.at(-1), 'COMPACT READY');
  });

  test('cheers a new best once', () => {
    const host = fakeHost();
    host.storage.setNumber('best', 2);
    const game = memoryLeak.create(host);
    game.start();
    edit(game, (w) => block(w, 0, 0, 4, DT / 2));
    play(host, game, 0.5);
    assert.equal(host.log.statuses.filter((s) => s === 'NEW BEST').length, 1);
  });

  test('an overflow ends the run once with the score and reason, and tracks no avatar', () => {
    const host = fakeHost();
    const tracked = [];
    host.track = (x, y) => tracked.push([x, y]);
    const game = memoryLeak.create(host);
    game.start();
    play(host, game, 0.2);
    edit(game, (w) => {
      for (let row = 0; row < ROWS; row++) block(w, 4, row, 1);
      w.score = 7;
      fall(w, 3, 2);
    });
    play(host, game, 5);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'FREED');
    assert.equal(result.reason, 'The heap overflowed.');
    assert.equal(result.score, host.log.scores.at(-1));
    assert.equal(tracked.length, 0);
  });

  test('pause stops the run until resume', () => {
    const host = fakeHost();
    const game = memoryLeak.create(host);
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
  /** A tracker past the start, with nothing held, over a world with a block falling. */
  function fresh(input = fakeInput()) {
    const tracker = createTracker();
    resetTracker(tracker, input);
    const w = createWorld(SIZE, seeded(1));
    w.time = 1;
    fall(w, 4, 2);
    return { input, tracker, w, intent: createIntent() };
  }

  /** Read one tick and roll the input, as the host does. */
  function read(kit) {
    readIntent(kit.input, kit.tracker, kit.w, kit.intent);
    kit.input.tick();
    kit.w.time += DT;
    return { ...kit.intent };
  }

  test('arrows move with a fresh press, then hold; Down drops', () => {
    const kit = fresh();
    kit.input.held.add('left');
    const pressed = read(kit);
    assert.deepEqual([pressed.dir, pressed.fresh], [-1, true]);
    assert.equal(read(kit).fresh, false, 'held');
    kit.input.held.clear();
    kit.input.held.add('right');
    const intent = read(kit);
    assert.deepEqual([intent.dir, intent.fresh], [1, true]);
    kit.input.pressed.add('down');
    assert.equal(read(kit).drop, true);
  });

  test('Space compacts; Up, which also raises primary, compacts once', () => {
    const kit = fresh();
    kit.input.pressed.add('primary');
    assert.equal(read(kit).compact, true);
    kit.input.pressed.add('primary');
    kit.input.pressed.add('up');
    kit.input.held.add('up');
    assert.equal(read(kit).compact, true);
    assert.equal(read(kit).compact, false);
  });

  test('a compact key still held from the start does nothing until it comes back up', () => {
    const input = fakeInput();
    input.held.add('primary');
    const kit = fresh(input);
    input.pressed.add('primary');
    assert.equal(read(kit).compact, false);
    input.held.delete('primary');
    read(kit);
    input.pressed.add('primary');
    assert.equal(read(kit).compact, true);
  });

  test('a tap drops the block, and the host tap echo of it does not compact', () => {
    const kit = fresh();
    kit.input.pointer = { x: 100, y: 100, down: true };
    assert.equal(read(kit).drop, false, 'a press waits to see if it drags');
    kit.input.pointer = { x: 102, y: 100, down: false };
    kit.input.pressed.add('primary');
    const intent = read(kit);
    assert.deepEqual([intent.drop, intent.compact], [true, false]);
  });

  test('a drag moves the block a column per cell, and lifting it does not drop', () => {
    const kit = fresh();
    const { cell } = kit.w;
    kit.input.pointer = { x: 100, y: 100, down: true };
    read(kit);
    kit.input.pointer = { x: 100 + DRAG_PX / 2, y: 100, down: true };
    assert.equal(read(kit).target, null, 'too short to be a drag');
    kit.input.pointer = { x: 100 + 2 * cell, y: 100, down: true };
    assert.equal(read(kit).target, 6);
    kit.input.pointer = { x: 100 - 9 * cell, y: 100, down: true };
    assert.equal(read(kit).target, 0, 'held inside the heap');
    kit.input.pointer = { x: 100 + 20 * cell, y: 100, down: true };
    assert.equal(read(kit).target, COLS - 2);
    kit.input.pointer = { x: 100 + 20 * cell, y: 100, down: false };
    assert.equal(read(kit).drop, false);
  });

  test('a swipe up compacts and a swipe down drops', () => {
    const kit = fresh();
    kit.input.pointer = { x: 100, y: 300, down: true };
    read(kit);
    kit.input.pointer = { x: 100, y: 200, down: false };
    kit.input.swipe = 'up';
    const up = read(kit);
    assert.deepEqual([up.compact, up.drop], [true, false]);
    kit.input.pointer = { x: 100, y: 200, down: true };
    read(kit);
    kit.input.pointer = { x: 100, y: 300, down: false };
    kit.input.swipe = 'down';
    assert.equal(read(kit).drop, true);
  });

  test('the press that started the run does not drop or compact when it lifts', () => {
    const input = fakeInput();
    input.pointer = { x: 10, y: 20, down: true };
    const kit = fresh(input);
    read(kit);
    input.pointer = { x: 10, y: 20, down: false };
    input.pressed.add('primary');
    input.held.add('primary');
    const intent = read(kit);
    assert.deepEqual([intent.drop, intent.compact], [false, false]);
  });
});
