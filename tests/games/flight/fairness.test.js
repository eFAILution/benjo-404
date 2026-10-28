import assert from 'node:assert/strict';
import { test } from 'node:test';

import { START_GRACE, TOWER_W } from '../../../src/games/flight/tuning.js';
import { createWorld, stepWorld } from '../../../src/games/flight/world.js';
import { DT, seeded } from '../runner/fake-host.js';

/** Aim a little below the gap center, since each flap lifts Benjo above where he was. */
const AIM_BELOW = 0.2;

/**
 * A simple autopilot: flap whenever Benjo is falling below the next gap's aim point.
 * If it can survive, every tower sequence is passable.
 */
function autopilot(w) {
  if (w.ready) return w.time > START_GRACE;
  const towerW = TOWER_W * w.unit;
  let next = null;
  for (const t of w.towers) {
    if (!t.active || t.x - w.scroll + towerW < w.benjoX - w.hitR) continue;
    if (!next || t.x < next.x) next = t;
  }
  const aim = next ? next.gapY + next.gap * AIM_BELOW : (w.ceiling + w.groundY) / 2;
  return w.by > aim && w.vy >= 0;
}

const SIZES = [
  { width: 960, height: 540 },
  { width: 375, height: 667 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1080 },
  { width: 320, height: 240 },
];

for (const size of SIZES) {
  for (const reducedMotion of [false, true]) {
    test(`an autopilot survives 90 s at ${size.width}x${size.height}${reducedMotion ? ' with reduced motion' : ''}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld(size, seeded(seed), { reducedMotion });
        for (let i = 0; i < 90 * 60 && !w.dead; i++) stepWorld(w, autopilot(w), DT);
        assert.equal(w.dead, false, `seed ${seed} hit the ${w.hit} at ${w.time.toFixed(1)} s`);
        assert.ok(w.score > 20, `seed ${seed} scored only ${w.score}`);
        assert.ok(w.collected > 0, `seed ${seed} collected nothing`);
      }
    });
  }
}
