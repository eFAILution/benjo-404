import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createWorld, speedFor, stepWorld, topBlock } from '../../../src/games/stack/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZES = [
  { width: 960, height: 540 },
  { width: 375, height: 667 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1080 },
  { width: 320, height: 240 },
];
const TARGET = 50;
/** Long enough for one full pass per block at the slowest speed on the widest screen. */
const BUDGET = TARGET * 15 * 60;

/**
 * Drop when the block is within 2 px of the one below, or at the closest it gets this pass
 * (half a step away). Each step moves at most 7 px, so every pass has such a step.
 */
function autopilot(w) {
  const reach = Math.max(2, (speedFor(w) * DT) / 2);
  return Math.abs(w.x - topBlock(w).x) <= reach;
}

for (const size of SIZES) {
  for (const reducedMotion of [false, true]) {
    const label = `${size.width}x${size.height}${reducedMotion ? ' with reduced motion' : ''}`;

    test(`an aiming autopilot lands ${TARGET} blocks at ${label}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld(size, seeded(seed), { reducedMotion });
        let narrowest = w.baseW;
        for (let i = 0; i < BUDGET && !w.dead && w.score < TARGET; i++) {
          stepWorld(w, autopilot(w), DT);
          narrowest = Math.min(narrowest, topBlock(w).w);
        }
        assert.equal(w.dead, false, `seed ${seed} missed at height ${w.score}`);
        assert.equal(w.score, TARGET, `seed ${seed} reached only ${w.score}`);
        assert.ok(narrowest >= w.baseW - 2 * w.perfectTol, `seed ${seed} narrowed to ${narrowest}`);
      }
    });

    test(`a blind autopilot misses within 30 blocks at ${label}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld(size, seeded(seed), { reducedMotion });
        const every = 20 + seed * 7;
        for (let i = 1; i < BUDGET && !w.dead; i++) stepWorld(w, i % every === 0, DT);
        assert.equal(w.dead, true, `seed ${seed} never missed`);
        assert.equal(w.hit, 'miss');
        assert.ok(w.score <= 30, `seed ${seed} stacked ${w.score} blind`);
      }
    });
  }
}
