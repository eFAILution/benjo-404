import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createTracker, readFlap, resetTracker } from '../../../src/games/flight/controls.js';
import flight from '../../../src/games/flight/index.js';
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

/** Press Space every `every` seconds, after the start grace. */
const flapEvery = (every) => (t, input) => {
  if (t > 0.2 && Math.round(t / DT) % Math.round(every / DT) === 0) input.pressed.add('primary');
};

describe('module', () => {
  test('metadata fits the contract', () => {
    assert.equal(flight.id, 'flight');
    assert.match(flight.id, /^[a-z0-9-]{1,32}$/);
    assert.equal(flight.name, 'Benjo Flight');
    assert.ok(flight.controls.keyboard.length <= 40);
    assert.ok(flight.controls.touch.length <= 40);
    assert.equal(typeof flight.bestKey, 'string');
  });
});

describe('instance', () => {
  test('create() returns all six methods', () => {
    const game = flight.create(fakeHost());
    for (const name of METHODS) assert.equal(typeof game[name], 'function', name);
  });

  test('render before start and destroy before start do not throw', () => {
    const game = flight.create(fakeHost());
    game.render(0);
    game.update(DT);
    game.destroy();
  });

  test('draws Benjo, towers, and the backdrop once flying', () => {
    const host = fakeHost();
    const game = flight.create(host);
    game.start();
    play(host, game, 3, flapEvery(0.3));
    assert.ok(host.log.sprites > 0);
    assert.ok(host.ctx.calls.count > 0);
  });

  test('keeps the hint up while Benjo waits, then clears it 3 seconds into the flight', () => {
    const host = fakeHost();
    const game = flight.create(host);
    game.start();
    assert.equal(host.log.statuses[0], 'SPACE TO FLAP');
    play(host, game, 5);
    assert.equal(host.log.statuses.length, 1, 'still waiting for the first flap');
    play(host, game, 3.5, flapEvery(0.3));
    assert.equal(host.log.statuses.at(-1), '');
  });

  test('shows the touch hint on a touch device (#64)', () => {
    const host = fakeHost();
    host.input.touch = true;
    flight.create(host).start();
    assert.equal(host.log.statuses[0], 'TAP TO FLAP');
  });

  test('a run that never flaps waits instead of ending', () => {
    const host = fakeHost();
    const game = flight.create(host);
    game.start();
    play(host, game, 30);
    assert.equal(host.log.ends.length, 0);
  });

  test('one flap then nothing ends once, on the ground', () => {
    const host = fakeHost({ random: seeded(3) });
    const game = flight.create(host);
    game.start();
    play(host, game, 0.3);
    host.input.pressed.add('primary');
    play(host, game, 10);
    assert.equal(host.log.ends.length, 1);
    const [result] = host.log.ends;
    assert.equal(result.scoreLabel, 'SCORE');
    assert.equal(result.reason, 'Benjo touched down too soon.');
    assert.equal(result.score, 0);
    game.update(DT);
    assert.equal(host.log.ends.length, 1, 'end is not called twice');
    game.destroy();
    game.destroy();
  });

  test('flapping into a tower ends with the tower reason', () => {
    const host = fakeHost({ random: seeded(5) });
    const game = flight.create(host);
    game.start();
    play(host, game, 30, flapEvery(0.18));
    assert.equal(host.log.ends.length, 1);
    assert.equal(host.log.ends[0].reason, 'Benjo clipped a 404 tower.');
  });

  test('pause stops the world and resume continues it', () => {
    const host = fakeHost();
    const game = flight.create(host);
    game.start();
    play(host, game, 0.3);
    host.input.pressed.add('primary');
    play(host, game, 0.1);
    game.pause();
    play(host, game, 5);
    assert.equal(host.log.ends.length, 0, 'a paused Benjo does not fall');
    game.resume();
    play(host, game, 5);
    assert.equal(host.log.ends.length, 1);
  });

  test('announces a new best once the stored best is passed', () => {
    // Steer from what the game draws: Benjo's center, and the caps either side of each gap.
    const host = fakeHost();
    const frame = { benjo: 0, lastBenjo: 0, caps: [] };
    host.drawSprite = (sprite, x, y) => {
      if (sprite === host.theme.sprites.benjo) {
        frame.lastBenjo = frame.benjo;
        frame.benjo = y;
        frame.x = x;
      } else if (host.theme.sprites.hazards.includes(sprite)) frame.caps.push([x, y]);
    };
    host.storage.setNumber(flight.bestKey, 1);
    const game = flight.create(host);
    game.start();
    play(host, game, 20, (t, input) => {
      const ahead = frame.caps.filter(([x]) => x > frame.x - 40).sort((a, b) => a[0] - b[0]);
      const gapY = ahead.length >= 2 ? (ahead[0][1] + ahead[1][1]) / 2 + 10 : 220;
      const falling = frame.benjo >= frame.lastBenjo;
      if (t > 0.2 && (t < 0.3 || (frame.benjo > gapY && falling))) input.pressed.add('primary');
      frame.caps = [];
    });
    assert.ok(Math.max(...host.log.scores) > 1, 'the pilot passed the stored best');
    assert.ok(host.log.statuses.includes('NEW BEST'));
  });

  test('survives a resize mid-run', () => {
    const host = fakeHost();
    const game = flight.create(host);
    game.start();
    play(host, game, 1, flapEvery(0.3));
    host.size.width = 375;
    host.size.height = 667;
    play(host, game, 1, flapEvery(0.3));
    game.render(0.25);
  });

  test('runs with reduced motion and a tiny canvas', () => {
    const host = fakeHost({ reducedMotion: true, size: { width: 0, height: 0, dpr: 1 } });
    const game = flight.create(host);
    game.start();
    play(host, game, 2, flapEvery(0.3));
  });
});

describe('controls', () => {
  test('a pointer press flaps on its down edge only', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 10, y: 10, down: true };
    assert.equal(readFlap(input, tracker, 1), true);
    assert.equal(readFlap(input, tracker, 1.1), false);
  });

  test('the host tap that follows a pointer press does not flap again', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 10, y: 10, down: true };
    readFlap(input, tracker, 1);
    input.pointer = { x: 10, y: 10, down: false };
    input.pressed.add('primary');
    assert.equal(readFlap(input, tracker, 1.15), false);
    assert.equal(readFlap(input, tracker, 2), true, 'a later key press still flaps');
  });

  test('Space and Up flap, other keys do not', () => {
    const tracker = createTracker();
    for (const [action, expected] of [
      ['primary', true],
      ['up', true],
      ['down', false],
      ['left', false],
    ]) {
      const input = fakeInput();
      input.pressed.add(action);
      assert.equal(readFlap(input, tracker, 5), expected, action);
    }
  });

  test('a pointer already down at start or resume does not flap', () => {
    const input = fakeInput();
    const tracker = createTracker();
    input.pointer = { x: 10, y: 10, down: true };
    resetTracker(tracker, input);
    assert.equal(readFlap(input, tracker, 0.2), false);
  });
});
