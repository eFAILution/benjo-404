import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hoverY } from '../../../src/games/whack/draw.js';
import whack from '../../../src/games/whack/index.js';
import {
  BUG_SCORE,
  DECOY_COST,
  POP_T,
  START_GRACE,
  TWIN_GRACE,
} from '../../../src/games/whack/tuning.js';
import { createWorld, stepWorld, zapBugs } from '../../../src/games/whack/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const NONE = { hole: -1 };

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

/** An assist whose twin says yes `twins` times. Counts every absorb() call. */
function twinAssist(twins = 1, magnet = false) {
  const assist = {
    twins,
    calls: 0,
    magnet,
    absorb() {
      assist.calls += 1;
      if (assist.twins <= 0) return false;
      assist.twins -= 1;
      return true;
    },
  };
  return assist;
}

/** A world past the start grace with nothing up and the spawn clock held back. */
function ready(seed = 1) {
  const w = createWorld(SIZE, seeded(seed));
  for (let i = 0; i <= Math.round(START_GRACE / DT); i++) stepWorld(w, NONE, DT);
  for (const hole of w.holes) hole.kind = null;
  w.spawnClock = Number.NEGATIVE_INFINITY;
  return w;
}

/** Put a thing in a hole, already fully up. */
function place(w, h, kind = 'bug', upT = 10) {
  Object.assign(w.holes[h], { kind, t: POP_T, upT, sinking: false, sinkT: 0, squashed: false });
  return w.holes[h];
}

/** Score 30 with a combo of 3, so every mistake has something to cost. */
function onARoll(w) {
  w.score = 30;
  w.combo = 3;
  return w;
}

describe('module', () => {
  test('lists the twin, the collector, and the magnet, but not rollback', () => {
    assert.deepEqual(whack.powers, ['twin', 'gc', 'magnet']);
  });
});

describe('Digital Twin', () => {
  test('takes a decoy whack: no points lost, combo kept, the feature sinks', () => {
    const w = onARoll(ready());
    const decoy = place(w, 2, 'decoy');
    const assist = twinAssist(1);
    stepWorld(w, { hole: 2 }, DT, assist);
    assert.equal(assist.calls, 1);
    assert.equal(w.score, 30);
    assert.equal(w.combo, 3);
    assert.equal(w.oopsT, 0, 'no shake');
    assert.equal(decoy.sinking, true);
    assert.ok(w.graceT > TWIN_GRACE - 2 * DT);
  });

  test('the grace forgives more mistakes for free, then they cost again', () => {
    const w = onARoll(ready());
    const assist = twinAssist(1);
    place(w, 1, 'decoy');
    stepWorld(w, { hole: 1 }, DT, assist);
    place(w, 3, 'decoy');
    stepWorld(w, { hole: 3 }, DT, assist);
    stepWorld(w, { hole: 4 }, DT, assist);
    assert.equal(w.score, 30);
    assert.equal(w.combo, 3);
    assert.equal(assist.calls, 1, 'the grace, not a second twin, took them');
    for (let t = 0; t < TWIN_GRACE; t += DT) stepWorld(w, NONE, DT, assist);
    assert.equal(w.graceT, 0);
    place(w, 2, 'decoy');
    stepWorld(w, { hole: 2 }, DT, assist);
    assert.equal(w.score, 30 - DECOY_COST);
    assert.equal(w.combo, 0);
    assert.equal(assist.calls, 2, 'asked again, and the twin was gone');
  });

  test('takes a missed bug that would break a combo', () => {
    const w = onARoll(ready());
    place(w, 0, 'bug', POP_T + DT / 2);
    const assist = twinAssist(1);
    stepWorld(w, NONE, DT, assist);
    assert.equal(w.missed, 1);
    assert.equal(w.combo, 3);
    assert.equal(assist.calls, 1);
  });

  test('a whiff with a combo spends the twin; a whiff without one does not', () => {
    const w = onARoll(ready());
    const assist = twinAssist(1);
    w.combo = 0;
    stepWorld(w, { hole: 1 }, DT, assist);
    assert.equal(assist.calls, 0, 'nothing to lose, so no twin');
    w.combo = 2;
    stepWorld(w, { hole: 1 }, DT, assist);
    assert.equal(assist.calls, 1);
    assert.equal(w.combo, 2);
  });

  test('without a twin every mistake costs as before', () => {
    const w = onARoll(ready());
    place(w, 2, 'decoy');
    stepWorld(w, { hole: 2 }, DT, twinAssist(0));
    assert.equal(w.score, 30 - DECOY_COST);
    assert.equal(w.combo, 0);
    assert.ok(w.oopsT > 0);
  });

  test('the instance asks the host twin on a costly mistake', () => {
    let calls = 0;
    const power = {
      active: () => false,
      absorb: () => {
        calls += 1;
        return true;
      },
    };
    const host = fakeHost({ power });
    const game = whack.create(host);
    game.start();
    // Whack the center hole every 0.3 s: a whiff, miss, or decoy with a combo going asks the twin.
    play(host, game, 50, (t, input) => {
      if (t > 0.2 && Math.round(t / DT) % 18 === 0) input.pressed.add('primary');
    });
    assert.equal(host.log.ends.length, 1);
    assert.ok(calls >= 1);
  });
});

describe('magnet', () => {
  test('the first bug pops up right under Benjo', () => {
    const w = createWorld(SIZE, seeded(3));
    w.lastHole = 3;
    for (let i = 0; i < 120 && w.spawned === 0; i++) stepWorld(w, NONE, DT, { magnet: true });
    assert.equal(w.spawned, 1);
    assert.equal(w.holes[3].kind, 'bug');
  });

  test('bugs go to the nearest empty hole and features to the farthest', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const w = createWorld(SIZE, seeded(seed));
      let checked = 0;
      for (let i = 0; i < 45 * 60 && !w.dead; i++) {
        w.lastHole = Math.floor(i / 90) % 5;
        const before = w.spawned;
        stepWorld(w, NONE, DT, { magnet: true });
        if (w.spawned === before) continue;
        const fresh = w.holes.findIndex((h) => h.id === w.spawned);
        const open = [0, 1, 2, 3, 4].filter((k) => k === fresh || !w.holes[k].kind);
        const dist = (k) =>
          (w.holeX[k] - w.holeX[w.lastHole]) ** 2 + (w.holeY[k] - w.holeY[w.lastHole]) ** 2;
        const near = Math.min(...open.map(dist));
        const far = Math.max(...open.map(dist));
        const want = w.holes[fresh].kind === 'bug' ? near : far;
        assert.equal(dist(fresh), want, `seed ${seed} spawn ${w.spawned}`);
        checked += 1;
      }
      assert.ok(checked > 20, `seed ${seed} checked ${checked}`);
    }
  });

  test('the instance polls the magnet every update', () => {
    let polls = 0;
    const power = {
      active: (id) => {
        if (id === 'magnet') polls += 1;
        return true;
      },
      absorb: () => false,
    };
    const host = fakeHost({ power });
    const game = whack.create(host);
    game.start();
    play(host, game, 1);
    assert.equal(polls, 60);
  });
});

describe('Garbage Collector', () => {
  test('squashes every bug that is up and leaves the features', () => {
    const w = ready();
    place(w, 0, 'bug');
    place(w, 2, 'bug');
    place(w, 3, 'decoy');
    const sinking = place(w, 4, 'bug');
    sinking.sinking = true;
    assert.equal(zapBugs(w), 2);
    assert.equal(w.score, 2 * BUG_SCORE);
    assert.equal(w.hits, 2);
    assert.equal(w.holes[0].squashed && w.holes[0].sinking, true);
    assert.equal(w.holes[2].squashed && w.holes[2].sinking, true);
    assert.equal(w.holes[3].sinking, false, 'the feature stays up');
    assert.equal(zapBugs(w), 0, 'nothing left to zap');
  });

  test('zaps nothing once the clock has run out', () => {
    const w = ready();
    place(w, 1, 'bug');
    w.dead = true;
    assert.equal(zapBugs(w), 0);
  });

  test('the instance returns the count and shows the points at once', () => {
    const host = fakeHost();
    const game = whack.create(host);
    game.start();
    // The first spawn, just under a second in, is always a bug.
    play(host, game, 1);
    assert.equal(game.collect(), 1);
    assert.equal(host.log.scores.at(-1), BUG_SCORE);
    assert.equal(game.collect(), 0);
    play(host, game, 50);
    assert.equal(host.log.ends.length, 1);
    assert.equal(game.collect(), 0, 'nothing after the end');
  });

  test('collect before start or after destroy returns 0', () => {
    const game = whack.create(fakeHost());
    assert.equal(game.collect(), 0);
    game.start();
    game.destroy();
    assert.equal(game.collect(), 0);
  });
});

describe('track', () => {
  test('reports where Benjo hovers, once per update', () => {
    const points = [];
    const host = fakeHost({ track: (x, y) => points.push([x, y]) });
    const game = whack.create(host);
    game.start();
    play(host, game, 1);
    assert.equal(points.length, 60);
    const w = createWorld(SIZE, seeded(1));
    assert.deepEqual(points[0], [w.holeX[w.lastHole], hoverY(w)]);
  });
});
