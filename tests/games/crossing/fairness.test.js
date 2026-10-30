import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hitAt } from '../../../src/games/crossing/lanes.js';
import { LANES } from '../../../src/games/crossing/tuning.js';
import { createWorld, stepWorld } from '../../../src/games/crossing/world.js';
import { DT, seeded } from '../runner/fake-host.js';

/** Up must stay clear this long; a sidestep or retreat needs the same. */
const LOOK = 0.3;
/** Benjo leaves his cell when a block reaches it this soon. */
const DANGER = 0.2;
/** After waiting this long, step toward a column whose window opens sooner. */
const PATIENCE = 2;
/** How far ahead, and how many columns either way, the sidestep looks. */
const SCAN_T = 3;
const SCAN_COLS = 3;
/** Three crossings put Benjo on level 4. */
const CROSSED = 4;

/** Is the cell free of hits for `dur` seconds starting `from` seconds ahead? */
function clearFor(w, row, col, from, dur) {
  if (col < 0 || col >= w.cols || row < 0) return false;
  if (row < 1 || row > LANES) return true;
  const lane = w.lanes[row - 1];
  for (let t = from; t <= from + dur; t += DT) {
    if (hitAt(lane, col + 0.5, lane.offset + lane.dir * lane.speed * t)) return false;
  }
  return true;
}

/** Seconds until the cell above opens a LOOK long window, or Infinity. */
function windowAt(w, col) {
  for (let t = 0; t < SCAN_T; t += DT * 3) if (clearFor(w, w.row + 1, col, t, LOOK)) return t;
  return Number.POSITIVE_INFINITY;
}

/** Column within SCAN_COLS whose window above opens first; ties keep the nearer one. */
function bestColumn(w) {
  let best = w.col;
  let bestT = windowAt(w, w.col);
  for (let d = 1; d <= SCAN_COLS; d++) {
    for (const col of [w.col - d, w.col + d]) {
      if (col < 0 || col >= w.cols) continue;
      const t = windowAt(w, col) + d * 0.2;
      if (t < bestT) [best, bestT] = [col, t];
    }
  }
  return best;
}

/**
 * Hop up when the cell above stays clear for LOOK; dodge sideways or back when a block is about
 * to reach Benjo; after PATIENCE seconds of waiting, drift toward an earlier window.
 * If it crosses without losing a life, every lane layout leaves a way through.
 */
function autopilot() {
  let waited = 0;
  return (w) => {
    if (w.hopT > 0 || w.hitT > 0) return null;
    if (clearFor(w, w.row + 1, w.col, 0, LOOK)) {
      waited = 0;
      return 'up';
    }
    if (!clearFor(w, w.row, w.col, 0, DANGER)) {
      const ahead = w.lanes[w.row - 1].dir;
      for (const [dir, row, col] of [
        ['down', w.row - 1, w.col],
        [ahead > 0 ? 'right' : 'left', w.row, w.col + ahead],
        [ahead > 0 ? 'left' : 'right', w.row, w.col - ahead],
      ]) {
        if (clearFor(w, row, col, 0, LOOK)) return dir;
      }
      if (clearFor(w, w.row + 1, w.col, 0, DANGER)) return 'up';
    }
    waited += DT;
    if (waited < PATIENCE) return null;
    const col = bestColumn(w);
    if (col === w.col || !clearFor(w, w.row, col, 0, LOOK)) return null;
    return col < w.col ? 'left' : 'right';
  };
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
    test(`an autopilot crosses 3 times in 60 s at ${size.width}x${size.height}${reducedMotion ? ' with reduced motion' : ''}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld(size, seeded(seed), { reducedMotion });
        const pilot = autopilot();
        const intent = { hop: null };
        for (let i = 0; i < 60 * 60 && w.lives === 3 && w.level < CROSSED; i++) {
          intent.hop = w.time > 0.2 ? pilot(w) : null;
          stepWorld(w, intent, DT);
        }
        assert.equal(w.lives, 3, `seed ${seed} lost a life to a ${w.hit} on level ${w.level}`);
        assert.ok(w.level >= CROSSED, `seed ${seed} crossed only ${w.level - 1} times`);
      }
    });
  }
}
