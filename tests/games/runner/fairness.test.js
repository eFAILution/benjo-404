import assert from 'node:assert/strict';
import { test } from 'node:test';

import { KIND_FLYER } from '../../../src/games/runner/tuning.js';
import { createWorld, stepWorld } from '../../../src/games/runner/world.js';
import { DT, seeded } from './fake-host.js';

/** Seconds of (unscaled) travel before an obstacle at which the autopilot jumps. */
const LEAD = 0.12;

/**
 * A simple autopilot: full jumps over ground and tall hazards, ducks under flyers.
 * If it can survive, every spawn sequence is passable.
 */
function autopilot(w) {
  const input = { jumpPressed: false, jumpHeld: true, duckHeld: false, duckTap: false };
  const front = w.benjoX + w.benjoH / 2;
  let next = null;
  for (const o of w.obstacles) {
    if (o.active && o.x + o.w > w.benjoX - w.benjoH / 2 && (!next || o.x < next.x)) next = o;
  }
  if (!next) return input;
  const dist = next.x - front;
  const lead = (w.speed * LEAD) / w.pace;
  if (next.kind === KIND_FLYER) input.duckHeld = dist < lead * 3;
  else input.jumpPressed = w.grounded && dist < lead;
  return input;
}

const SIZES = [
  { width: 960, height: 540 },
  { width: 375, height: 667 },
  { width: 1440, height: 900 },
];

for (const size of SIZES) {
  for (const reducedMotion of [false, true]) {
    test(`an autopilot survives 90 s at ${size.width}x${size.height}${reducedMotion ? ' with reduced motion' : ''}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        let w = createWorld(size, seeded(seed), { reducedMotion });
        for (let i = 0; i < 90 * 60 && !w.dead; i++) w = stepWorld(w, autopilot(w), DT);
        assert.equal(w.dead, false, `seed ${seed} died at ${w.time.toFixed(1)} s`);
        assert.ok(w.collected > 0, `seed ${seed} collected nothing`);
      }
    });
  }
}
