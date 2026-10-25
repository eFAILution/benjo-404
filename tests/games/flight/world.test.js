import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  EVENT_FLAP,
  EVENT_PICKUP,
  EVENT_SCORE,
  GAP_MIN,
  GAP_SHIFT,
  GAP_START,
  PICKUP_SCORE,
  SPEED_CAP,
  SPEED_CAP_REDUCED,
  START_GRACE,
  TOWER_W,
} from '../../../src/games/flight/tuning.js';
import {
  createWorld,
  gapFor,
  resizeWorld,
  speedFor,
  stepWorld,
} from '../../../src/games/flight/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };

/** Step `seconds` of world time, flapping when `flap(w)` says so. */
function run(w, seconds, flap = () => false) {
  for (let i = 0; i < Math.round(seconds / DT) && !w.dead; i++) stepWorld(w, flap(w), DT);
  return w;
}

/** A world that has had its first flap, so towers are coming. */
function flying(size = SIZE, seed = 1, options = {}) {
  const w = run(createWorld(size, seeded(seed), options), START_GRACE + DT);
  stepWorld(w, true, DT);
  return w;
}

/** Put one tower so its gap is centered on Benjo and its left edge at screen x. */
function placeTower(w, screenX, gapY = w.by, gap = gapFor(w)) {
  for (const t of w.towers) t.active = false;
  const [t] = w.towers;
  Object.assign(t, { active: true, x: w.scroll + screenX, gapY, gap, passed: false });
  w.nextTowerX = Number.POSITIVE_INFINITY;
  return t;
}

describe('ready state', () => {
  test('Benjo hovers, nothing scrolls, and nothing spawns until the first flap', () => {
    const w = run(createWorld(SIZE, seeded(1)), 10);
    assert.equal(w.ready, true);
    assert.equal(w.dead, false);
    assert.equal(w.scroll, 0);
    assert.equal(
      w.towers.some((t) => t.active),
      false,
    );
  });

  test('a flap inside the start grace is the press that started the run', () => {
    const w = createWorld(SIZE, seeded(1));
    stepWorld(w, true, DT);
    assert.equal(w.ready, true);
    assert.equal(w.events & EVENT_FLAP, 0);
  });

  test('reduced motion holds Benjo still while ready', () => {
    const w = createWorld(SIZE, seeded(1), { reducedMotion: true });
    const start = w.by;
    run(w, 2);
    assert.equal(w.by, start);
  });
});

describe('flight', () => {
  test('a flap sends Benjo up and raises the flap event', () => {
    const w = flying();
    assert.equal(w.ready, false);
    assert.ok(w.vy < 0);
    assert.ok(w.events & EVENT_FLAP);
  });

  test('with no more flaps Benjo falls and the ground ends the run', () => {
    const w = run(flying(), 10);
    assert.equal(w.dead, true);
    assert.equal(w.hit, 'ground');
    assert.equal(w.by + w.hitR, w.groundY);
  });

  test('the ceiling stops Benjo without ending the run', () => {
    const w = flying();
    for (const t of w.towers) t.active = false;
    w.nextTowerX = Number.POSITIVE_INFINITY;
    run(w, 1.5, () => true);
    assert.equal(w.dead, false);
    assert.equal(w.by, w.ceiling + w.hitR, 'Benjo stops below the HUD strip');
  });

  test('a tower edge ends the run with a tower hit', () => {
    const w = flying();
    placeTower(w, w.benjoX + 2, w.by + 400);
    stepWorld(w, false, DT);
    assert.equal(w.dead, true);
    assert.equal(w.hit, 'tower');
  });

  test('flying through the gap scores one point, once', () => {
    const w = flying();
    const tower = placeTower(w, w.benjoX - TOWER_W * w.unit - w.hitR + 1);
    w.vy = 0;
    stepWorld(w, false, DT);
    assert.equal(w.dead, false);
    assert.equal(w.score, 1);
    assert.ok(w.events & EVENT_SCORE);
    assert.equal(tower.passed, true);
    stepWorld(w, false, DT);
    assert.equal(w.score, 1);
  });

  test('a pickup adds its score and pops', () => {
    const w = flying();
    for (const t of w.towers) t.active = false;
    w.nextTowerX = Number.POSITIVE_INFINITY;
    Object.assign(w.orbs[0], { active: true, x: w.scroll + w.benjoX, y: w.by, sprite: 0 });
    stepWorld(w, false, DT);
    assert.equal(w.score, PICKUP_SCORE);
    assert.equal(w.collected, 1);
    assert.ok(w.events & EVENT_PICKUP);
    assert.ok(w.pops.some((p) => p.active));
  });
});

describe('towers', () => {
  test('spawn off screen to the right, inside the play area, never jumping too far', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const w = flying(SIZE, seed);
      let last = null;
      const seen = new Set();
      run(w, 20, (world) => world.by > world.groundY * 0.5 && world.vy >= 0);
      for (const t of w.towers) if (t.active) seen.add(t);
      for (const t of [...seen].sort((a, b) => a.x - b.x)) {
        assert.ok(t.gapY - t.gap / 2 >= w.ceiling, 'gap top below the HUD strip');
        assert.ok(t.gapY + t.gap / 2 <= w.groundY, 'gap bottom above ground');
        if (last) assert.ok(Math.abs(t.gapY - last.gapY) <= GAP_SHIFT * w.unit + 1e-9);
        last = t;
      }
    }
  });

  test('the first tower spawns past the right edge', () => {
    const w = flying();
    stepWorld(w, false, DT);
    const first = w.towers.find((t) => t.active);
    assert.ok(first);
    assert.ok(first.x - w.scroll >= w.width);
  });

  test('the pool covers a very wide screen', () => {
    const w = flying({ width: 3840, height: 400 });
    run(w, 3, (world) => world.by > world.groundY * 0.5 && world.vy >= 0);
    const { towers } = w;
    assert.equal(towers.length, 10);
    assert.ok(w.spacing * (towers.length - 1) > w.width + TOWER_W * w.unit);
  });
});

describe('difficulty', () => {
  test('the gap narrows with score and stops at the minimum', () => {
    const w = createWorld(SIZE, seeded(1));
    assert.equal(gapFor(w), GAP_START * w.unit);
    w.score = 1000;
    assert.equal(gapFor(w), GAP_MIN * w.unit);
  });

  test('speed grows with score up to the cap, lower with reduced motion', () => {
    const w = createWorld(SIZE, seeded(1));
    w.score = 1000;
    assert.equal(speedFor(w), SPEED_CAP * w.unit);
    w.reducedMotion = true;
    assert.equal(speedFor(w), SPEED_CAP_REDUCED * w.unit);
  });
});

describe('resize', () => {
  test('keeps Benjo inside the new play area and towers on their gaps', () => {
    const w = flying();
    run(w, 2, (world) => world.by > world.groundY * 0.5 && world.vy >= 0);
    resizeWorld(w, { width: 375, height: 667 });
    assert.equal(w.width, 375);
    assert.equal(w.ceiling, 96, 'the HUD strip is taller on narrow screens');
    assert.ok(w.by >= w.ceiling + w.hitR && w.by <= w.groundY - w.hitR);
    for (const t of w.towers) if (t.active) assert.ok(t.gapY < w.groundY);
  });

  test('a tiny canvas is treated as the minimum size', () => {
    const w = createWorld({ width: 0, height: 0 }, seeded(1));
    assert.ok(w.width > 0 && w.height > 0);
    run(w, 1);
  });
});
