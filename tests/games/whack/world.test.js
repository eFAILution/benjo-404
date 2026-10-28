import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  BUG_SCORE,
  DECOY_COST,
  EVENT_DECOY,
  EVENT_MISS,
  EVENT_SQUASH,
  EVENT_WHIFF,
  POP_T,
  ROUND_T,
  SPAWN_T_MIN,
  SPAWN_T_START,
  START_GRACE,
  UP_T_MIN,
  UP_T_START,
} from '../../../src/games/whack/tuning.js';
import {
  createWorld,
  holeAt,
  maxUpFor,
  resizeWorld,
  spawnGapFor,
  stepWorld,
  upTimeFor,
} from '../../../src/games/whack/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const NONE = { hole: -1 };

/** Step `seconds` of world time, whacking whatever `pick(w)` returns. */
function run(w, seconds, pick = () => -1) {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepWorld(w, { hole: pick(w) }, DT);
  return w;
}

/** A world past the start grace with nothing up and the spawn clock held back. */
function ready(options = {}) {
  const w = run(createWorld(SIZE, seeded(1), options), START_GRACE + DT);
  for (const hole of w.holes) hole.kind = null;
  w.spawnClock = Number.NEGATIVE_INFINITY;
  return w;
}

/** Put a thing in a hole, already fully up. */
function place(w, h, kind = 'bug') {
  Object.assign(w.holes[h], {
    kind,
    t: POP_T,
    upT: 10,
    sinking: false,
    sinkT: 0,
    squashed: false,
  });
  return w.holes[h];
}

describe('spawning', () => {
  test('a bug spawns in an empty hole after the first spawn gap', () => {
    const w = createWorld(SIZE, seeded(1));
    run(w, SPAWN_T_START - 0.1);
    assert.equal(
      w.holes.some((h) => h.kind),
      false,
    );
    run(w, 0.1 + DT);
    const up = w.holes.filter((h) => h.kind);
    assert.equal(up.length, 1);
    assert.equal(up[0].kind, 'bug');
  });

  test('never puts two things in one hole', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = createWorld(SIZE, seeded(seed));
      const ids = w.holes.map(() => 0);
      for (let i = 0; i < ROUND_T / DT; i++) {
        stepWorld(w, NONE, DT);
        w.holes.forEach((hole, h) => {
          if (hole.kind && ids[h] && hole.id !== ids[h]) {
            assert.fail(`seed ${seed}: hole ${h} got thing ${hole.id} over ${ids[h]}`);
          }
          ids[h] = hole.kind ? hole.id : 0;
        });
      }
      assert.ok(w.spawned > 20, `seed ${seed} spawned only ${w.spawned}`);
    }
  });

  test('the spawn gap and up time shrink toward their minimums', () => {
    const w = createWorld(SIZE, seeded(1));
    assert.equal(spawnGapFor(w), SPAWN_T_START);
    assert.equal(upTimeFor(w), UP_T_START);
    w.time = ROUND_T / 2;
    assert.ok(spawnGapFor(w) < SPAWN_T_START && spawnGapFor(w) > SPAWN_T_MIN);
    w.time = ROUND_T;
    assert.equal(spawnGapFor(w), SPAWN_T_MIN);
    assert.equal(upTimeFor(w), UP_T_MIN);
  });

  test('things up at once step from one to two at 15 s and three at 30 s', () => {
    const w = createWorld(SIZE, seeded(1));
    for (const [time, expected] of [
      [0, 1],
      [14.9, 1],
      [15, 2],
      [29.9, 2],
      [30, 3],
      [44.9, 3],
    ]) {
      w.time = time;
      assert.equal(maxUpFor(w), expected, `at ${time} s`);
    }
  });
});

describe('whacking', () => {
  test('whacking a bug scores 10 and sinks it', () => {
    const w = ready();
    const hole = place(w, 2);
    stepWorld(w, { hole: 2 }, DT);
    assert.equal(w.score, BUG_SCORE);
    assert.equal(w.hits, 1);
    assert.equal(hole.sinking, true);
    assert.equal(hole.squashed, true);
    assert.ok(w.events & EVENT_SQUASH);
    run(w, POP_T + DT);
    assert.equal(hole.kind, null);
  });

  test('a combo adds 2 per hit in a row up to +10, and a whiff resets it', () => {
    const w = ready();
    const gains = [];
    for (let i = 0; i < 8; i++) {
      place(w, 0);
      const before = w.score;
      stepWorld(w, { hole: 0 }, DT);
      gains.push(w.score - before);
      w.holes[0].kind = null;
    }
    assert.deepEqual(gains, [10, 12, 14, 16, 18, 20, 20, 20]);
    stepWorld(w, { hole: 3 }, DT);
    assert.ok(w.events & EVENT_WHIFF);
    assert.equal(w.combo, 0);
    place(w, 0);
    const before = w.score;
    stepWorld(w, { hole: 0 }, DT);
    assert.equal(w.score - before, BUG_SCORE);
  });

  test('a decoy costs 5, resets the combo, and the score never goes below 0', () => {
    const w = ready();
    place(w, 1, 'decoy');
    stepWorld(w, { hole: 1 }, DT);
    assert.equal(w.score, 0);
    assert.ok(w.events & EVENT_DECOY);
    w.holes[1].kind = null;
    place(w, 0);
    stepWorld(w, { hole: 0 }, DT);
    w.holes[0].kind = null;
    place(w, 0);
    stepWorld(w, { hole: 0 }, DT);
    assert.equal(w.combo, 2);
    const before = w.score;
    place(w, 4, 'decoy');
    stepWorld(w, { hole: 4 }, DT);
    assert.equal(w.score, before - DECOY_COST);
    assert.equal(w.combo, 0);
  });

  test('a bug left alone sinks after its up time, counts as missed, and resets the combo', () => {
    const w = ready();
    w.combo = 4;
    const hole = place(w, 3);
    hole.upT = 0.5;
    run(w, 0.5 - POP_T + DT);
    assert.equal(hole.sinking, true);
    assert.equal(w.missed, 1);
    assert.equal(w.combo, 0);
    assert.equal(w.score, 0);
  });

  test('a decoy left alone sinks without a miss', () => {
    const w = ready();
    const hole = place(w, 3, 'decoy');
    hole.upT = 0.5;
    let missed = 0;
    for (let i = 0; i < 60; i++) missed |= stepWorld(w, NONE, DT).events & EVENT_MISS;
    assert.equal(hole.kind, null);
    assert.equal(missed, 0);
    assert.equal(w.missed, 0);
  });

  test('whacks inside the start grace are ignored', () => {
    const w = createWorld(SIZE, seeded(1));
    place(w, 0);
    stepWorld(w, { hole: 0 }, DT);
    assert.equal(w.score, 0);
    assert.equal(w.events, 0);
  });

  test('reduced motion pops and sinks instantly', () => {
    const w = ready({ reducedMotion: true });
    w.spawnClock = 10;
    stepWorld(w, NONE, DT);
    const h = w.holes.findIndex((hole) => hole.kind);
    assert.equal(w.holes[h].lift, 1);
    stepWorld(w, { hole: h }, DT);
    assert.equal(w.holes[h].kind, null);
    assert.equal(w.holes[h].lift, 0);
  });
});

describe('round', () => {
  test('ends at 45 s with dead set and everything sinking', () => {
    const w = createWorld(SIZE, seeded(2));
    run(w, ROUND_T - 1);
    assert.equal(w.dead, false);
    run(w, 1 + DT);
    assert.equal(w.dead, true);
    for (const hole of w.holes) assert.ok(!hole.kind || hole.sinking);
    const spawned = w.spawned;
    run(w, 2);
    assert.equal(w.spawned, spawned, 'nothing spawns after time is up');
    assert.ok(w.deadT > 1.9);
  });
});

describe('layout', () => {
  test('the pointer finds the hole under it, anywhere in its cell', () => {
    const w = createWorld(SIZE, seeded(1));
    for (let h = 0; h < 5; h++) {
      const q = w.cell * 0.45;
      assert.equal(holeAt(w, w.holeX[h] - q, w.holeY[h] + q), h);
    }
    assert.equal(holeAt(w, w.holeX[1] + w.cell, w.holeY[1]), -1, 'a corner cell is no hole');
  });

  test('resize keeps hole state and the board inside the play area', () => {
    const w = run(createWorld(SIZE, seeded(3)), 5);
    const before = JSON.stringify(w.holes);
    for (const size of [
      { width: 320, height: 480 },
      { width: 320, height: 240 },
      { width: 2560, height: 1080 },
    ]) {
      resizeWorld(w, size);
      assert.equal(JSON.stringify(w.holes), before);
      for (let h = 0; h < 5; h++) {
        assert.ok(w.holeX[h] - w.cell / 2 >= 0 && w.holeX[h] + w.cell / 2 <= w.width);
        assert.ok(w.holeY[h] - w.cell / 2 >= w.ceiling, 'below the HUD strip');
        assert.ok(w.holeY[h] + w.cell / 2 <= w.height);
      }
    }
  });

  test('a tiny canvas is treated as the minimum size', () => {
    const w = createWorld({ width: 0, height: 0 }, seeded(1));
    assert.equal(w.width, 320);
    assert.equal(w.height, 240);
    assert.ok(w.cell > 20);
    run(w, 1);
  });
});
