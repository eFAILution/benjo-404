import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bugR, crowded, delta, spawnWave } from '../../../src/games/bugbelt/belt.js';
import { LIVES, SAFE_T, SHOT_V, WAVE_MAX } from '../../../src/games/bugbelt/tuning.js';
import { createWorld, stepWorld } from '../../../src/games/bugbelt/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const TAU = Math.PI * 2;
/** Close enough to the aim to stop turning, and to fire, in radians. */
const DEADBAND = 0.03;
const FIRE_CONE = 0.15;

const SIZES = [
  { width: 960, height: 540 },
  { width: 375, height: 667 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1080 },
  { width: 320, height: 240 },
];
const idle = () => ({ turn: 0, thrust: false, fire: false, firing: false, px: null, py: null });
const label = (size, reducedMotion) =>
  `${size.width}x${size.height}${reducedMotion ? ' with reduced motion' : ''}`;

/**
 * A turret on the keys: it never thrusts, turns toward where the nearest bug will be when a shot
 * gets there, and holds fire while it points that way.
 */
function turret(w) {
  const fieldH = w.bottom - w.ceiling;
  let near = null;
  for (const b of w.bugs) {
    if (!b.active) continue;
    const dx = delta(w.x, b.x, w.width);
    const dy = delta(w.y, b.y, fieldH);
    const d = Math.hypot(dx, dy) - bugR(w, b.size);
    if (!near || d < near.d) near = { dx, dy, d, b };
  }
  if (!near) return idle();
  const t = Math.hypot(near.dx, near.dy) / (SHOT_V * w.unit);
  const aim = Math.atan2(near.dy + near.b.vy * t, near.dx + near.b.vx * t);
  const off = ((((aim - w.a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  const turn = Math.abs(off) < DEADBAND ? 0 : Math.sign(off);
  return { ...idle(), turn, firing: Math.abs(off) < FIRE_CONE };
}

test(`every wave's bugs miss a ship that sits still for its first ${SAFE_T} s`, () => {
  for (const size of SIZES) {
    for (const reducedMotion of [false, true]) {
      for (let wave = 1; wave <= WAVE_MAX - 3; wave++) {
        for (let seed = 1; seed <= 8; seed++) {
          const w = createWorld(size, seeded(seed * 100 + wave), { reducedMotion });
          for (const b of w.bugs) b.active = false;
          w.wave = wave;
          spawnWave(w);
          for (let i = 0; i < SAFE_T / DT && w.lives === LIVES; i++) stepWorld(w, idle(), DT);
          assert.equal(
            w.lives,
            LIVES,
            `wave ${wave}, seed ${seed} at ${label(size, reducedMotion)}`,
          );
        }
      }
    }
  }
});

for (const size of SIZES) {
  for (const reducedMotion of [false, true]) {
    test(`a turret that never moves lasts 60 s and clears the belt at ${label(size, reducedMotion)}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld(size, seeded(seed), { reducedMotion });
        let respawns = 0;
        for (let i = 0; i < 120 * 60 && !w.dead; i++) {
          const gone = !w.alive;
          stepWorld(w, turret(w), DT);
          if (!gone || !w.alive) continue;
          respawns += 1;
          assert.equal(crowded(w, w.x, w.y), false, 'the ship came back clear of the bugs');
        }
        assert.ok(w.time >= 60, `seed ${seed} lost every ship by ${w.time.toFixed(1)} s`);
        assert.ok(respawns <= LIVES - 1);
        // The widest screens hold bugs out of a still ship's range; there a player has to fly.
        if (size.width <= 1440) assert.ok(w.wave >= 2, `seed ${seed} never cleared wave 1`);
      }
    });
  }
}
