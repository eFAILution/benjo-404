import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createTracker, readWhack, resetTracker } from '../../../src/games/whack/controls.js';
import whack from '../../../src/games/whack/index.js';
import { createWorld } from '../../../src/games/whack/world.js';
import { DT, fakeHost, fakeInput, seeded } from '../runner/fake-host.js';

const METHODS = ['start', 'update', 'render', 'pause', 'resume', 'destroy'];
const REASON = "Time's up. The bugs crawled back in.";

/** Run the instance like the host loop: update then render, rolling input each tick. */
function play(host, game, seconds, beforeTick = () => {}) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps && host.log.ends.length === 0; i++) {
    beforeTick(host.input);
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
}

/**
 * Steer from what the game draws: remember where a live bug was last drawn (squashed ones fade),
 * then press the key for the nearest hole. Hole centers come from a world twin of the same size.
 */
function bugPilot(host) {
  const hazards = new Set(host.theme.sprites.hazards);
  const seen = [];
  host.drawSprite = (sprite, x, y, _h, opts) => {
    host.log.sprites += 1;
    if (hazards.has(sprite) && opts?.alpha === 1) seen.push([x, y]);
  };
  const twin = createWorld(host.size, seeded(1));
  const keys = ['primary', 'up', 'right', 'down', 'left'];
  return (input) => {
    const target = seen.pop();
    seen.length = 0;
    if (!target) return;
    let best = 0;
    for (let h = 1; h < 5; h++) {
      const d = Math.abs(twin.holeX[h] - target[0]) + Math.abs(twin.holeY[h] - target[1]);
      const b = Math.abs(twin.holeX[best] - target[0]) + Math.abs(twin.holeY[best] - target[1]);
      if (d < b) best = h;
    }
    input.pressed.add(keys[best]);
  };
}

describe('module', () => {
  test('metadata fits the contract', () => {
    assert.equal(whack.id, 'whack');
    assert.match(whack.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(whack.name, 'Whack-a-Bug');
    assert.equal(whack.controls.keyboard, 'ARROWS OR SPACE TO WHACK');
    assert.equal(whack.controls.touch, 'TAP A BUG TO WHACK IT');
    assert.ok(whack.controls.keyboard.length <= 40);
    assert.ok(whack.controls.touch.length <= 40);
    assert.equal(whack.bestKey, 'best');
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = whack.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('render, update, and destroy before start do not throw', () => {
    const game = whack.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
    game.render(0);
  });

  test('draws Benjo, bugs, and the board once playing', () => {
    const host = fakeHost();
    const game = whack.create(host);
    game.start();
    play(host, game, 3);
    assert.ok(host.log.sprites > 180, 'Benjo every frame, bugs too');
    assert.ok(host.ctx.calls.count > 0);
  });

  test('shows the hint at start and clears it after 3 seconds', () => {
    const host = fakeHost();
    const game = whack.create(host);
    game.start();
    assert.equal(host.log.statuses[0], 'ARROWS OR SPACE TO WHACK');
    play(host, game, 2.9);
    assert.equal(host.log.statuses.length, 1);
    play(host, game, 0.2);
    assert.equal(host.log.statuses.at(-1), '');
  });

  test('shows the touch hint after a touch', () => {
    const host = fakeHost();
    host.input.touch = true;
    whack.create(host).start();
    assert.equal(host.log.statuses[0], 'TAP A BUG TO WHACK IT');
  });

  test('a run with no input ends once after 45 s with the time reason', () => {
    const host = fakeHost({ random: seeded(3) });
    const game = whack.create(host);
    game.start();
    play(host, game, 45);
    assert.equal(host.log.ends.length, 0);
    play(host, game, 1);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'SQUASHED');
    assert.equal(result.reason, REASON);
    assert.equal(result.score, 0);
    game.update(DT);
    assert.equal(host.log.ends.length, 1, 'end is not called twice');
    game.destroy();
    game.destroy();
  });

  test('squashing bugs scores, combos show, and the end carries the score', () => {
    const host = fakeHost({ random: seeded(4) });
    const game = whack.create(host);
    game.start();
    play(host, game, 50, bugPilot(host));
    assert.equal(host.log.ends.length, 1);
    assert.ok(host.log.ends[0].score >= 300, `scored ${host.log.ends[0].score}`);
    assert.ok(host.log.statuses.includes('COMBO 3'));
  });

  test('whacking a decoy says so', () => {
    const host = fakeHost({ random: seeded(4) });
    const pickups = new Set(host.theme.sprites.pickups);
    let decoyUp = false;
    host.drawSprite = (sprite) => {
      if (pickups.has(sprite)) decoyUp = true;
    };
    const game = whack.create(host);
    game.start();
    // Mash every hole in turn: sooner or later a decoy gets hit.
    const keys = ['primary', 'up', 'right', 'down', 'left'];
    let n = 0;
    play(host, game, 45, (input) => {
      if (decoyUp) input.pressed.add(keys[n++ % 5]);
      decoyUp = false;
    });
    assert.ok(host.log.statuses.includes('THAT WAS A FEATURE'));
  });

  test('pause stops the world and resume continues it', () => {
    const host = fakeHost();
    const game = whack.create(host);
    game.start();
    play(host, game, 40);
    game.pause();
    play(host, game, 10);
    assert.equal(host.log.ends.length, 0, 'a paused round does not run out');
    game.resume();
    play(host, game, 6);
    assert.equal(host.log.ends.length, 1);
  });

  test('announces a new best once the stored best is passed', () => {
    const host = fakeHost({ random: seeded(5) });
    host.storage.setNumber(whack.bestKey, 25);
    const game = whack.create(host);
    game.start();
    play(host, game, 50, bugPilot(host));
    assert.ok(Math.max(...host.log.scores) > 25);
    assert.equal(host.log.statuses.filter((s) => s === 'NEW BEST').length, 1);
  });

  test('survives a resize mid-run', () => {
    const host = fakeHost();
    const game = whack.create(host);
    game.start();
    play(host, game, 5);
    host.size.width = 375;
    host.size.height = 667;
    play(host, game, 5);
    host.size.width = 320;
    host.size.height = 240;
    game.render(0.25);
    play(host, game, 1);
    assert.equal(host.log.ends.length, 0);
  });

  test('runs with reduced motion and a tiny canvas', () => {
    const host = fakeHost({ reducedMotion: true, size: { width: 0, height: 0, dpr: 1 } });
    const game = whack.create(host);
    game.start();
    play(host, game, 47, bugPilot(host));
    assert.equal(host.log.ends.length, 1);
  });
});

describe('controls', () => {
  const w = createWorld({ width: 960, height: 540 }, seeded(1));

  test('ArrowUp (primary and up in one tick) whacks hole 1 only', () => {
    const input = fakeInput();
    input.pressed.add('primary');
    input.pressed.add('up');
    assert.equal(readWhack(input, createTracker(), 5, w).hole, 1);
  });

  test('each key whacks its hole', () => {
    for (const [action, hole] of [
      ['primary', 0],
      ['up', 1],
      ['right', 2],
      ['down', 3],
      ['left', 4],
      ['secondary', -1],
    ]) {
      const input = fakeInput();
      input.pressed.add(action);
      assert.equal(readWhack(input, createTracker(), 5, w).hole, hole, action);
    }
  });

  test('a pointer tap in the right cell whacks hole 2 once, and its echo whacks nothing', () => {
    const input = fakeInput();
    const tracker = createTracker();
    const x = w.holeX[2] + w.cell * 0.4;
    const y = w.holeY[2] - w.cell * 0.4;
    input.pointer = { x, y, down: true };
    assert.equal(readWhack(input, tracker, 1, w).hole, 2);
    assert.equal(readWhack(input, tracker, 1.05, w).hole, -1, 'holding is not a new whack');
    input.pointer = { x, y, down: false };
    input.pressed.add('primary');
    assert.equal(readWhack(input, tracker, 1.15, w).hole, -1);
    assert.equal(readWhack(input, tracker, 2, w).hole, 0, 'a later Space still whacks');
  });

  test('a pointer press outside every hole whacks nothing', () => {
    const input = fakeInput();
    input.pointer = { x: 2, y: 2, down: true };
    assert.equal(readWhack(input, createTracker(), 1, w).hole, -1);
  });

  test('a pointer already down at start or resume does not whack', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: w.holeX[0], y: w.holeY[0], down: true };
    resetTracker(tracker, input);
    assert.equal(readWhack(input, tracker, 0.2, w).hole, -1);
  });
});
