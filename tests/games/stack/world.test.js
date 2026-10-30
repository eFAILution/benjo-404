import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  CUT_T,
  EVENT_LAND,
  EVENT_MISS,
  EVENT_PERFECT,
  EVENT_WIDEN,
  MAX_BLOCKS,
  SLIDE_CAP,
  SLIDE_CAP_REDUCED,
  START_GRACE,
  WIDEN,
} from '../../../src/games/stack/tuning.js';
import {
  createWorld,
  resizeWorld,
  speedFor,
  stepWorld,
  topBlock,
} from '../../../src/games/stack/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const EPS = 1e-9;

/** Step `seconds` of world time without dropping. */
function run(w, seconds) {
  for (let i = 0; i < Math.round(seconds / DT) && !w.dead; i++) stepWorld(w, false, DT);
  return w;
}

/** A world past the start grace, so a drop counts. */
const live = (size = SIZE, options = {}) =>
  run(createWorld(size, seeded(1), options), START_GRACE + DT);

/** Put the moving block `offset` px right of the top block and drop it. */
function dropAt(w, offset) {
  w.x = topBlock(w).x + offset;
  return stepWorld(w, true, DT);
}

/** Every stored block and the moving block sit inside the play rect. */
function assertInside(w) {
  for (const b of w.blocks) {
    if (b.level < 0) continue;
    assert.ok(b.x >= w.left - EPS && b.x + b.w <= w.right + EPS, `block ${b.level} inside`);
  }
  assert.ok(w.x >= w.left - EPS && w.x + w.bw <= w.right + EPS, 'moving block inside');
  const stackH = (w.score + 1 - w.cam) * w.blockH;
  assert.ok(stackH <= w.playH, 'stack top below the HUD strip');
}

describe('slide', () => {
  test('the block slides and reverses at both edges', () => {
    const w = live();
    assert.equal(w.dir, 1);
    while (w.dir === 1) stepWorld(w, false, DT);
    assert.equal(w.x, w.right - w.bw);
    while (w.dir === -1) stepWorld(w, false, DT);
    assert.equal(w.x, w.left);
  });

  test('the first block starts from the left edge and sides alternate per block', () => {
    const w = live();
    assert.equal(w.score, 0);
    dropAt(w, 0);
    assert.equal(w.x, w.right - w.bw);
    assert.equal(w.dir, -1);
    dropAt(w, 0);
    assert.equal(w.x, w.left);
    assert.equal(w.dir, 1);
  });

  test('a drop inside the start grace is the press that started the run', () => {
    const w = createWorld(SIZE, seeded(1));
    stepWorld(w, true, DT);
    assert.equal(w.score, 0);
    assert.equal(w.dead, false);
  });

  test('a run with no drops slides forever', () => {
    const w = live();
    run(w, 60);
    assert.equal(w.dead, false);
    assert.equal(w.score, 0);
  });
});

describe('landing', () => {
  test('a drop with the same x keeps the width and announces a perfect', () => {
    const w = live();
    const width = topBlock(w).w;
    dropAt(w, 0);
    assert.equal(w.score, 1);
    assert.equal(topBlock(w).w, width);
    assert.equal(w.bw, width);
    assert.ok(w.events & EVENT_PERFECT);
    assert.ok(w.events & EVENT_LAND);
    assert.equal(w.perfects, 1);
  });

  test('a drop inside the tolerance snaps onto the block below', () => {
    const w = live();
    const { x } = topBlock(w);
    dropAt(w, w.perfectTol - 0.01);
    assert.equal(topBlock(w).x, x);
    assert.ok(w.events & EVENT_PERFECT);
  });

  test('a drop offset by 10 px cuts the width by 10 and spawns a cut piece', () => {
    const w = live();
    const below = { ...topBlock(w) };
    dropAt(w, 10);
    assert.equal(w.score, 1);
    assert.ok(Math.abs(topBlock(w).w - (below.w - 10)) < EPS);
    assert.ok(Math.abs(topBlock(w).x - (below.x + 10)) < EPS);
    assert.equal(w.events & EVENT_PERFECT, 0);
    assert.equal(w.streak, 0);
    const cut = w.cuts.find((c) => c.active);
    assert.ok(cut);
    assert.ok(Math.abs(cut.w - 10) < EPS);
    assert.ok(Math.abs(cut.x - (below.x + below.w)) < EPS, 'the overhang on the right falls');
    run(w, CUT_T + DT);
    assert.equal(
      w.cuts.some((c) => c.active),
      false,
      'cut pieces fade out',
    );
  });

  test('a drop with no overlap sets dead with a miss and does not add height', () => {
    const w = live();
    dropAt(w, topBlock(w).w);
    assert.equal(w.dead, true);
    assert.equal(w.hit, 'miss');
    assert.equal(w.score, 0);
    assert.ok(w.events & EVENT_MISS);
    assert.ok(
      w.cuts.some((c) => c.active),
      'the missed block falls',
    );
    for (let i = 0; i < 30; i++) stepWorld(w, true, DT);
    assert.equal(w.score, 0, 'nothing lands once dead');
    assert.ok(Math.abs(w.deadT - 30 * DT) < EPS);
  });

  test('three perfects in a row widen the block by WIDEN, up to the base width', () => {
    const w = live();
    dropAt(w, 10);
    const cutW = topBlock(w).w;
    dropAt(w, 0);
    dropAt(w, 0);
    assert.equal(topBlock(w).w, cutW);
    dropAt(w, 0);
    assert.ok(w.events & EVENT_WIDEN);
    assert.ok(Math.abs(topBlock(w).w - (cutW + WIDEN * w.unit)) < EPS);
    for (let i = 0; i < 9; i++) dropAt(w, 0);
    assert.equal(topBlock(w).w, w.baseW);
    assertInside(w);
  });
});

describe('difficulty', () => {
  test('speed grows 8 per block to the cap, lower with reduced motion', () => {
    const w = createWorld(SIZE, seeded(1));
    assert.ok(Math.abs(speedFor(w) - 180 * w.unit) < EPS);
    w.score = 1;
    assert.ok(Math.abs(speedFor(w) - 188 * w.unit) < EPS);
    w.score = 1000;
    assert.equal(speedFor(w), SLIDE_CAP);
    w.reducedMotion = true;
    assert.equal(speedFor(w), SLIDE_CAP_REDUCED);
  });

  test('the fastest block moves at most 7 px per step, under twice the perfect tolerance', () => {
    const w = createWorld({ width: 320, height: 240 }, seeded(1));
    w.score = 1000;
    assert.ok(speedFor(w) * DT <= 7 + EPS);
    assert.ok(speedFor(w) * DT < 2 * w.perfectTol);
  });
});

describe('camera', () => {
  test('starts shifting once the stack passes 40% of the play height', () => {
    const w = live();
    while (w.score + 1 < w.keep) dropAt(w, 0);
    assert.equal(w.camTarget, 0, 'the stack fills 40% of the play height');
    assert.ok((w.score + 1) * w.blockH <= w.playH * 0.4);
    dropAt(w, 0);
    assert.equal(w.camTarget, 1);
    assert.ok(w.cam < 1, 'the camera tweens');
    run(w, 0.2);
    assert.equal(w.cam, 1);
  });

  test('reduced motion snaps the camera and drops no cut pieces', () => {
    const w = live(SIZE, { reducedMotion: true });
    for (let i = 0; i <= w.keep; i++) dropAt(w, 0);
    assert.equal(w.cam, w.camTarget);
    assert.ok(w.cam > 0);
    dropAt(w, 10);
    assert.equal(
      w.cuts.some((c) => c.active),
      false,
    );
  });

  test('old blocks are dropped from the ring and the stack top stays in view', () => {
    const w = live();
    for (let i = 0; i < 60; i++) {
      dropAt(w, 0);
      run(w, 0.2);
      assert.ok((w.score + 1 - w.cam) * w.blockH <= w.playH * 0.4 + EPS);
    }
    assert.equal(w.blocks.length, MAX_BLOCKS);
    const levels = w.blocks.map((b) => b.level);
    assert.equal(levels.includes(0), false, 'the base is gone');
    assert.equal(Math.min(...levels), w.score - MAX_BLOCKS + 1);
  });
});

describe('resize', () => {
  test('keeps the stack inside the play rect at every size', () => {
    const sizes = [
      { width: 375, height: 667 },
      { width: 2560, height: 1080 },
      { width: 320, height: 240 },
      { width: 320, height: 480 },
      { width: 1440, height: 900 },
    ];
    const w = live();
    for (let i = 0; i < 20; i++) dropAt(w, i % 4 === 0 ? 3 : 0);
    for (const size of sizes) {
      resizeWorld(w, size);
      assert.equal(w.width, size.width);
      assert.equal(w.ceiling, size.width < 600 ? 96 : 64, 'the HUD strip is taller when narrow');
      assertInside(w);
      run(w, 0.5);
      dropAt(w, 0);
      assert.equal(w.dead, false);
    }
  });

  test('a tiny canvas is treated as the minimum size', () => {
    const w = createWorld({ width: 0, height: 0 }, seeded(1));
    assert.equal(w.width, 320);
    assert.equal(w.height, 240);
    assert.ok(w.blockH >= 14);
    assert.ok(w.playH > 0 && w.keep >= 1);
    run(w, 1);
    assertInside(w);
  });
});
