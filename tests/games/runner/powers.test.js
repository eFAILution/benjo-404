import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import runner from '../../../src/games/runner/index.js';
import { GRACE_T, GROUND_FRAC } from '../../../src/games/runner/tuning.js';
import { createWorld, stepWorld } from '../../../src/games/runner/world.js';
import { DT, fakeHost, idle, seeded } from './fake-host.js';

/** Step like the host loop until `seconds` pass or the run ends again. */
function play(host, game, seconds) {
  const ends = host.log.ends.length;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps && host.log.ends.length === ends; i++) {
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
}

/** Steps until the run ends, or -1. */
function stepsToEnd(host, game, limit = 60) {
  for (let i = 0; i < limit / DT; i++) {
    game.update(DT);
    host.input.tick();
    if (host.log.ends.length) return i;
  }
  return -1;
}

/** A host power port with `charges` Digital Twins and the given timed powers on. */
function powerPort(charges = 0, on = []) {
  const port = {
    calls: 0,
    active: (id) => on.includes(id),
    absorb: () => {
      port.calls += 1;
      if (charges <= 0) return false;
      charges -= 1;
      return true;
    },
  };
  return port;
}

const onScreen = (w) => w.obstacles.filter((o) => o.active && o.x < w.width);

test('the module lists every game-assisted power', () => {
  assert.deepEqual(runner.powers, ['twin', 'rollback', 'gc', 'magnet']);
});

describe('digital twin', () => {
  test('absorbs a lethal hit once, then the next hit ends the run', () => {
    const plain = fakeHost({ random: seeded(3) });
    const baseline = runner.create(plain);
    baseline.start();
    const dieAt = stepsToEnd(plain, baseline);
    assert.ok(dieAt > 0, 'an idle run dies');

    const power = powerPort(1);
    const host = fakeHost({ random: seeded(3), power });
    const game = runner.create(host);
    game.start();
    const endAt = stepsToEnd(host, game);
    assert.ok(endAt > dieAt, `survived past step ${dieAt}, ended at ${endAt}`);
    assert.equal(power.calls, 2, 'asked once per lethal hit');
    assert.equal(host.log.ends.length, 1);
  });

  test('gives about a second of grace in which hazards pass through', () => {
    const w0 = createWorld({ width: 960, height: 540 }, seeded(3));
    let charges = 1;
    const powers = { absorb: () => charges-- > 0 };
    let w = w0;
    while (w.graceT === 0 && !w.dead) w = stepWorld(w, idle(), DT, undefined, powers);
    assert.equal(w.dead, false);
    assert.ok(Math.abs(w.graceT - GRACE_T) < DT);
    const graceSteps = Math.round(GRACE_T / DT) - 1;
    for (let i = 0; i < graceSteps; i++) w = stepWorld(w, idle(), DT, undefined, powers);
    assert.equal(w.dead, false, 'no death while the grace runs');
  });

  test('stays deterministic for a seed', () => {
    const scores = [1, 2].map(() => {
      const host = fakeHost({ random: seeded(5), power: powerPort(2) });
      const game = runner.create(host);
      game.start();
      stepsToEnd(host, game);
      return host.log.ends[0].score;
    });
    assert.equal(scores[0], scores[1]);
  });
});

describe('magnet', () => {
  /** A world with one pickup high above Benjo and no spawns or deaths to get in the way. */
  function lonelyOrb() {
    const w = createWorld({ width: 960, height: 540 }, seeded(1), { immortal: true });
    w.pickupT = 99;
    Object.assign(w.orbs[0], { active: true, sprite: 0, x: w.benjoX + 120, y: 160, size: 18 });
    return w;
  }

  test('pulls a pickup Benjo cannot reach into him', () => {
    let pulled = lonelyOrb();
    let left = lonelyOrb();
    for (let i = 0; i < 30; i++) {
      pulled = stepWorld(pulled, idle(), DT, undefined, { magnet: true });
      left = stepWorld(left, idle(), DT);
    }
    assert.equal(pulled.collected, 1);
    assert.equal(left.collected, 0);
  });

  test('the instance polls the host magnet each update', () => {
    const host = fakeHost({ power: powerPort(0, ['magnet']) });
    const game = runner.create(host);
    game.start();
    play(host, game, 0.5);
    const snap = game.snapshot();
    snap.world.pickupT = 99;
    snap.world.orbs[0] = { active: true, sprite: 0, x: snap.world.benjoX + 120, y: 160, size: 18 };
    game.restore(snap);
    const before = snap.world.collected;
    play(host, game, 0.5);
    assert.equal(game.snapshot().world.collected, before + 1);
  });
});

describe('garbage collector', () => {
  test('clears every hazard on screen and returns the count', () => {
    const host = fakeHost();
    const game = runner.create(host);
    assert.equal(game.collect(), 0, 'nothing before start');
    game.start();
    while (onScreen(game.snapshot().world).length === 0) play(host, game, DT);
    const count = onScreen(game.snapshot().world).length;
    assert.equal(game.collect(), count);
    assert.equal(onScreen(game.snapshot().world).length, 0);
    assert.ok(
      game.snapshot().world.pops.some((p) => p.active),
      'leaves a pop where each was',
    );
    assert.equal(game.collect(), 0);
    play(host, game, 0.5);
    game.render(0.5);
  });
});

describe('rollback', () => {
  test('restore puts the run back after a death and it plays on', () => {
    const host = fakeHost({ random: seeded(3) });
    const game = runner.create(host);
    game.start();
    play(host, game, 1.5);
    const snap = game.snapshot();
    const saved = structuredClone(snap);
    play(host, game, 60);
    assert.equal(host.log.ends.length, 1, 'the run ended');

    game.restore(snap);
    assert.deepEqual(game.snapshot(), saved);
    assert.equal(host.log.scores.at(-1), saved.world.score, 'HUD score re-synced');
    play(host, game, 0.5);
    assert.equal(host.log.ends.length, 1, 'playing on, not ended');
    assert.ok(game.snapshot().world.time > saved.world.time + 0.4);
  });

  test('a snapshot is not changed by later updates', () => {
    const host = fakeHost();
    const game = runner.create(host);
    assert.equal(game.snapshot(), null);
    game.start();
    play(host, game, 1);
    const snap = game.snapshot();
    const saved = structuredClone(snap);
    play(host, game, 2);
    game.collect();
    assert.deepEqual(snap, saved);
  });
});

describe('track', () => {
  test('reports Benjo once per update, at his middle above the ground', () => {
    const points = [];
    const host = fakeHost({ track: (x, y) => points.push([x, y]) });
    const game = runner.create(host);
    game.start();
    play(host, game, 1);
    assert.equal(points.length, 60);
    const groundY = Math.round(540 * GROUND_FRAC);
    for (const [x, y] of points) {
      assert.equal(x, Math.round(960 * 0.18));
      assert.ok(y > 0 && y < groundY, `y ${y}`);
    }
  });
});
