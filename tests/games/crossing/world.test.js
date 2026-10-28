import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  blockAt,
  createLane,
  hitAt,
  laneSpeed,
  rerollLane,
} from '../../../src/games/crossing/lanes.js';
import {
  CELL_MAX,
  CROSS_T,
  GAP_MIN,
  GOAL_SCORE,
  HIT_T,
  HOP_T,
  LANE_SPEED_CAP,
  LANE_SPEED_CAP_REDUCED,
  LANES,
  LEN_MAX,
  ORB_SCORE,
  ROW_SCORE,
  ROWS,
  START_GRACE,
} from '../../../src/games/crossing/tuning.js';
import { createWorld, resizeWorld, stepWorld } from '../../../src/games/crossing/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const NONE = { hop: null };
const HOP_STEPS = Math.ceil(HOP_T / DT);

/** Step `seconds` with no input. */
function run(w, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepWorld(w, NONE, DT);
  return w;
}

/** Still lanes whose blocks sit two cells away from Benjo's column, with no orbs. */
function calm(w) {
  for (const lane of w.lanes) {
    Object.assign(lane, { len: 1, gap: 4, period: 5, speed: 0, orbAt: -1, orbTaken: false });
    lane.offset = lane.prevOffset = w.col + 0.5 - 2.5;
  }
  return w;
}

/** A calm world past the start grace. */
function ready(size = SIZE, options = {}) {
  return calm(run(createWorld(size, seeded(1), options), START_GRACE + DT));
}

/** Press one hop and wait for it to land. */
function hop(w, dir) {
  stepWorld(w, { hop: dir }, DT);
  for (let i = 0; i < HOP_STEPS && w.hopT > 0; i++) stepWorld(w, NONE, DT);
  return w;
}

/** Put the lane under Benjo's next row on top of his column. */
function blockAbove(w) {
  const lane = w.lanes[w.row];
  Object.assign(lane, { len: 3, gap: 2, period: 5, speed: 0 });
  lane.offset = w.col + 0.5 - 1.5;
}

describe('hops', () => {
  test('a hop moves exactly one row and takes HOP_T', () => {
    const w = ready();
    stepWorld(w, { hop: 'up' }, DT);
    assert.equal(w.row, 1);
    assert.ok(w.by < 1.5, 'the tween has started, not finished');
    let steps = 1;
    while (w.hopT > 0) {
      stepWorld(w, NONE, DT);
      steps += 1;
    }
    assert.equal(steps, HOP_STEPS);
    assert.equal(w.by, 1.5);
    assert.equal(w.row, 1);
  });

  test('a hop inside the start grace is the press that started the run', () => {
    const w = calm(createWorld(SIZE, seeded(1)));
    stepWorld(w, { hop: 'up' }, DT);
    assert.equal(w.row, 0);
  });

  test('a second hop pressed mid-tween runs after it', () => {
    const w = ready();
    stepWorld(w, { hop: 'up' }, DT);
    stepWorld(w, { hop: 'right' }, DT);
    assert.equal(w.col, Math.floor(w.cols / 2), 'the second hop waits');
    run(w, HOP_T * 3);
    assert.equal(w.row, 1);
    assert.equal(w.col, Math.floor(w.cols / 2) + 1);
    assert.equal(w.facing, 'right');
  });

  test('left and right stop at the band, and down on the start curb does nothing', () => {
    const w = ready();
    for (let i = 0; i < w.cols + 2; i++) hop(w, 'left');
    assert.equal(w.col, 0);
    for (let i = 0; i < w.cols + 2; i++) hop(w, 'right');
    assert.equal(w.col, w.cols - 1);
    hop(w, 'down');
    assert.equal(w.row, 0);
    assert.equal(w.hopT, 0);
  });
});

describe('score and levels', () => {
  test('each new highest row scores once, and the goal scores and starts a faster level', () => {
    const w = ready();
    hop(w, 'up');
    hop(w, 'up');
    assert.equal(w.score, 2 * ROW_SCORE);
    hop(w, 'down');
    hop(w, 'up');
    assert.equal(w.score, 2 * ROW_SCORE, 'a row already scored does not score again');
    const before = w.lanes.map((lane) => laneSpeed(lane.index, 1, false));
    for (let i = 0; i < 6; i++) hop(w, 'up');
    assert.equal(w.score, LANES * ROW_SCORE + GOAL_SCORE);
    assert.equal(w.level, 2);
    assert.equal(w.row, 0, 'Benjo is back on the start curb');
    assert.equal(w.clock, CROSS_T);
    for (const [i, lane] of w.lanes.entries()) assert.ok(lane.speed > before[i], `lane ${i + 1}`);
  });

  test('collecting an orb scores once', () => {
    const w = ready();
    const lane = w.lanes[0];
    lane.orbAt = 2;
    lane.offset = w.col + 0.5 - 2.5;
    hop(w, 'up');
    assert.equal(w.score, ROW_SCORE + ORB_SCORE);
    assert.equal(lane.orbTaken, true);
    hop(w, 'down');
    hop(w, 'up');
    assert.equal(w.score, ROW_SCORE + ORB_SCORE);
    assert.equal(w.orbs, 1);
  });

  test('lane speed grows by lane and level up to the cap, lower with reduced motion', () => {
    assert.ok(laneSpeed(2, 1, false) > laneSpeed(1, 1, false));
    assert.ok(laneSpeed(1, 2, false) > laneSpeed(1, 1, false));
    assert.equal(laneSpeed(7, 100, false) * CELL_MAX, LANE_SPEED_CAP);
    assert.equal(laneSpeed(7, 100, true) * CELL_MAX, LANE_SPEED_CAP_REDUCED);
    assert.ok(laneSpeed(7, 3, false) <= 4, 'four cells a second or less through level 3');
  });
});

describe('lanes', () => {
  test('lanes alternate direction and lane 1 moves right', () => {
    const w = createWorld(SIZE, seeded(1));
    for (const [i, lane] of w.lanes.entries()) assert.equal(lane.dir, i % 2 === 0 ? 1 : -1);
  });

  test('blockAt is periodic and a lane is never fully covered', () => {
    const random = seeded(9);
    const lane = createLane(3);
    for (let i = 0; i < 200; i++) {
      rerollLane(lane, 1 + (i % 10), random, false);
      assert.ok(lane.gap >= GAP_MIN && lane.len <= LEN_MAX && lane.len >= 1);
      assert.equal(lane.period, lane.len + lane.gap);
      const x = random() * 20;
      assert.equal(blockAt(lane, x), blockAt(lane, x + lane.period * 3));
      let open = 0;
      for (let c = 0; c < lane.period; c++) if (!blockAt(lane, c + 0.5)) open += 1;
      assert.ok(open >= GAP_MIN - 1, 'at least one open cell per period');
    }
  });

  test('a block edge inside the hit margin is a near miss', () => {
    const lane = Object.assign(createLane(1), { len: 2, gap: 3, period: 5, offset: 0 });
    assert.equal(hitAt(lane, 1), true);
    assert.equal(hitAt(lane, 0.1), false);
    assert.equal(hitAt(lane, 1.9), false);
  });
});

describe('lives', () => {
  test('standing in a block costs a life, then Benjo restarts on the curb', () => {
    const w = ready();
    hop(w, 'up');
    assert.equal(w.topRow, 1);
    blockAbove(w);
    stepWorld(w, { hop: 'up' }, DT);
    assert.equal(w.lives, 2);
    assert.equal(w.hit, 'block');
    assert.ok(w.hitT > 0, 'the hit stop holds Benjo where he was hit');
    run(w, HIT_T + DT);
    assert.equal(w.row, 0);
    assert.equal(w.topRow, 0, 'the row marker is cleared');
    assert.ok(w.clock > CROSS_T - 2 * DT, 'the crossing clock starts over');
    assert.equal(w.dead, false);
  });

  test('the crossing clock running out costs a life', () => {
    const w = ready();
    run(w, CROSS_T);
    assert.equal(w.lives, 2);
    assert.equal(w.hit, 'timeout');
  });

  test('the third loss ends the run, and the last hit names it', () => {
    const w = ready();
    run(w, CROSS_T + HIT_T + DT);
    run(w, CROSS_T + HIT_T + DT);
    assert.equal(w.lives, 1);
    calm(w);
    blockAbove(w);
    stepWorld(w, { hop: 'up' }, DT);
    assert.equal(w.lives, 0);
    assert.equal(w.dead, true);
    assert.equal(w.hit, 'block');
    run(w, 1);
    assert.ok(w.deadT > 0.9);
  });
});

describe('layout', () => {
  test('resize keeps Benjo on the band', () => {
    const w = createWorld({ width: 2560, height: 1080 }, seeded(1));
    run(w, START_GRACE + DT);
    calm(w);
    for (let i = 0; i < 12; i++) hop(w, 'right');
    resizeWorld(w, { width: 375, height: 667 });
    assert.equal(w.ceiling, 96, 'the HUD strip is taller on narrow screens');
    assert.ok(w.col < w.cols);
    assert.ok(w.bx > 0 && w.bx < w.cols);
    assert.ok(w.bandX >= 0 && w.bandX + w.cols * w.cell <= w.width);
    run(w, 1);
  });

  test('a tiny canvas gives at least 5 odd columns and 9 rows inside the play area', () => {
    const w = createWorld({ width: 0, height: 0 }, seeded(1));
    assert.ok(w.cols >= 5 && w.cols % 2 === 1);
    assert.ok(w.bandBottom - ROWS * w.cell >= w.ceiling, 'rows stay below the HUD strip');
    assert.ok(w.bandBottom <= w.height);
    run(w, 1);
  });

  test('every target size fits the rows below the safe area', () => {
    for (const size of [
      { width: 320, height: 480 },
      { width: 320, height: 240 },
      { width: 375, height: 667 },
      { width: 960, height: 540 },
      { width: 1440, height: 900 },
      { width: 2560, height: 1080 },
    ]) {
      const w = createWorld(size, seeded(1));
      assert.ok(w.bandBottom - ROWS * w.cell >= w.ceiling, `${size.width}x${size.height}`);
      assert.ok(w.bandBottom <= w.height - 16 + 1e-9);
      assert.ok(w.bandX >= 16 - 1e-9 && w.cols % 2 === 1);
    }
  });
});
