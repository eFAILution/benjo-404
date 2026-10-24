import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { benjoBox, obstacleBox, orbBox, overlaps } from '../../../src/games/runner/collide.js';
import { arcFits } from '../../../src/games/runner/spawn.js';
import {
  EVENT_JUMP,
  EVENT_LAND,
  KIND_FLYER,
  KIND_GROUND,
  PICKUP_SCORE,
} from '../../../src/games/runner/tuning.js';
import { cloneWorld, createWorld, stepWorld } from '../../../src/games/runner/world.js';
import { DT, idle, seeded } from './fake-host.js';

const SIZE = { width: 960, height: 540 };

const world = (options = {}, seed = 1) => createWorld(SIZE, seeded(seed), options);

/** Step `seconds` with an input built per step from the elapsed time. */
function run(start, seconds, inputAt = idle, onStep = () => {}) {
  let w = start;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    w = stepWorld(w, inputAt(i * DT), DT);
    onStep(w);
  }
  return w;
}

/** A jump press at `at` seconds, held for `hold` seconds. */
const press = (at, hold) => (t) => ({
  ...idle(),
  jumpPressed: t >= at && t < at + DT / 2,
  jumpHeld: t >= at && t < at + hold,
});

/** Highest point of a jump pressed at 0.5 s and held for `hold` seconds. */
function apex(hold) {
  let top = 0;
  run(world({ immortal: true }), 1.5, press(0.5, hold), (w) => {
    top = Math.max(top, w.by);
  });
  return top;
}

function placeObstacle(w, fields) {
  Object.assign(w.obstacles[0], { active: true, kind: KIND_GROUND, sprite: 0, y: 0, ...fields });
}

describe('jump', () => {
  test('raises Benjo, then returns him to the ground', () => {
    let top = 0;
    let landed = false;
    const end = run(world({ immortal: true }), 2, press(0.5, 0.4), (w) => {
      top = Math.max(top, w.by);
      if (w.events & EVENT_LAND) landed = true;
    });
    assert.ok(top > 100, `apex ${top}`);
    assert.ok(landed);
    assert.equal(end.by, 0);
    assert.equal(end.grounded, true);
  });

  test('a short press jumps lower than a held one', () => {
    const tap = apex(DT);
    const held = apex(0.5);
    assert.ok(tap < held * 0.6, `tap ${tap} held ${held}`);
    assert.ok(held > 125 && held < 135, `full jump ${held}`);
  });

  test('a press just before landing is buffered and jumps on touchdown', () => {
    let landAt = 0;
    run(world({ immortal: true }), 2, press(0.5, 0), (w) => {
      if ((w.events & EVENT_LAND) !== 0 && landAt === 0) landAt = w.time;
    });
    assert.ok(landAt > 0.5);
    const jumpsWith = (lead) => {
      let jumps = 0;
      const second = landAt - lead;
      run(
        world({ immortal: true }),
        2.5,
        (t) => ({
          ...idle(),
          jumpPressed: Math.abs(t - 0.5) < DT / 2 || Math.abs(t - second) < DT / 2,
        }),
        (w) => {
          if (w.events & EVENT_JUMP) jumps += 1;
        },
      );
      return jumps;
    };
    assert.equal(jumpsWith(0.06), 2, 'pressed 60 ms early still jumps');
    assert.equal(jumpsWith(0.2), 1, 'pressed 200 ms early is dropped');
  });

  test('coyote time allows a jump just after leaving the ground', () => {
    const w = world({ immortal: true });
    Object.assign(w, { time: 1, grounded: false, by: 40, vy: -10, coyoteT: 0.05 });
    const next = stepWorld(w, { ...idle(), jumpPressed: true, jumpHeld: true }, DT);
    assert.ok(next.vy > 700);
    const late = stepWorld({ ...cloneWorld(w), coyoteT: 0 }, { ...idle(), jumpPressed: true }, DT);
    assert.ok(late.vy < 0);
  });
});

describe('speed', () => {
  test('increases over time and caps at 720', () => {
    let last = 0;
    let rose = false;
    const end = run(world({ immortal: true }), 70, idle, (w) => {
      assert.ok(w.speed >= last);
      if (last && w.speed > last) rose = true;
      last = w.speed;
    });
    assert.ok(rose);
    assert.equal(end.speed, 720);
  });

  test('caps at 480 with reduced motion', () => {
    const end = run(world({ immortal: true, reducedMotion: true }), 70);
    assert.equal(end.speed, 480);
  });
});

describe('spawner', () => {
  for (const seed of [1, 2, 3, 42]) {
    test(`obstacle gaps never drop below 260 px over 60 s (seed ${seed})`, () => {
      let spawned = 0;
      let flyerEarly = false;
      run(world({ immortal: true }, seed), 60, idle, (w) => {
        const live = w.obstacles.filter((o) => o.active).sort((a, b) => a.x - b.x);
        for (let i = 1; i < live.length; i++) {
          const gap = live[i].x - (live[i - 1].x + live[i - 1].w);
          assert.ok(gap >= 260 - 1e-6, `gap ${gap} at ${w.time.toFixed(2)} s`);
        }
        if (w.time < 15 && live.some((o) => o.kind === KIND_FLYER)) flyerEarly = true;
        spawned = Math.max(spawned, live.length);
      });
      assert.ok(spawned >= 2);
      assert.equal(flyerEarly, false, 'no flyers before 15 s');
    });

    test(`pickups never overlap an obstacle hitbox over 60 s (seed ${seed})`, () => {
      let orbsSeen = 0;
      run(world({ immortal: true }, seed), 60, idle, (w) => {
        for (const orb of w.orbs) {
          if (!orb.active) continue;
          orbsSeen += 1;
          const ob = orbBox(orb.x, orb.y, orb.size);
          for (const o of w.obstacles) {
            if (o.active) assert.equal(overlaps(ob, obstacleBox(o)), false);
          }
        }
      });
      assert.ok(orbsSeen > 0);
    });
  }

  test('an arc on top of the next obstacle is rejected', () => {
    const w = world();
    Object.assign(w, { gapLeft: 0, nextKind: KIND_GROUND, nextY: 0, nextW: 300, nextH: 56 });
    assert.equal(arcFits(w, 5, 0), false);
    Object.assign(w, { gapLeft: 400 });
    assert.equal(arcFits(w, 5, 0), true);
  });
});

describe('collision and score', () => {
  test('hitting a ground hazard ends the run', () => {
    const w = world();
    w.time = 1;
    placeObstacle(w, { x: w.benjoX - 10, w: 40, h: 40 });
    const next = stepWorld(w, idle(), DT);
    assert.equal(next.dead, true);
    const after = stepWorld(next, idle(), DT);
    assert.equal(after.distance, next.distance, 'the world stops on a hit');
    assert.ok(after.deadT > 0);
  });

  test('a hazard behind Benjo does not end the run', () => {
    const w = world();
    placeObstacle(w, { x: w.benjoX - 200, w: 40, h: 40 });
    assert.equal(stepWorld(w, idle(), DT).dead, false);
  });

  test('a pickup adds 25 to the score', () => {
    const base = world();
    base.time = 1;
    const withOrb = cloneWorld(base);
    Object.assign(withOrb.orbs[0], { active: true, x: base.benjoX, y: 24, size: 18 });
    const a = stepWorld(base, idle(), DT);
    const b = stepWorld(withOrb, idle(), DT);
    assert.equal(b.collected, 1);
    assert.equal(b.score - a.score, PICKUP_SCORE);
    assert.equal(b.orbs[0].active, false);
    assert.ok(
      b.pops.some((p) => p.active),
      'a pop starts',
    );
  });

  test('distance scores one point per 10 px', () => {
    const end = run(world({ immortal: true }), 5);
    assert.equal(end.score, Math.floor(end.distance / 10) + PICKUP_SCORE * end.collected);
  });

  test('ducking halves the hitbox height', () => {
    const w = world();
    const stand = benjoBox(w);
    const ducked = benjoBox({ ...w, ducking: true });
    assert.equal(ducked.top - ducked.bottom, (stand.top - stand.bottom) / 2);
    assert.equal(ducked.bottom, stand.bottom);
  });

  test('a flyer hits a standing Benjo and misses a ducking one', () => {
    const make = (duckHeld) => {
      const w = world();
      w.time = 1;
      placeObstacle(w, { kind: KIND_FLYER, x: w.benjoX - 10, y: 28, w: 40, h: 30 });
      return stepWorld(w, { ...idle(), duckHeld }, DT).dead;
    };
    assert.equal(make(false), true);
    assert.equal(make(true), false);
  });
});

describe('purity and buffers', () => {
  test('stepWorld leaves its input untouched', () => {
    const w = run(world({ immortal: true }), 8);
    const before = JSON.stringify(w);
    stepWorld(w, { ...idle(), jumpPressed: true, jumpHeld: true }, DT);
    assert.equal(JSON.stringify(w), before);
  });

  test('with a spare world it writes in place and keeps its pools', () => {
    const w = world({ immortal: true });
    const spare = cloneWorld(w);
    const pools = [spare.obstacles, spare.orbs, spare.pops, spare.obstacles[0]];
    const out = stepWorld(w, idle(), DT, spare);
    assert.equal(out, spare);
    assert.deepEqual([out.obstacles, out.orbs, out.pops, out.obstacles[0]], pools);
    assert.notEqual(out.obstacles, w.obstacles);
    assert.deepEqual(
      JSON.stringify(out),
      JSON.stringify(stepWorld(createWorld(SIZE, seeded(1), { immortal: true }), idle(), DT)),
    );
  });
});
