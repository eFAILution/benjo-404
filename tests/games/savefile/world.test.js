import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  BIN_X,
  FILE_X,
  GIRDERS,
  girderY,
  LADDERS,
  START_X,
  TOP,
} from '../../../src/games/savefile/level.js';
import {
  BUG_R,
  BUG_SPEED_CAP,
  BUG_SPEED_CAP_REDUCED,
  CLEAR_SCORE,
  CLEAR_T,
  CLIMB,
  EVENT_CLEAR,
  EVENT_HIT,
  EVENT_HOP,
  HIT_T,
  HOLD_T,
  JUMP_SCORE,
  LIVES,
  ORB_SCORE,
  START_GRACE,
  TIME_START,
  WALK,
} from '../../../src/games/savefile/tuning.js';
import {
  bugSpeedFor,
  createWorld,
  ladderChanceFor,
  resizeWorld,
  stepWorld,
  throwFor,
} from '../../../src/games/savefile/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const idle = () => ({ mx: 0, my: 0, jump: false, climb: 0, px: null, held: 0 });

/** Step `seconds` with `intent(w)`. */
function run(w, seconds, intent = idle) {
  for (let i = 0; i < Math.round(seconds / DT) && !w.dead; i++) stepWorld(w, intent(w), DT);
  return w;
}

/** A world past the start grace with no bugs and no throws, and nothing to pick up. */
function live(seed = 1) {
  const w = run(createWorld(SIZE, seeded(seed)), START_GRACE + DT);
  w.throwT = Number.POSITIVE_INFINITY;
  for (const o of w.orbs) o.active = false;
  return w;
}

/** Put a bug rolling on girder `g` at `x`. */
function bugAt(w, g, x, dir = GIRDERS[g].dir) {
  const b = w.bugs[0];
  Object.assign(b, {
    active: true,
    state: 'roll',
    g,
    x,
    dir,
    vy: 0,
    ladder: -1,
    sprite: 0,
    hopped: 0,
  });
  b.y = girderY(g, x) - BUG_R;
  b.prevX = b.x;
  b.prevY = b.y;
  return b;
}

describe('level', () => {
  test('every ladder joins two girders it stands on, and the girders alternate their slope', () => {
    for (const l of LADDERS) {
      assert.equal(l.top, l.bottom + 1);
      for (const g of [l.top, l.bottom]) assert.ok(l.x >= GIRDERS[g].x0 && l.x <= GIRDERS[g].x1);
    }
    for (let g = 1; g < TOP; g++) {
      const { y0, y1, dir } = GIRDERS[g];
      assert.equal(Math.sign(y1 - y0), dir, `girder ${g} slopes downhill the way bugs roll`);
    }
    for (let g = 0; g < TOP; g++)
      assert.ok(
        LADDERS.some((l) => l.bottom === g),
        `a way up from ${g}`,
      );
  });

  test('the open end of each girder is over the girder below', () => {
    for (let g = 1; g < TOP; g++) {
      const { x0, x1, dir } = GIRDERS[g];
      const edge = dir > 0 ? x1 + 4 : x0 - 4;
      assert.ok(edge >= GIRDERS[g - 1].x0 && edge <= GIRDERS[g - 1].x1, `girder ${g}`);
    }
  });
});

describe('Benjo', () => {
  test('walks along a girder at WALK and follows its slope', () => {
    const w = live();
    run(w, 0.5, () => ({ ...idle(), mx: 1 }));
    assert.ok(Math.abs(w.x - (START_X + 0.5 * WALK)) < 2);
    assert.equal(w.y, girderY(0, w.x));
  });

  test('a held finger walks him toward it only after HOLD_T', () => {
    const w = live();
    const target = w.ox + 300 * w.kx;
    stepWorld(w, { ...idle(), px: target, held: HOLD_T / 2 }, DT);
    assert.equal(w.x, START_X);
    run(w, 0.5, () => ({ ...idle(), px: target, held: HOLD_T * 2 }));
    assert.ok(w.x > START_X + 20);
  });

  test('climbs a ladder from its foot to the next girder, and back down', () => {
    const w = live();
    const l = LADDERS.find((ladder) => ladder.bottom === 0);
    w.x = l.x + 4;
    stepWorld(w, { ...idle(), my: -1 }, DT);
    assert.equal(w.state, 'climb');
    assert.equal(w.x, l.x);
    const height = girderY(0, l.x) - girderY(1, l.x);
    run(w, height / CLIMB + 0.1, () => ({ ...idle(), my: -1 }));
    assert.equal(w.state, 'walk');
    assert.equal(w.g, 1);
    run(w, height / CLIMB + 0.2, () => ({ ...idle(), my: 1 }));
    assert.equal(w.g, 0);
  });

  test('a swipe takes the whole ladder without holding a key', () => {
    const w = live();
    const l = LADDERS.find((ladder) => ladder.bottom === 0);
    w.x = l.x;
    stepWorld(w, { ...idle(), climb: -1 }, DT);
    run(w, 3);
    assert.equal(w.g, 1);
  });

  test('a jump lands back on the same girder', () => {
    const w = live();
    stepWorld(w, { ...idle(), jump: true }, DT);
    assert.equal(w.state, 'jump');
    run(w, 0.3);
    assert.ok(w.y < girderY(0, w.x) - 20, 'off the girder');
    run(w, 0.6);
    assert.equal(w.state, 'walk');
    assert.equal(w.g, 0);
  });

  test('input inside the start grace is the press that started the run', () => {
    const w = createWorld(SIZE, seeded(1));
    stepWorld(w, { ...idle(), mx: 1, jump: true }, DT);
    assert.equal(w.x, START_X);
    assert.equal(w.state, 'walk');
  });
});

describe('bugs', () => {
  test('roll downhill, drop off the open end onto the girder below, and end in the bin', () => {
    // A random source that always rolls high never sends a bug down a ladder.
    const w = run(
      createWorld(SIZE, () => 0.99),
      START_GRACE + DT,
    );
    w.throwT = Number.POSITIVE_INFINITY;
    for (const o of w.orbs) o.active = false;
    const b = bugAt(w, 1, 300);
    // Benjo waits on a girder the bug never visits.
    w.g = 3;
    w.x = 200;
    w.y = girderY(3, w.x);
    let fell = false;
    let lastG = 1;
    for (let i = 0; i < 20 * 60 && b.active; i++) {
      stepWorld(w, idle(), DT);
      if (b.state === 'fall') fell = true;
      lastG = b.g;
      if (w.lives < LIVES) break;
    }
    assert.ok(fell);
    assert.equal(lastG, 0);
    assert.equal(b.active, false, 'it went in the bin');
    assert.ok(b.x < BIN_X);
  });

  test('roll faster, come more often, and take more ladders each level, up to caps', () => {
    const w = live();
    const [speed, gap, chance] = [bugSpeedFor(w), throwFor(w), ladderChanceFor(w)];
    w.level = 3;
    assert.ok(bugSpeedFor(w) > speed && throwFor(w) < gap && ladderChanceFor(w) > chance);
    w.level = 100;
    assert.equal(bugSpeedFor(w), BUG_SPEED_CAP);
    w.reducedMotion = true;
    assert.equal(bugSpeedFor(w), BUG_SPEED_CAP_REDUCED);
  });

  test('touching one costs a life, clears the level, and puts Benjo back at the start', () => {
    const w = live();
    bugAt(w, 0, START_X + 4);
    stepWorld(w, idle(), DT);
    assert.equal(w.lives, LIVES - 1);
    assert.ok(w.events & EVENT_HIT);
    run(w, HIT_T + DT);
    assert.equal(w.x, START_X);
    assert.ok(w.bugs.every((b) => !b.active));
    assert.ok(w.clock > TIME_START - 0.1, 'the clock starts again');
  });

  test('the last life ends the run', () => {
    const w = live();
    w.lives = 1;
    bugAt(w, 0, START_X + 4);
    stepWorld(w, idle(), DT);
    assert.equal(w.dead, true);
    assert.equal(w.hit, 'bug');
  });

  test('jumping a bug that rolls under Benjo scores it once', () => {
    const w = live();
    w.x = 200;
    w.y = girderY(0, 200);
    bugAt(w, 0, 222);
    stepWorld(w, { ...idle(), jump: true }, DT);
    let events = 0;
    for (let i = 0; i < 0.8 / DT; i++) {
      stepWorld(w, idle(), DT);
      events |= w.events;
    }
    assert.equal(w.lives, LIVES);
    assert.equal(w.score, JUMP_SCORE);
    assert.ok(events & EVENT_HOP);
  });
});

describe('scoring and the clock', () => {
  test('an orb scores when Benjo walks into it', () => {
    const w = live();
    Object.assign(w.orbs[0], { active: true, g: 0, x: START_X + 20 });
    run(w, 0.5, () => ({ ...idle(), mx: 1 }));
    assert.equal(w.score, ORB_SCORE);
    assert.equal(w.orbs[0].active, false);
  });

  test('reaching the file banks the clock and starts the next level after a pause', () => {
    const w = live();
    Object.assign(w, { g: TOP, x: FILE_X - 30, y: girderY(TOP, FILE_X - 30) });
    const clock = w.clock;
    let events = 0;
    for (let i = 0; i < 30; i++) {
      stepWorld(w, { ...idle(), mx: 1 }, DT);
      events |= w.events;
    }
    assert.ok(events & EVENT_CLEAR);
    assert.equal(w.pause, 'clear');
    assert.ok(w.score >= CLEAR_SCORE + Math.floor(clock) - 1);
    run(w, CLEAR_T + DT);
    assert.equal(w.level, 2);
    assert.equal(w.g, 0);
  });

  test('when the clock runs out, a life goes', () => {
    const w = live();
    w.clock = DT / 2;
    stepWorld(w, idle(), DT);
    assert.equal(w.lives, LIVES - 1);
    assert.equal(w.hit, 'time');
  });
});

test('a resize keeps Benjo where he is in the level', () => {
  const w = live();
  run(w, 0.5, () => ({ ...idle(), mx: 1 }));
  const { x, y } = w;
  resizeWorld(w, { width: 375, height: 667 });
  assert.equal(w.width, 375);
  assert.deepEqual([w.x, w.y], [x, y]);
  assert.ok(w.ox >= 0 && w.ox + 448 * w.kx <= w.width);
});
