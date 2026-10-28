import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { rotate } from '../../../src/games/links/board.js';
import {
  createIntent,
  createTracker,
  readIntent,
  resetTracker,
} from '../../../src/games/links/controls.js';
import links from '../../../src/games/links/index.js';
import { createWorld } from '../../../src/games/links/world.js';
import { DT, fakeHost, fakeInput, seeded } from '../runner/fake-host.js';

const METHODS = ['start', 'update', 'render', 'pause', 'resume', 'destroy'];
const HINT_KEYS = 'ARROWS TO PICK, SPACE TO TURN';

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
const spaceEvery = (every) => (t, input) => {
  if (t > 0.2 && Math.round(t / DT) % Math.round(every / DT) === 0) input.pressed.add('primary');
};

/**
 * A scripted player for seed 11: tap each tile of the 4x4 board until it sits at its solved
 * mask, reading the solution from a world built with the same seed and size.
 */
function scriptedSolver(host) {
  const shadow = createWorld(host.size, seeded(11));
  const { boardLeft, boardTop, tile } = shadow;
  const centers = [];
  const turnsLeft = [];
  for (let cell = 0; cell < 16; cell++) {
    centers.push({
      x: boardLeft + ((cell % 4) + 0.5) * tile,
      y: boardTop + (Math.floor(cell / 4) + 0.5) * tile,
    });
    let m = shadow.board.mask[cell];
    let n = 0;
    while (m !== shadow.board.solved[cell] && n < 4) {
      m = rotate(m);
      n += 1;
    }
    turnsLeft.push(n);
  }
  let cell = 0;
  return (t, input) => {
    input.pointer = null;
    if (t < 0.2 || Math.round(t / DT) % 4 !== 0) return;
    while (cell < 16 && turnsLeft[cell] === 0) cell += 1;
    if (cell >= 16) return;
    turnsLeft[cell] -= 1;
    input.pointer = { ...centers[cell], down: true };
  };
}

describe('module', () => {
  test('metadata fits the contract', () => {
    assert.equal(links.id, 'links');
    assert.match(links.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(links.name, 'Fix the Link');
    assert.equal(links.controls.keyboard, HINT_KEYS);
    assert.equal(links.controls.touch, 'TAP A TILE TO TURN IT');
    assert.ok(links.controls.keyboard.length <= 40);
    assert.ok(links.controls.touch.length <= 40);
    assert.equal(links.bestKey, 'best');
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = links.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('render, update, and destroy before start do not throw', () => {
    const game = links.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
    game.render(0);
  });

  test('draws Benjo, the home page, and the board once playing', () => {
    const host = fakeHost();
    const game = links.create(host);
    game.start();
    play(host, game, 1, spaceEvery(0.3));
    assert.ok(host.log.sprites > 0);
    assert.ok(host.ctx.calls.count > 0);
    assert.equal(host.ctx.globalAlpha, 1);
  });

  test('shows the hint at start and clears it after 3 seconds', () => {
    const host = fakeHost();
    const game = links.create(host);
    game.start();
    assert.equal(host.log.statuses[0], HINT_KEYS);
    play(host, game, 2.9);
    assert.equal(host.log.statuses.length, 1);
    play(host, game, 0.2);
    assert.equal(host.log.statuses.at(-1), '');
  });

  test('a touch player sees the touch hint', () => {
    const host = fakeHost();
    host.input.touch = true;
    const game = links.create(host);
    game.start();
    assert.equal(host.log.statuses[0], 'TAP A TILE TO TURN IT');
  });

  test('a run with no input ends once at 60 s with the timeout reason', () => {
    const host = fakeHost();
    const game = links.create(host);
    game.start();
    play(host, game, 59.9);
    assert.equal(host.log.ends.length, 0);
    play(host, game, 1);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'SCORE');
    assert.equal(result.reason, 'The link timed out.');
    assert.equal(result.score, 0);
    game.update(DT);
    assert.equal(host.log.ends.length, 1, 'end is not called twice');
    game.destroy();
    game.destroy();
  });

  test('a scripted solved board announces LINK FIXED and scores', () => {
    const host = fakeHost({ random: seeded(11) });
    const game = links.create(host);
    game.start();
    play(host, game, 20, scriptedSolver(host));
    assert.ok(host.log.statuses.includes('LINK FIXED'));
    assert.ok(Math.max(...host.log.scores) >= 100);
  });

  test('announces a new best once the stored best is passed', () => {
    const host = fakeHost({ random: seeded(11) });
    host.storage.setNumber(links.bestKey, 50);
    const game = links.create(host);
    game.start();
    play(host, game, 20, scriptedSolver(host));
    assert.equal(host.log.statuses.filter((s) => s === 'NEW BEST').length, 1);
  });

  test('pause stops the clock and resume continues it', () => {
    const host = fakeHost();
    const game = links.create(host);
    game.start();
    play(host, game, 30);
    game.pause();
    play(host, game, 40);
    assert.equal(host.log.ends.length, 0, 'a paused clock does not run out');
    game.render(0.5);
    game.resume();
    play(host, game, 31);
    assert.equal(host.log.ends.length, 1);
  });

  test('survives a resize mid-run', () => {
    const host = fakeHost();
    const game = links.create(host);
    game.start();
    play(host, game, 1, spaceEvery(0.3));
    host.size.width = 375;
    host.size.height = 667;
    play(host, game, 1, spaceEvery(0.3));
    game.render(0.25);
  });

  test('runs with reduced motion and a tiny canvas', () => {
    const host = fakeHost({ reducedMotion: true, size: { width: 0, height: 0, dpr: 1 } });
    const game = links.create(host);
    game.start();
    play(host, game, 2, spaceEvery(0.3));
    game.render(0.5);
  });
});

describe('controls', () => {
  const world = () => createWorld({ width: 960, height: 540 }, seeded(1));

  test('a pointer press on a tile taps it on its down edge only', () => {
    const w = world();
    const input = fakeInput();
    const tracker = createTracker();
    const out = createIntent();
    input.pointer = { x: w.boardLeft + w.tile * 1.5, y: w.boardTop + w.tile / 2, down: true };
    assert.equal(readIntent(input, tracker, w, out).tapTile, 1);
    assert.equal(readIntent(input, tracker, w, out).tapTile, -1);
  });

  test('a press outside the board taps nothing', () => {
    const w = world();
    const input = fakeInput();
    input.pointer = { x: 2, y: 2, down: true };
    assert.equal(readIntent(input, createTracker(), w, createIntent()).tapTile, -1);
  });

  test('the host tap that follows a pointer press does not turn again', () => {
    const w = world();
    const input = fakeInput();
    const tracker = createTracker();
    const out = createIntent();
    input.pointer = { x: w.boardLeft + 4, y: w.boardTop + 4, down: true };
    w.time = 1;
    readIntent(input, tracker, w, out);
    input.pointer = { ...input.pointer, down: false };
    input.pressed.add('primary');
    w.time = 1.15;
    assert.equal(readIntent(input, tracker, w, out).turn, false);
    w.time = 2;
    assert.equal(readIntent(input, tracker, w, out).turn, true, 'a later key press still turns');
  });

  test('keys map to cursor moves and turns; ArrowUp moves without turning', () => {
    const w = world();
    w.time = 5;
    for (const [actions, dx, dy, turn] of [
      [['primary'], 0, 0, true],
      [['primary', 'up'], 0, -1, false],
      [['secondary', 'down'], 0, 1, false],
      [['left'], -1, 0, false],
      [['right'], 1, 0, false],
      [['secondary'], 0, 0, false],
    ]) {
      const input = fakeInput();
      for (const action of actions) input.pressed.add(action);
      const out = readIntent(input, createTracker(), w, createIntent());
      assert.deepEqual([out.dx, out.dy, out.turn], [dx, dy, turn], actions.join('+'));
    }
  });

  test('a swipe moves the cursor like an arrow', () => {
    const input = fakeInput();
    input.swipe = 'left';
    const out = readIntent(input, createTracker(), world(), createIntent());
    assert.deepEqual([out.dx, out.dy, out.turn], [-1, 0, false]);
  });

  test('a pointer already down at start or resume does not tap', () => {
    const w = world();
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: w.boardLeft + 4, y: w.boardTop + 4, down: true };
    resetTracker(tracker, input);
    assert.equal(readIntent(input, tracker, w, createIntent()).tapTile, -1);
  });
});
