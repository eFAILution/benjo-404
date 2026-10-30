import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BRICK_COUNT, bricksLeft, lowestRow } from '../../../src/games/breakout/bricks.js';
import breakout from '../../../src/games/breakout/index.js';
import {
  BRICK_SCORE,
  GRACE_T,
  LIVES,
  MAGNET_PULL,
  WALL_BONUS,
} from '../../../src/games/breakout/tuning.js';
import { clearRow, createWorld, stepWorld } from '../../../src/games/breakout/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

const IDLE = { move: 0, targetX: null, serve: false };
const SIZE = { width: 960, height: 540 };

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

/** Serve whenever the ball waits, never move. */
const serveOnly = (t, input) => {
  if (t > 0.2) input.pressed.add('primary');
};

/** A host with a power port that holds `twins` Digital Twins, and logs of track calls and cues. */
function powerHost({ twins = 0, magnet = false } = {}) {
  const host = fakeHost();
  const log = { absorbs: 0, tracks: [], cues: [], benjo: null };
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
  host.drawSprite = (sprite, x, y) => {
    if (sprite === host.theme.sprites.benjo) log.benjo = [x, y];
  };
  return { host, log };
}

/** A world with the ball in flight, falling past the bottom well away from the paddle. */
function fallingWorld() {
  const w = createWorld(SIZE, seeded(1));
  w.time = 1;
  w.serving = false;
  w.served = true;
  w.bx = w.left + 20;
  w.by = w.bottom + w.ballR - 1;
  w.vx = 0;
  w.vy = 300;
  return w;
}

/** An aid whose absorb answers `twin` and counts its calls. */
function countingAid(twin, magnet = false) {
  const aid = {
    magnet,
    calls: 0,
    absorb() {
      aid.calls += 1;
      return twin;
    },
  };
  return aid;
}

describe('module', () => {
  test('lists every game-assisted power', () => {
    assert.deepEqual(breakout.powers, ['twin', 'rollback', 'gc', 'magnet']);
  });
});

describe('digital twin', () => {
  test('a ball past the paddle bounces back off the floor and keeps its life', () => {
    const w = fallingWorld();
    const aid = countingAid(true);
    stepWorld(w, IDLE, DT, aid);
    assert.equal(aid.calls, 1);
    assert.equal(w.lives, LIVES);
    assert.equal(w.losing, false);
    assert.ok(w.vy < 0, 'heading back up');
    assert.ok(w.by <= w.bottom - w.ballR);
    assert.equal(w.graceT, GRACE_T);
  });

  test('with no twin the same ball is lost as before', () => {
    const w = fallingWorld();
    const aid = countingAid(false);
    stepWorld(w, IDLE, DT, aid);
    assert.equal(aid.calls, 1);
    assert.equal(w.lives, LIVES - 1);
    assert.equal(w.losing, true);
  });

  test('a second fall inside the grace bounces without spending another twin', () => {
    const w = fallingWorld();
    const aid = countingAid(true);
    stepWorld(w, IDLE, DT, aid);
    w.by = w.bottom + w.ballR - 1;
    w.vy = 300;
    stepWorld(w, IDLE, DT, aid);
    assert.equal(aid.calls, 1);
    assert.equal(w.lives, LIVES);
    for (let t = 0; t < GRACE_T; t += DT) stepWorld(w, IDLE, DT, countingAid(false));
    assert.equal(w.graceT, 0, 'the grace runs out');
  });

  test('a run with one twin asks once more and lasts longer', () => {
    const runs = [0, 1].map((twins) => {
      const { host, log } = powerHost({ twins });
      const game = breakout.create(host);
      game.start();
      let ticks = 0;
      play(host, game, 120, (t, input) => {
        ticks += 1;
        serveOnly(t, input);
      });
      assert.equal(host.log.ends.length, 1);
      return { absorbs: log.absorbs, ticks };
    });
    assert.equal(runs[0].absorbs, LIVES);
    assert.equal(runs[1].absorbs, LIVES + 1);
    assert.ok(runs[1].ticks > runs[0].ticks);
  });
});

describe('magnet', () => {
  test('a falling fireball drifts toward the paddle; a rising one does not', () => {
    const w = createWorld(SIZE, seeded(1));
    w.time = 1;
    w.serving = false;
    w.bx = w.left + 40;
    w.by = (w.ceiling + w.bottom) / 2;
    w.vx = 0;
    w.vy = 200;
    const x = w.bx;
    stepWorld(w, IDLE, DT, countingAid(false, true));
    assert.ok(Math.abs(w.bx - x - MAGNET_PULL * w.pace * DT) < 1e-9);
    w.vy = -200;
    const up = w.bx;
    stepWorld(w, IDLE, DT, countingAid(false, true));
    assert.equal(w.bx, up);
  });

  test('a paddle that never moves keeps more balls with the magnet on', () => {
    const [plain, pulled] = [false, true].map((magnet) => {
      const { host } = powerHost({ magnet });
      const game = breakout.create(host);
      game.start();
      let ticks = 0;
      play(host, game, 120, (t, input) => {
        ticks += 1;
        serveOnly(t, input);
      });
      return { ticks, score: host.log.scores.at(-1) };
    });
    assert.ok(pulled.ticks > plain.ticks, `magnet ${pulled.ticks} vs none ${plain.ticks}`);
    assert.ok(pulled.score > plain.score);
  });
});

describe('garbage collector', () => {
  test('clearRow pops the lowest row for points, and the last row starts the next round', () => {
    const w = createWorld(SIZE, seeded(1));
    assert.equal(lowestRow(w), 4);
    const counts = [];
    for (let k = 0; k < 5; k++) counts.push(clearRow(w));
    assert.deepEqual(counts, [7, 4, 12, 6, 9]);
    assert.equal(
      counts.reduce((a, b) => a + b),
      BRICK_COUNT,
    );
    assert.equal(w.round, 2);
    assert.equal(bricksLeft(w), BRICK_COUNT, 'a fresh wall');
    assert.equal(w.score, BRICK_COUNT * BRICK_SCORE + WALL_BONUS);
    assert.equal(w.serving, true);
  });

  test('emptying the wall mid-row leaves the fresh wall whole', () => {
    const w = createWorld(SIZE, seeded(1));
    // Only two top-row bricks stand, with dead top-row bricks after them in index order.
    w.alive.fill(0);
    w.alive[2] = 1;
    w.alive[5] = 1;
    assert.equal(clearRow(w), 2);
    assert.equal(w.round, 2);
    assert.equal(bricksLeft(w), BRICK_COUNT);
  });

  test('collect returns the count, plays a cue, and the HUD catches up', () => {
    const { host, log } = powerHost();
    const game = breakout.create(host);
    assert.equal(game.collect(), 0, 'nothing before start');
    game.start();
    assert.equal(game.collect(), 7);
    assert.deepEqual(log.cues, ['score']);
    game.update(DT);
    assert.equal(host.log.scores.at(-1), 7 * BRICK_SCORE);
  });
});

describe('rollback', () => {
  test('restore after the last ball brings the snapshot back and the run plays on', () => {
    const { host, log } = powerHost();
    const game = breakout.create(host);
    game.start();
    play(host, game, 1, serveOnly);
    const snap = game.snapshot();
    const frozen = structuredClone(snap);
    play(host, game, 120, serveOnly);
    assert.equal(host.log.ends.length, 1);
    assert.deepEqual(snap, frozen, 'later updates never touched the snapshot');

    game.restore(snap);
    assert.deepEqual(game.snapshot(), frozen, 'the run is back where it was');
    assert.equal(host.log.scores.at(-1), frozen.world.score);

    host.log.ends.length = 0;
    const cues = log.cues.length;
    game.update(DT);
    assert.equal(log.cues.length, cues, 'no stray sound from the restore');
    play(host, game, 120, serveOnly);
    assert.equal(host.log.ends.length, 1, 'the restored run plays out to its own end');
  });

  test('one snapshot can be restored twice, and nothing before start', () => {
    const { host } = powerHost();
    const game = breakout.create(host);
    assert.equal(game.snapshot(), null);
    game.restore(null);
    game.start();
    play(host, game, 1, serveOnly);
    const snap = game.snapshot();
    const frozen = structuredClone(snap);
    game.restore(snap);
    play(host, game, 2, serveOnly);
    game.restore(snap);
    assert.deepEqual(game.snapshot(), frozen);
  });
});

describe('track', () => {
  test('reports Benjo under the paddle once per update', () => {
    const { host, log } = powerHost();
    const game = breakout.create(host);
    game.start();
    play(host, game, 0.5);
    assert.equal(log.tracks.length, Math.round(0.5 / DT));
    assert.deepEqual(log.tracks.at(-1), log.benjo, 'where Benjo is drawn');
    const x = log.tracks.at(-1)[0];
    play(host, game, 0.3, (_t, input) => input.held.add('right'));
    assert.ok(log.tracks.at(-1)[0] > x, 'follows the paddle');
  });
});
