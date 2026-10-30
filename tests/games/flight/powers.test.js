import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import flight from '../../../src/games/flight/index.js';
import { GRACE_T, START_GRACE, TOWER_W } from '../../../src/games/flight/tuning.js';
import { createWorld, stepWorld } from '../../../src/games/flight/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };

/** Step like the host loop until `seconds` pass or the run ends again; flap every `every` s. */
function play(host, game, seconds, every = 0) {
  const ends = host.log.ends.length;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps && host.log.ends.length === ends; i++) {
    if (every && i % Math.round(every / DT) === 0) host.input.pressed.add('primary');
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
}

/** Start a run and take off with one flap. */
function launch(host) {
  const game = flight.create(host);
  game.start();
  play(host, game, START_GRACE + 0.05);
  host.input.pressed.add('primary');
  game.update(DT);
  host.input.tick();
  return game;
}

/** Steps until the run ends, or -1. */
function stepsToEnd(host, game, limit = 30) {
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

/** A flying world, past the hover, with no towers or pickups spawning. */
function flying() {
  const w = createWorld(SIZE, seeded(1));
  while (w.time <= START_GRACE) stepWorld(w, false, DT);
  stepWorld(w, true, DT);
  w.nextTowerX = Number.POSITIVE_INFINITY;
  return w;
}

test('the module lists every game-assisted power', () => {
  assert.deepEqual(flight.powers, ['twin', 'rollback', 'magnet']);
});

describe('digital twin', () => {
  test('absorbs a fall to the ground once with a bounce, then the next fall ends the run', () => {
    const plain = fakeHost();
    const dieAt = stepsToEnd(plain, launch(plain));
    assert.ok(dieAt > 0, 'a run with one flap falls and ends');

    const power = powerPort(1);
    const host = fakeHost({ power });
    const endAt = stepsToEnd(host, launch(host));
    assert.ok(endAt > dieAt + 30, `survived past step ${dieAt}, ended at ${endAt}`);
    assert.equal(power.calls, 2, 'asked once per lethal hit');
    assert.equal(host.log.ends.length, 1);
    assert.equal(host.log.ends[0].reason, 'Benjo touched down too soon.');
  });

  test('lets a tower pass through for about a second', () => {
    const w = flying();
    const towerW = TOWER_W * w.unit;
    Object.assign(w.towers[0], {
      active: true,
      x: w.scroll + w.benjoX - towerW / 2,
      gapY: w.ceiling,
      gap: 10,
      sprite: 0,
      passed: false,
    });
    let charges = 1;
    const powers = { absorb: () => charges-- > 0 };
    stepWorld(w, false, DT, powers);
    assert.equal(w.dead, false);
    assert.ok(Math.abs(w.graceT - GRACE_T) < DT);
    for (let i = 0; i < Math.round(GRACE_T / DT) - 1; i++) stepWorld(w, i % 20 === 0, DT, powers);
    assert.equal(w.dead, false, 'no death while the grace runs');
  });

  test('stays deterministic for a seed', () => {
    const scores = [1, 2].map(() => {
      const host = fakeHost({ random: seeded(5), power: powerPort(2) });
      const game = launch(host);
      play(host, game, 30, 0.42);
      assert.equal(host.log.ends.length, 1, 'blind flaps end the run');
      return host.log.ends[0].score;
    });
    assert.equal(scores[0], scores[1]);
  });
});

describe('magnet', () => {
  /** A flying world with one pickup ahead of Benjo and above him. */
  function lonelyOrb() {
    const w = flying();
    Object.assign(w.orbs[0], { active: true, x: w.scroll + w.benjoX + 150, y: w.by - 100 });
    return w;
  }

  test('pulls a pickup in before Benjo gets there', () => {
    const pulled = lonelyOrb();
    const left = lonelyOrb();
    for (let i = 0; i < 30; i++) {
      stepWorld(pulled, false, DT, { magnet: true });
      stepWorld(left, false, DT);
    }
    assert.equal(pulled.collected, 1);
    assert.equal(left.collected, 0);
    assert.equal(left.orbs[0].active, true);
  });

  test('the instance polls the host magnet each update', () => {
    const host = fakeHost({ power: powerPort(0, ['magnet']) });
    const game = launch(host);
    const snap = game.snapshot();
    snap.world.nextTowerX = Number.POSITIVE_INFINITY;
    snap.world.orbs[0] = {
      active: true,
      x: snap.world.scroll + snap.world.benjoX + 150,
      y: snap.world.by - 100,
      sprite: 0,
    };
    game.restore(snap);
    play(host, game, 0.5);
    assert.equal(game.snapshot().world.collected, 1);
  });
});

describe('garbage collector', () => {
  test('is not a power in this game (#90)', () => {
    assert.ok(!flight.powers.includes('gc'));
    assert.equal(flight.create(fakeHost()).collect, undefined, 'so the host never drops it');
  });
});

describe('rollback', () => {
  test('restore puts the run back after a death and it plays on', () => {
    const host = fakeHost();
    const game = launch(host);
    play(host, game, 1, 0.4);
    const snap = game.snapshot();
    const saved = structuredClone(snap);
    play(host, game, 30);
    assert.equal(host.log.ends.length, 1, 'the run ended');

    game.restore(snap);
    assert.deepEqual(game.snapshot(), saved);
    assert.equal(host.log.scores.at(-1), saved.world.score, 'HUD score re-synced');
    play(host, game, 0.3);
    assert.equal(host.log.ends.length, 1, 'playing on, not ended');
    assert.ok(game.snapshot().world.time > saved.world.time + 0.25);
  });

  test('a snapshot is not changed by later updates', () => {
    const host = fakeHost();
    const game = flight.create(host);
    assert.equal(game.snapshot(), null);
    game.start();
    play(host, game, 0.5);
    const snap = game.snapshot();
    const saved = structuredClone(snap);
    host.input.pressed.add('primary');
    play(host, game, 2, 0.4);
    assert.deepEqual(snap, saved);
  });
});

describe('track', () => {
  test('reports Benjo once per update, hover included', () => {
    const points = [];
    const host = fakeHost({ track: (x, y) => points.push([x, y]) });
    const game = flight.create(host);
    game.start();
    play(host, game, 1, 0.4);
    assert.equal(points.length, 60);
    for (const [x, y] of points) {
      assert.equal(x, 288);
      assert.ok(y > 0 && y < 540, `y ${y}`);
    }
  });
});
