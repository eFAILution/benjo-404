// Shared helpers for the Memory Leak tests (#106).
import { landing, place } from '../../../src/games/memleak/heap.js';
import { COLS, COMPACT_CHARGE, START_GRACE } from '../../../src/games/memleak/tuning.js';
import { createWorld, SPAWN_Y, stepWorld } from '../../../src/games/memleak/world.js';
import { DT, seeded } from '../runner/fake-host.js';

export const SIZE = { width: 960, height: 540 };
export const SIZES = [
  SIZE,
  { width: 375, height: 667 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1080 },
  { width: 320, height: 240 },
];

/** No keys, no finger. */
export const idle = () => ({ dir: 0, fresh: false, target: null, drop: false, compact: false });

/** Step `seconds` with `intent(w)`, or until the run ends. */
export function run(w, seconds, intent = idle, powers) {
  for (let i = 0; i < Math.round(seconds / DT) && !w.dead; i++) stepWorld(w, intent(w), DT, powers);
  return w;
}

/** A world past the start grace with nothing falling and no block coming until `fall()`. */
export function quiet(size = SIZE, seed = 1, options = {}) {
  const w = createWorld(size, seeded(seed), options);
  w.spawnT = Number.POSITIVE_INFINITY;
  return run(w, START_GRACE + DT);
}

/** Park a block that lives for a long time. */
export const block = (w, x, y, width, life = 1000) => place(w, x, y, width, life);

/** Put a falling block `width` wide at column `x`, at the spawn row unless `y` says otherwise. */
export function fall(w, x, width, y = SPAWN_Y) {
  Object.assign(w.fall, { active: true, x, y, w: width, prevY: y });
  w.spawned += 1;
  return w.fall;
}

/** Count the cells in use. */
export const used = (w) => w.cells.filter((id) => id >= 0).length;

/**
 * A player on the keys. When a block appears it picks the column where the block lands lowest
 * (the nearest one on a tie), holds the arrow toward it, and drops it there. It compacts as
 * soon as the meter is full.
 */
export function autopilot() {
  let held = 0;
  let id = -1;
  let target = 0;
  return (w) => {
    const intent = { ...idle(), compact: w.charge >= COMPACT_CHARGE };
    const f = w.fall;
    if (!f.active) {
      held = 0;
      return intent;
    }
    if (id !== w.spawned) {
      id = w.spawned;
      let low = Number.POSITIVE_INFINITY;
      for (let x = 0; x + f.w <= COLS; x++) {
        const row = landing(w, x, f.w);
        const nearer = Math.abs(x - f.x) < Math.abs(target - f.x);
        if (row < low || (row === low && nearer)) {
          target = x;
          low = row;
        }
      }
    }
    if (target === f.x) {
      held = 0;
      return { ...intent, drop: true };
    }
    const dir = Math.sign(target - f.x);
    const fresh = held !== dir;
    held = dir;
    return { ...intent, dir, fresh };
  };
}
