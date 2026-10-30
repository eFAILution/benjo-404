import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  aimChanceFor,
  biteIntervalFor,
  blockFor,
  bugX,
  burstChanceFor,
  lowest,
  nextBiter,
  resetFormation,
  speedFor,
} from '../../../src/games/zapper/formation.js';
import {
  BITE_PACE_MAX,
  BITE_PACE_MIN,
  BITE_T_JITTER,
  BLOCK_SHARE,
  BURST_GAP,
  COLS,
  DROP,
  DROPS_CLEAR,
  FORM_TOP,
  ROWS,
} from '../../../src/games/zapper/tuning.js';
import { createWorld, stepWorld } from '../../../src/games/zapper/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZES = [
  { width: 960, height: 540 },
  { width: 375, height: 667 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1080 },
  { width: 320, height: 240 },
];

/** A world on wave `wave` with a fresh formation. */
function waveWorld(size, wave, seed = 1) {
  const w = createWorld(size, seeded(seed));
  w.wave = wave;
  resetFormation(w);
  return w;
}

describe('waves grow (#83)', () => {
  test('a wide screen goes from 6 x 3 to 8 x 5', () => {
    const blocks = [1, 2, 3, 4, 5, 9].map((wave) => {
      const { cols, rows } = blockFor(waveWorld({ width: 960, height: 540 }, wave));
      return `${cols}x${rows}`;
    });
    assert.deepEqual(blocks, ['6x3', '7x3', '7x4', '8x4', '8x5', '8x5']);
  });

  test('a phone adds rows but keeps 6 columns, and a tiny screen keeps 6 x 3', () => {
    const phone = [1, 3, 5].map((wave) => blockFor(waveWorld({ width: 390, height: 844 }, wave)));
    assert.deepEqual(
      phone.map(({ cols, rows }) => `${cols}x${rows}`),
      ['6x3', '6x4', '6x5'],
    );
    const tiny = blockFor(waveWorld({ width: 320, height: 240 }, 9));
    assert.deepEqual(tiny, { cols: COLS, rows: ROWS });
  });

  for (const size of SIZES) {
    test(`at ${size.width}x${size.height} every wave starts with room to play`, () => {
      for (let wave = 1; wave <= 10; wave++) {
        const w = waveWorld(size, wave);
        assert.equal(w.alive, w.cols * w.rows);
        assert.equal(w.total, w.alive);
        const span = (w.cols - 1) * w.colStep + w.bugH;
        if (w.cols > COLS) assert.ok(span <= BLOCK_SHARE * (w.right - w.left) + 1e-9);
        assert.ok(bugX(w, lowest(w, w.cols - 1)) + w.bugH / 2 <= w.right, 'fits the width');
        if (w.rows > ROWS) {
          const bottom = w.ceiling + FORM_TOP * w.unit + (w.rows - 1) * w.rowStep;
          assert.ok(bottom <= w.benjoY - w.bugH - DROPS_CLEAR * DROP * w.unit + 1e-9);
        }
      }
    });
  }
});

describe('the last bugs move fast (#83)', () => {
  test('the last bug of wave 1 moves at least twice as fast as the full block', () => {
    const w = waveWorld({ width: 960, height: 540 }, 1);
    const full = speedFor(w);
    w.alive = 1;
    assert.ok(speedFor(w) >= 2 * full, `${speedFor(w) / full}x`);
  });
});

describe('bites are less predictable (#83)', () => {
  /** Run `n` bites on `wave` and note each gap, who bit, and Benjo's nearest column. */
  function bites(wave, n = 400, seed = 7) {
    const w = waveWorld({ width: 960, height: 540 }, wave, seed);
    const gaps = [];
    let aimed = 0;
    for (let i = 0; i < n; i++) {
      w.bx = w.left + (((i * 97) % 100) / 100) * (w.right - w.left);
      w.biteT = 0;
      const b = nextBiter(w, 0);
      gaps.push(w.biteT);
      let near = null;
      for (let c = 0; c < w.cols; c++) {
        const x = bugX(w, lowest(w, c));
        if (near === null || Math.abs(x - w.bx) < Math.abs(near - w.bx)) near = x;
      }
      if (bugX(w, b) === near) aimed += 1;
    }
    return { w, gaps, aimed: aimed / n };
  }

  test('wave 1 has no aimed bites and no bursts, but its gaps vary around the interval', () => {
    assert.equal(aimChanceFor({ wave: 1 }), 0);
    assert.equal(burstChanceFor({ wave: 1 }), 0);
    const { w, gaps, aimed } = bites(1);
    const base = biteIntervalFor(w);
    assert.ok(
      gaps.every((g) => g >= base * (1 - BITE_T_JITTER) && g <= base * (1 + BITE_T_JITTER)),
    );
    assert.ok(Math.max(...gaps) - Math.min(...gaps) > base * BITE_T_JITTER, 'gaps spread out');
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    assert.ok(Math.abs(mean - base) < 0.1 * base, `mean ${mean} vs ${base}`);
    assert.ok(aimed < 0.4, `${aimed} of random bites hit Benjo's column by chance`);
  });

  test('later waves aim more bites at Benjo and burst some', () => {
    const late = bites(8);
    assert.ok(late.aimed > bites(1).aimed + 0.25, `aimed ${late.aimed}`);
    const bursts = late.gaps.filter((g) => g === BURST_GAP).length / late.gaps.length;
    assert.ok(bursts > 0.15 && bursts < 0.45, `bursts ${bursts}`);
  });

  test('each bite falls at its own pace, within the range', () => {
    const w = createWorld({ width: 960, height: 540 }, seeded(3));
    const paces = new Set();
    for (let i = 0; i < 60 * 60; i++) {
      stepWorld(w, { move: 0, targetX: null, fire: false, firing: false }, DT);
      for (const s of w.bites) if (s.active) paces.add(s.pace);
      if (w.dead) break;
    }
    assert.ok(paces.size >= 5, `${paces.size} paces`);
    for (const pace of paces) assert.ok(pace >= BITE_PACE_MIN && pace <= BITE_PACE_MAX, `${pace}`);
  });
});
