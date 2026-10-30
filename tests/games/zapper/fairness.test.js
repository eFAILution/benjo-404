import assert from 'node:assert/strict';
import { test } from 'node:test';

import { biteSpeedFor, bugX, lowest, speedFor } from '../../../src/games/zapper/formation.js';
import { BITE_H, BITE_W, BOLT_SPEED, COLS, LIVES } from '../../../src/games/zapper/tuning.js';
import { createWorld, stepWorld } from '../../../src/games/zapper/world.js';
import { DT, seeded } from '../runner/fake-host.js';

/** React to a bite this long before it reaches Benjo's row. */
const WARN_T = 0.5;
/** Step this many Benjo heights aside from a bite. */
const DODGE = 1.5;
/** Close enough to a target to stop moving, in px. */
const DEADBAND = 3;

/** Would a bite land on Benjo anywhere from x0 to x1 within the warning time? */
function threatened(w, x0, x1 = x0) {
  const near = w.hitR + (BITE_W * w.unit) / 2 + 2;
  const lo = Math.min(x0, x1) - near;
  const hi = Math.max(x0, x1) + near;
  const warn = biteSpeedFor(w) * WARN_T + w.hitR;
  const below = w.benjoY + w.hitR + (BITE_H * w.unit) / 2;
  return w.bites.some(
    (s) => s.active && s.x > lo && s.x < hi && s.y < below && w.benjoY - s.y < warn,
  );
}

/** Lead the nearest living column by how far the formation moves while a bolt climbs to it. */
function columnTarget(w) {
  let best = null;
  for (let c = 0; c < COLS; c++) {
    const b = lowest(w, c);
    if (!b) continue;
    const rise = (w.benjoY - w.originY - b.row * w.rowStep) / (BOLT_SPEED * w.unit);
    const x = bugX(w, b) + w.dir * speedFor(w) * rise;
    if (best === null || Math.abs(x - w.bx) < Math.abs(best - w.bx)) best = x;
  }
  return best ?? w.bx;
}

/**
 * The spec's autopilot, on the keys: stand under the nearest column and fire every step, and
 * step 1.5 Benjo heights aside when a bite is within 0.5 s of Benjo's row.
 * If it clears two waves, every formation and bite pattern is beatable from the keyboard.
 */
function autopilot(w, state) {
  const lo = w.left + w.benjoH / 2;
  const hi = w.right - w.benjoH / 2;
  if (state.dodgeX !== null && !threatened(w, state.dodgeX) && !threatened(w, w.bx)) {
    state.dodgeX = null;
  }
  if (state.dodgeX === null && threatened(w, w.bx)) {
    const step = DODGE * w.benjoH;
    const sides = w.bx - lo > hi - w.bx ? [-step, step] : [step, -step];
    const side = sides.find((d) => !threatened(w, Math.min(hi, Math.max(lo, w.bx + d))));
    state.dodgeX = Math.min(hi, Math.max(lo, w.bx + (side ?? sides[0])));
  }
  const target = state.dodgeX ?? columnTarget(w);
  const gap = target - w.bx;
  const move = Math.abs(gap) < DEADBAND ? 0 : Math.sign(gap);
  // Never walk into a bite's path: wait for it to land first.
  const ahead = w.bx + move * w.benjoH;
  const blocked = state.dodgeX === null && move !== 0 && threatened(w, w.bx, ahead);
  return { move: blocked ? 0 : move, targetX: null, fire: false, firing: true };
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
    test(`an autopilot clears two waves in 60 s at ${size.width}x${size.height}${reducedMotion ? ' with reduced motion' : ''}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld(size, seeded(seed), { reducedMotion });
        const state = { dodgeX: null };
        for (let i = 0; i < 60 * 60 && !w.dead && w.wave < 3; i++) {
          stepWorld(w, autopilot(w, state), DT);
        }
        assert.equal(w.dead, false, `seed ${seed}: ${w.hit} at ${w.time.toFixed(1)} s`);
        assert.ok(
          w.wave >= 3,
          `seed ${seed} reached only wave ${w.wave} with ${w.alive} bugs left`,
        );
        assert.equal(w.lives, LIVES, `seed ${seed} lost a life to a bite it could have dodged`);
      }
    });
  }
}
