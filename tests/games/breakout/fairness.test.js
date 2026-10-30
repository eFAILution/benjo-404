import assert from 'node:assert/strict';
import { test } from 'node:test';

import breakout from '../../../src/games/breakout/index.js';
import { EVENT_BOUNCE } from '../../../src/games/breakout/tuning.js';
import { createWorld, paddleWFor, stepWorld } from '../../../src/games/breakout/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

/** Most the autopilot aims off the ball, as a share of the paddle half-width. */
const AIM_SPREAD = 0.3;

const SIZES = [
  { width: 960, height: 540 },
  { width: 375, height: 667 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1080 },
  { width: 320, height: 240 },
];

/**
 * A simple autopilot: chase the ball with the paddle, a seeded bit off center so the angles
 * vary, and serve at once. If it never drops a ball, every speed and size is catchable.
 */
function autopilot(seed) {
  const pick = seeded(seed + 100);
  let offset = 0;
  const intent = { move: 0, targetX: 0, serve: true };
  return (w) => {
    if (w.events & EVENT_BOUNCE) offset = (pick() * 2 - 1) * AIM_SPREAD;
    intent.targetX = w.bx + (offset * paddleWFor(w)) / 2;
    return intent;
  };
}

for (const size of SIZES) {
  for (const reducedMotion of [false, true]) {
    const label = `${size.width}x${size.height}${reducedMotion ? ' with reduced motion' : ''}`;
    test(`an autopilot never drops a ball in 60 s at ${label}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld(size, seeded(seed), { reducedMotion });
        const pilot = autopilot(seed);
        for (let i = 0; i < 60 * 60 && !w.dead; i++) stepWorld(w, pilot(w), DT);
        assert.equal(w.lives, 3, `seed ${seed} dropped a ball at ${w.time.toFixed(1)} s`);
        assert.ok(w.score > 0, `seed ${seed} scored nothing`);
        assert.ok(w.bricksHit >= 10, `seed ${seed} broke only ${w.bricksHit} bricks`);
      }
    });

    test(`a paddle that never moves drops three balls at ${label}`, () => {
      const intent = { move: 0, targetX: null, serve: true };
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld(size, seeded(seed), { reducedMotion });
        for (let i = 0; i < 120 * 60 && !w.dead; i++) stepWorld(w, intent, DT);
        assert.equal(w.dead, true, `seed ${seed} still alive`);
        assert.equal(w.hit, 'lost');
      }
    });
  }
}

test('a paddle that never moves ends the run with the fizzled reason', () => {
  const host = fakeHost({ random: seeded(2) });
  const game = breakout.create(host);
  game.start();
  for (let i = 0; i < 120 * 60 && host.log.ends.length === 0; i++) {
    host.input.pressed.add('primary');
    game.update(DT);
    host.input.tick();
  }
  assert.equal(host.log.ends.length, 1);
  assert.equal(host.log.ends[0].reason, "Benjo's fireball fizzled out.");
});
