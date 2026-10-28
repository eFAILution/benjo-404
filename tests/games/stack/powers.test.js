import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import stack from '../../../src/games/stack/index.js';
import { START_GRACE, TWIN_GRACE } from '../../../src/games/stack/tuning.js';
import { createWorld, stepWorld, topBlock } from '../../../src/games/stack/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

/** Run the instance like the host loop: update then render, rolling input each tick. */
function play(host, game, seconds, beforeTick = () => {}) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps && host.log.ends.length === 0; i++) {
    beforeTick(i * DT, host.input);
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
}

/** A power port with `twins` Digital Twins in hand. Counts every absorb() call. */
function powerPort(twins = 0) {
  const port = {
    twins,
    calls: 0,
    active: () => false,
    absorb() {
      port.calls += 1;
      if (port.twins <= 0) return false;
      port.twins -= 1;
      return true;
    },
  };
  return port;
}

/** A world past the start grace with the mover at its far edge, so a drop now misses. */
function edgeWorld() {
  const w = createWorld({ width: 960, height: 540 }, seeded(1));
  while (w.time <= START_GRACE) stepWorld(w, false, DT);
  return w;
}

/** Drops when the twin world says the block sits on the stack, so every drop is a perfect. */
function perfectPilot(host) {
  const twin = createWorld(host.size, seeded(1), { reducedMotion: host.reducedMotion });
  return (_t, input) => {
    const drop = twin.time + DT > START_GRACE && Math.abs(twin.x - topBlock(twin).x) <= 3;
    if (drop) input.pressed.add('primary');
    stepWorld(twin, drop, DT);
  };
}

describe('module', () => {
  test('lists the twin and rollback, and nothing it cannot back', () => {
    assert.deepEqual(stack.powers, ['twin', 'rollback']);
  });
});

describe('Digital Twin', () => {
  test('a miss with a twin lands square on the stack instead of ending', () => {
    const w = edgeWorld();
    const top = { ...topBlock(w) };
    let calls = 0;
    stepWorld(w, true, DT, {
      absorb: () => {
        calls += 1;
        return true;
      },
    });
    assert.equal(calls, 1);
    assert.equal(w.dead, false);
    assert.equal(w.score, 1);
    assert.equal(w.streak, 0, 'a save is not a perfect');
    assert.equal(topBlock(w).x, top.x);
    assert.equal(topBlock(w).w, top.w);
    assert.equal(w.grace, TWIN_GRACE);
  });

  test('during the grace the next block waits and drops are ignored', () => {
    const w = edgeWorld();
    stepWorld(w, true, DT, { absorb: () => true });
    const x = w.x;
    let calls = 0;
    const assist = {
      absorb: () => {
        calls += 1;
        return false;
      },
    };
    for (let t = 0; t < TWIN_GRACE - 2 * DT; t += DT) stepWorld(w, true, DT, assist);
    assert.equal(w.x, x, 'the mover held still');
    assert.equal(w.score, 1);
    assert.equal(calls, 0);
    for (let i = 0; i < 4; i++) stepWorld(w, false, DT, assist);
    assert.equal(w.grace, 0);
    assert.notEqual(w.x, x, 'the mover slides again after the grace');
  });

  test('a plain step and a twin that says no both still miss', () => {
    const plain = edgeWorld();
    stepWorld(plain, true, DT);
    assert.equal(plain.dead, true);
    const refused = edgeWorld();
    stepWorld(refused, true, DT, { absorb: () => false });
    assert.equal(refused.dead, true);
    assert.equal(refused.hit, 'miss');
  });

  test('a landing that overlaps never spends the twin', () => {
    const w = createWorld({ width: 960, height: 540 }, seeded(1));
    let calls = 0;
    const assist = {
      absorb: () => {
        calls += 1;
        return true;
      },
    };
    for (let i = 0; i < 600 && w.score < 3; i++) {
      const drop = w.time + DT > START_GRACE && Math.abs(w.x - topBlock(w).x) <= 3;
      stepWorld(w, drop, DT, assist);
    }
    assert.equal(w.score, 3);
    assert.equal(calls, 0);
  });

  test('the instance forgives one miss, then the next miss ends the run', () => {
    const port = powerPort(1);
    const host = fakeHost({ power: port });
    const game = stack.create(host);
    game.start();
    play(host, game, 0.2);
    host.input.pressed.add('primary');
    play(host, game, 2);
    assert.equal(host.log.ends.length, 0, 'the twin took the miss');
    assert.equal(host.log.scores.at(-1), 1);
    assert.equal(port.twins, 0);
    host.input.pressed.add('primary');
    play(host, game, 0.5);
    for (let i = 0; i < 400 && host.log.ends.length === 0; i++) {
      if (i % 37 === 0) host.input.pressed.add('primary');
      play(host, game, DT);
    }
    assert.equal(host.log.ends.length, 1);
    assert.ok(port.calls >= 2);
  });
});

describe('track', () => {
  test('reports Benjo on the canvas once per update', () => {
    const points = [];
    const host = fakeHost({ track: (x, y) => points.push({ x, y }) });
    const game = stack.create(host);
    game.start();
    play(host, game, 1);
    assert.equal(points.length, 60);
    for (const { x, y } of points) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      assert.ok(x >= 0 && x <= host.size.width, `x ${x}`);
      assert.ok(y >= 0 && y <= host.size.height, `y ${y}`);
    }
    assert.notEqual(points[0].x, points.at(-1).x, 'Benjo follows the sliding block');
  });

  test('a host without track or power still plays', () => {
    const host = fakeHost();
    const game = stack.create(host);
    game.start();
    play(host, game, 1);
    assert.equal(host.log.ends.length, 0);
  });
});

describe('Rollback', () => {
  test('snapshot before start is null and restore(null) does nothing', () => {
    const game = stack.create(fakeHost());
    assert.equal(game.snapshot(), null);
    game.restore(null);
  });

  test('a snapshot is not changed by later updates', () => {
    const host = fakeHost();
    const game = stack.create(host);
    game.start();
    play(host, game, 1);
    const snap = game.snapshot();
    const copy = structuredClone(snap);
    play(host, game, 2, perfectPilot(host));
    assert.deepEqual(snap, copy);
  });

  test('restore after a topple puts the stack back and the run plays on', () => {
    const host = fakeHost();
    const game = stack.create(host);
    game.start();
    const pilot = perfectPilot(host);
    play(host, game, 8, pilot);
    const height = host.log.scores.at(-1);
    assert.ok(height >= 2, `stacked ${height}`);
    const snap = game.snapshot();
    const copy = structuredClone(snap);
    // Mash until a drop misses and the run ends.
    for (let i = 0; i < 2000 && host.log.ends.length === 0; i++) {
      if (i % 11 === 0) host.input.pressed.add('primary');
      play(host, game, DT);
    }
    assert.equal(host.log.ends.length, 1);
    game.restore(snap);
    assert.equal(host.log.scores.at(-1), height, 'the HUD score is back');
    assert.deepEqual(game.snapshot(), copy, 'the world is back where it was');
    host.log.ends.length = 0;
    play(host, game, 3);
    assert.equal(host.log.ends.length, 0, 'the restored run plays on');
    // The snapshot survives the restore, so a second rollback to it works too.
    assert.deepEqual(snap, copy);
    host.input.pressed.add('primary');
    play(host, game, 2);
    game.restore(snap);
    assert.deepEqual(game.snapshot(), copy);
  });
});
