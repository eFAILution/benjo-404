import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import crossing from '../../../src/games/crossing/index.js';
import { blockAt, isCut } from '../../../src/games/crossing/lanes.js';
import { GRACE_T, LIVES } from '../../../src/games/crossing/tuning.js';
import { createWorld, screenX, screenY, stepWorld } from '../../../src/games/crossing/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const still = { hop: null };

/** Step like the host loop until `seconds` pass or the run ends again; hop up every `every` s. */
function play(host, game, seconds, every = 0) {
  const ends = host.log.ends.length;
  const steps = Math.round(seconds / DT);
  for (let i = 1; i <= steps && host.log.ends.length === ends; i++) {
    if (every && i % Math.round(every / DT) === 0) host.input.pressed.add('up');
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
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

/** Put Benjo on lane 1 inside a block that stands still. Works on a world or a snapshot's. */
function inBlock(w) {
  Object.assign(w, { row: 1, fromRow: 1, col: 2, fromCol: 2, hopT: 0, bx: 2.5, by: 1.5 });
  Object.assign(w.lanes[0], { speed: 0, offset: 2.5 - w.lanes[0].len / 2 });
  return w;
}

/** How many blocks still there overlap the band, checking each block near it one by one. */
function visibleBlocks(w) {
  let count = 0;
  for (const lane of w.lanes) {
    const near = Math.floor(-lane.offset / lane.period);
    for (let k = near - 2; k <= near + w.cols + 2; k++) {
      const start = lane.offset + k * lane.period;
      if (start < w.cols && start + lane.len > 0 && !isCut(lane, k)) count += 1;
    }
  }
  return count;
}

/** True when sampling the band finds a block cell anywhere. */
const anyBlock = (w) =>
  w.lanes.some((lane) => {
    for (let x = 0; x < w.cols; x += 0.05) if (blockAt(lane, x)) return true;
    return false;
  });

test('the module lists every game-assisted power', () => {
  assert.deepEqual(crossing.powers, ['twin', 'rollback', 'gc', 'magnet']);
});

describe('digital twin', () => {
  test('takes one block hit, gives a second of grace, then the next hit costs a life', () => {
    const w = inBlock(createWorld(SIZE, seeded(1)));
    let charges = 1;
    let calls = 0;
    const powers = {
      absorb: () => {
        calls += 1;
        return charges-- > 0;
      },
    };
    stepWorld(w, still, DT, powers);
    assert.equal(w.lives, LIVES);
    assert.ok(Math.abs(w.graceT - GRACE_T) < DT);
    for (let i = 0; i < Math.round(GRACE_T / DT) - 1; i++) stepWorld(w, still, DT, powers);
    assert.equal(w.lives, LIVES, 'blocks pass through while the grace runs');
    assert.equal(calls, 1);
    for (let i = 0; i < 3 && w.hitT === 0; i++) stepWorld(w, still, DT, powers);
    assert.equal(w.lives, LIVES - 1, 'the block still there hits once the grace ends');
    assert.equal(calls, 2);
  });

  test('the instance asks the host and keeps the life', () => {
    const power = powerPort(1);
    const host = fakeHost({ power });
    const game = crossing.create(host);
    game.start();
    play(host, game, 0.2);
    const snap = game.snapshot();
    inBlock(snap.world);
    game.restore(snap);
    play(host, game, 0.1);
    assert.equal(power.calls, 1);
    assert.equal(game.snapshot().world.lives, LIVES);
    assert.ok(!host.log.statuses.some((s) => s.startsWith('LIVES LEFT')));
  });

  test('stays deterministic for a seed', () => {
    const scores = [1, 2].map(() => {
      const host = fakeHost({ random: seeded(5), power: powerPort(2) });
      const game = crossing.create(host);
      game.start();
      play(host, game, 120, 0.35);
      assert.equal(host.log.ends.length, 1, 'blind hops end the run');
      return host.log.ends[0].score;
    });
    assert.equal(scores[0], scores[1]);
  });
});

describe('magnet', () => {
  /** Benjo on the start curb; orbs on lanes 1 and 2, far from his column, lanes standing still. */
  function farOrbs() {
    const w = createWorld(SIZE, seeded(1));
    for (const lane of w.lanes.slice(0, 2)) {
      Object.assign(lane, { speed: 0, offset: 0, orbAt: lane.len, orbTaken: false });
    }
    return w;
  }

  test('slides an orb on the next lane to Benjo and he takes it', () => {
    const pulled = farOrbs();
    const left = farOrbs();
    const before = pulled.lanes[1].orbAt;
    for (let i = 0; i < 60; i++) {
      stepWorld(pulled, still, DT, { magnet: true });
      stepWorld(left, still, DT);
    }
    assert.equal(pulled.orbs, 1);
    assert.equal(pulled.lanes[0].orbTaken, true);
    assert.equal(pulled.lanes[1].orbAt, before, 'two lanes away is out of reach');
    assert.equal(left.orbs, 0);
  });

  test('the instance polls the host magnet each update', () => {
    const host = fakeHost({ power: powerPort(0, ['magnet']) });
    const game = crossing.create(host);
    game.start();
    const snap = game.snapshot();
    Object.assign(snap.world.lanes[0], { speed: 0, offset: 0, orbAt: snap.world.lanes[0].len });
    snap.world.lanes[0].orbTaken = false;
    game.restore(snap);
    play(host, game, 1);
    assert.equal(game.snapshot().world.orbs, 1);
  });
});

describe('garbage collector', () => {
  test('clears every block on the band and returns the count; new ones roll in', () => {
    const host = fakeHost();
    const game = crossing.create(host);
    assert.equal(game.collect(), 0, 'nothing before start');
    game.start();
    play(host, game, 0.5);
    const count = visibleBlocks(game.snapshot().world);
    assert.ok(count > 0);
    assert.equal(game.collect(), count);
    assert.equal(visibleBlocks(game.snapshot().world), 0);
    assert.equal(anyBlock(game.snapshot().world), false, 'no block cell left on the band');
    assert.equal(game.collect(), 0, 'nothing left to clear');
    play(host, game, 3);
    game.render(0.5);
    assert.ok(anyBlock(game.snapshot().world), 'the trains refill from the edges');
  });
});

describe('rollback', () => {
  test('restore puts the run back after a death and it plays on', () => {
    const host = fakeHost({ random: seeded(3) });
    const game = crossing.create(host);
    game.start();
    play(host, game, 0.5, 0.35);
    const snap = game.snapshot();
    const saved = structuredClone(snap);
    play(host, game, 120, 0.35);
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
    const game = crossing.create(host);
    assert.equal(game.snapshot(), null);
    game.start();
    play(host, game, 0.5);
    const snap = game.snapshot();
    const saved = structuredClone(snap);
    play(host, game, 2, 0.35);
    game.collect();
    assert.deepEqual(snap, saved);
  });
});

describe('track', () => {
  test('reports Benjo once per update, on his cell', () => {
    const points = [];
    const host = fakeHost({ track: (x, y) => points.push([x, y]) });
    const game = crossing.create(host);
    game.start();
    const w = game.snapshot().world;
    play(host, game, 1);
    assert.equal(points.length, 60);
    assert.deepEqual(points[0], [screenX(w, w.bx), screenY(w, w.by)]);
  });
});
