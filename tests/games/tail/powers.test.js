import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import tail from '../../../src/games/tail/index.js';
import { DOWN, GRACE_T, LEFT, MAGNET_STEPS, RIGHT, UP } from '../../../src/games/tail/tuning.js';
import {
  centerX,
  centerY,
  createWorld,
  pullFood,
  stepWorld,
} from '../../../src/games/tail/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';
import { plainCtx, play, press } from './pilots.js';

const SMALL = { width: 320, height: 240 };

/** A host with a power port that holds `twins` Digital Twins, and a log of every track call. */
function powerHost({ twins = 0, magnet = false, seed = 7 } = {}) {
  const host = fakeHost({ ctx: plainCtx(), random: seeded(seed) });
  const log = { absorbs: 0, tracks: [], cues: [] };
  let left = twins;
  host.power = {
    active: (id) => id === 'magnet' && magnet,
    absorb() {
      log.absorbs += 1;
      if (left <= 0) return false;
      left -= 1;
      return true;
    },
  };
  host.track = (x, y) => log.tracks.push([x, y]);
  host.audio = { play: (cue) => log.cues.push(cue) };
  return { host, log };
}

/** Press `dir` once, on the first tick after the start grace. */
const turnOnce = (dir) => (t, input) => {
  if (Math.round(t / DT) === 15) press(input, dir);
};

/** A world already moving right, with an aid that counts absorb calls. */
function movingWorld(twin, size = SMALL) {
  const w = createWorld(size, seeded(1));
  w.ready = false;
  const aid = {
    magnet: false,
    calls: 0,
    absorb() {
      aid.calls += 1;
      return twin;
    },
  };
  return { w, aid };
}

/** Step until absorb has been asked `calls` times, the run ends, or `limit` seconds pass. */
function stepUntilHit(w, aid, calls = 1, limit = 10) {
  for (let i = 0; i < limit / DT && aid.calls < calls && !w.dead; i++) stepWorld(w, -1, DT, aid);
}

describe('module', () => {
  test('lists the twin, rollback, and the magnet, and no garbage collector', () => {
    assert.deepEqual(tail.powers, ['twin', 'rollback', 'magnet']);
    assert.equal(typeof tail.create(fakeHost()).collect, 'undefined');
  });
});

describe('digital twin', () => {
  test('a wall hit with a twin up turns Benjo along the wall instead of ending the run', () => {
    const { w, aid } = movingWorld(true);
    stepUntilHit(w, aid);
    assert.equal(aid.calls, 1);
    assert.equal(w.dead, false);
    assert.equal(w.graceT, GRACE_T);
    assert.equal(w.xs[w.head], w.cols - 1, 'stopped at the wall');
    // Rows 0 to 4 are above Benjo and 6 to 9 below, so the longer run is up.
    assert.equal(w.dir, UP);
    const row = w.ys[w.head];
    stepWorld(w, -1, DT, aid);
    assert.equal(w.ys[w.head], row - 1, 'slides up the wall on the next step');
    assert.equal(w.xs[w.head], w.cols - 1);
  });

  test('the same hit with no twin ends the run as before', () => {
    const { w, aid } = movingWorld(false);
    stepUntilHit(w, aid);
    assert.equal(aid.calls, 1);
    assert.equal(w.dead, true);
    assert.equal(w.hit, 'wall');
  });

  test('a second hit inside the grace turns Benjo again without spending another twin', () => {
    const { w, aid } = movingWorld(true);
    stepUntilHit(w, aid);
    for (let t = 0; t < GRACE_T - 2 * DT; t += DT) stepWorld(w, -1, DT, aid);
    assert.equal(aid.calls, 1);
    assert.equal(w.dead, false);
    assert.equal(w.ys[w.head], 0, 'reached the corner');
    assert.equal(w.dir, LEFT, 'turned away from the corner');
  });

  test('the grace runs out after a second', () => {
    const { w, aid } = movingWorld(true);
    stepUntilHit(w, aid);
    for (let t = 0; t < GRACE_T + DT; t += DT) stepWorld(w, -1, DT, aid);
    assert.equal(w.graceT, 0);
  });

  test('the twin saves one hit in a real run, and the next unshielded hit ends it', () => {
    const plain = powerHost();
    const saved = powerHost({ twins: 1 });
    const ticks = [0, 0];
    [plain, saved].forEach(({ host }, k) => {
      const game = tail.create(host);
      game.start();
      play(host, game, 30, (t, input) => {
        ticks[k] += 1;
        turnOnce(DOWN)(t, input);
      });
    });
    assert.equal(plain.host.log.ends.length, 1);
    assert.equal(saved.host.log.ends.length, 1);
    assert.equal(plain.log.absorbs, 1, 'a host with no twin up is still asked');
    assert.equal(saved.log.absorbs, 2);
    assert.ok(ticks[1] * DT > ticks[0] * DT + GRACE_T, 'the saved run lasted past the grace');
  });
});

describe('magnet', () => {
  test('pullFood slides the page toward the cell Benjo enters next', () => {
    const w = createWorld(SMALL, seeded(1));
    w.foodX = 0;
    w.foodY = 0;
    const tx = w.xs[w.head] + 1;
    const ty = w.ys[w.head];
    const before = tx + ty;
    pullFood(w);
    assert.equal(Math.abs(tx - w.foodX) + Math.abs(ty - w.foodY), before - MAGNET_STEPS);
  });

  test('the page goes around Benjo, never onto him', () => {
    const w = createWorld(SMALL, seeded(1));
    const hx = w.xs[w.head];
    const hy = w.ys[w.head];
    w.dir = UP;
    w.foodX = hx - 1;
    w.foodY = hy + 1;
    pullFood(w);
    assert.equal(w.occupied[w.foodY * w.cols + w.foodX], 0);
    assert.deepEqual([w.foodX, w.foodY], [hx, hy + 1]);
  });

  test('with the magnet on, Benjo eats more pages on the same run', () => {
    const scores = [false, true].map((magnet) => {
      const { host } = powerHost({ twins: 100, magnet, seed: 3 });
      const game = tail.create(host);
      game.start();
      play(host, game, 8, turnOnce(DOWN));
      return host.log.scores.at(-1);
    });
    assert.ok(scores[1] > scores[0], `magnet ${scores[1]} vs none ${scores[0]}`);
    assert.ok(scores[1] >= 3);
  });

  test('a host without the magnet leaves the page where it spawned', () => {
    const { host } = powerHost();
    const game = tail.create(host);
    game.start();
    const ref = createWorld(host.size, seeded(1));
    const page = game.snapshot().world;
    play(host, game, 0.5, turnOnce(DOWN));
    const now = game.snapshot().world;
    assert.equal(now.foodIndex, 1, 'not eaten');
    assert.deepEqual([now.foodX, now.foodY], [page.foodX, page.foodY]);
    assert.equal(now.cols, ref.cols);
  });
});

describe('rollback', () => {
  test('restore after a death brings the snapshot back and the run plays on', () => {
    const { host, log } = powerHost();
    const game = tail.create(host);
    game.start();
    play(host, game, 0.5, turnOnce(DOWN));
    const snap = game.snapshot();
    const frozen = structuredClone(snap);
    play(host, game, 10);
    assert.equal(host.log.ends.length, 1, 'ran into the bottom wall');
    assert.deepEqual(snap, frozen, 'later updates never touched the snapshot');

    game.restore(snap);
    assert.deepEqual(game.snapshot(), frozen, 'the run is back where it was');
    assert.equal(host.log.scores.at(-1), frozen.world.score);

    host.log.ends.length = 0;
    const cues = log.cues.length;
    const tracks = log.tracks.length;
    play(host, game, 0.3);
    assert.equal(host.log.ends.length, 0);
    assert.equal(log.cues.length, cues, 'no stray hit or pickup sound from the restore');
    assert.ok(log.tracks.length > tracks);
    assert.notDeepEqual(log.tracks.at(-1), log.tracks[tracks], 'Benjo moves again');
    play(host, game, 10);
    assert.equal(host.log.ends.length, 1, 'the restored run ends on its own');
  });

  test('one snapshot can be restored twice', () => {
    const { host } = powerHost();
    const game = tail.create(host);
    game.start();
    play(host, game, 0.5, turnOnce(DOWN));
    const snap = game.snapshot();
    const frozen = structuredClone(snap);
    game.restore(snap);
    play(host, game, 1);
    game.restore(snap);
    assert.deepEqual(game.snapshot(), frozen);
  });

  test('snapshot before start is empty and restore of nothing is ignored', () => {
    const game = tail.create(fakeHost());
    assert.equal(game.snapshot(), null);
    game.restore(null);
    game.update(DT);
  });
});

describe('track', () => {
  test('reports the head cell once per update, then follows it', () => {
    const { host, log } = powerHost();
    const game = tail.create(host);
    game.start();
    const ref = createWorld(host.size, seeded(1));
    game.update(DT);
    assert.equal(log.tracks.length, 1);
    assert.deepEqual(log.tracks[0], [
      centerX(ref, ref.xs[ref.head]),
      centerY(ref, ref.ys[ref.head]),
    ]);
    play(host, game, 1, turnOnce(RIGHT));
    assert.equal(log.tracks.length, 1 + Math.round(1 / DT));
    assert.ok(log.tracks.at(-1)[0] > log.tracks[0][0], 'moved right');
  });
});
