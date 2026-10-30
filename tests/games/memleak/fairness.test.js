import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fits } from '../../../src/games/memleak/heap.js';
import {
  COLS,
  EVENT_COMPACT,
  EVENT_SAVED,
  MAX_W,
  MIN_W,
  MOVE_DELAY,
  MOVE_GAP,
  ROWS,
} from '../../../src/games/memleak/tuning.js';
import {
  createWorld,
  fallSpeed,
  SPAWN_Y,
  spawnX,
  stepWorld,
} from '../../../src/games/memleak/world.js';
import { DT, seeded } from '../runner/fake-host.js';
import { autopilot, idle, SIZES } from './kit.js';

/** Three and a half minutes: past the point where every part of the pace has hit its cap. */
const LONG_RUN = 210;

const label = (size, reducedMotion) =>
  `${size.width}x${size.height}${reducedMotion ? ' with reduced motion' : ''}`;

/** Seconds a held arrow takes to move a block `moves` columns. */
const travel = (moves) => (moves > 0 ? MOVE_DELAY + (moves - 1) * MOVE_GAP : 0);

test('at the fastest pace, a block can reach either wall on the keys before it reaches the heap', () => {
  for (const reducedMotion of [false, true]) {
    const w = createWorld(SIZES[0], seeded(1), { reducedMotion });
    w.time = 1e6;
    const inLane = (SPAWN_Y - ROWS) / fallSpeed(w);
    for (let width = MIN_W; width <= MAX_W; width++) {
      const moves = Math.max(spawnX(width), COLS - width - spawnX(width));
      assert.ok(
        travel(moves) < inLane,
        `${width} wide needs ${travel(moves).toFixed(2)} s, the lane gives ${inLane.toFixed(2)} s`,
      );
    }
  }
});

/**
 * A careless player: it slides each block to a random column, drops it there, and never
 * compacts. A Digital Twin that never runs out keeps it going, so the heap stays crowded.
 */
function careless(random) {
  let id = -1;
  let target = 0;
  return (w) => {
    const f = w.fall;
    if (!f.active) return idle();
    if (id !== w.spawned) {
      id = w.spawned;
      target = Math.floor(random() * (COLS - f.w + 1));
    }
    const dir = Math.sign(target - f.x);
    return { ...idle(), dir, fresh: dir !== 0, drop: dir === 0 };
  };
}

test('every new block fits somewhere in the heap when it appears', () => {
  let crowded = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const w = createWorld(SIZES[0], seeded(seed));
    const play = careless(seeded(seed + 50));
    const powers = { absorb: () => true };
    let seen = 0;
    for (let i = 0; i < 120 / DT; i++) {
      const waiting = !w.fall.active;
      stepWorld(w, play(w), DT, powers);
      // A twin save while no block falls means a new block was refused.
      assert.ok(!(waiting && w.events & EVENT_SAVED), `seed ${seed}: a block was refused`);
      if (w.spawned === seen) continue;
      seen = w.spawned;
      assert.ok(fits(w, w.fall.w), `seed ${seed}: a ${w.fall.w}-wide block fits nowhere`);
      if (!fits(w, MAX_W)) crowded += 1;
    }
  }
  assert.ok(crowded > 0, 'the heap got too crowded for the widest block, so shrinking was tried');
});

for (const size of SIZES) {
  for (const reducedMotion of [false, true]) {
    test(`a player who drops each block where it lands lowest lasts ${LONG_RUN} s at ${label(size, reducedMotion)}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld(size, seeded(seed), { reducedMotion });
        const play = autopilot();
        let compacts = 0;
        for (let i = 0; i < LONG_RUN / DT && !w.dead; i++) {
          stepWorld(w, play(w), DT);
          if (w.events & EVENT_COMPACT) compacts += 1;
        }
        assert.equal(w.dead, false, `seed ${seed} overflowed at ${w.time.toFixed(1)} s`);
        assert.ok(compacts > 0, `seed ${seed} never compacted`);
        assert.ok(w.flushes > 0, `seed ${seed} never flushed a row`);
      }
    });
  }
}
