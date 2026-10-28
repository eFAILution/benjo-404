import assert from 'node:assert/strict';
import { test } from 'node:test';

import { END_T, ROUND_T } from '../../../src/games/whack/tuning.js';
import { createWorld, stepWorld } from '../../../src/games/whack/world.js';
import { DT, seeded } from '../runner/fake-host.js';

/** Whack the first hole holding a bug that is not already sinking; leave decoys alone. */
function autopilot(w) {
  return w.holes.findIndex((hole) => hole.kind === 'bug' && !hole.sinking);
}

const SIZES = [
  { width: 960, height: 540 },
  { width: 375, height: 667 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1080 },
  { width: 320, height: 240 },
];

/** Play a whole round plus the end pause. */
function round(size, seed, reducedMotion, pick) {
  const w = createWorld(size, seeded(seed), { reducedMotion });
  for (let i = 0; i < (ROUND_T + END_T) / DT && !(w.dead && w.deadT >= END_T); i++) {
    stepWorld(w, { hole: pick(w) }, DT);
  }
  return w;
}

for (const size of SIZES) {
  for (const reducedMotion of [false, true]) {
    const label = `${size.width}x${size.height}${reducedMotion ? ' with reduced motion' : ''}`;

    test(`an autopilot squashes every bug and scores 300+ at ${label}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const w = round(size, seed, reducedMotion, autopilot);
        assert.equal(w.dead, true);
        assert.equal(w.missed, 0, `seed ${seed} missed ${w.missed}`);
        assert.ok(w.score >= 300, `seed ${seed} scored only ${w.score}`);
      }
    });

    test(`an idle player ends at 45 s with no score at ${label}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const w = round(size, seed, reducedMotion, () => -1);
        assert.equal(w.dead, true);
        assert.equal(w.score, 0);
        assert.ok(Math.abs(w.time - ROUND_T - END_T) < 2 * DT, `ended at ${w.time}`);
        assert.ok(w.missed > 0);
      }
    });
  }
}
