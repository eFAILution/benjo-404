import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { bugY } from '../../../src/games/zapper/formation.js';
import zapper from '../../../src/games/zapper/index.js';
import {
  BUG_SCORE,
  COLS,
  FORM_TOP,
  GRACE_T,
  LIVES,
  ROWS,
  WAVE_BONUS,
  WAVE_PAUSE,
} from '../../../src/games/zapper/tuning.js';
import { createWorld, stepWorld, sweep } from '../../../src/games/zapper/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

const IDLE = { move: 0, targetX: null, fire: false, firing: false };
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

/** A host with a power port that holds `twins` Digital Twins, and logs of track calls and cues. */
function powerHost({ twins = 0 } = {}) {
  const host = fakeHost();
  const log = { absorbs: 0, magnetAsked: 0, tracks: [], cues: [], benjo: null };
  let left = twins;
  host.power = {
    active: () => {
      log.magnetAsked += 1;
      return true;
    },
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

/** An aid whose absorb answers `twin` and counts its calls. */
function countingAid(twin) {
  const aid = {
    calls: 0,
    absorb() {
      aid.calls += 1;
      return twin;
    },
  };
  return aid;
}

/** A world with one bite about to land on Benjo, and a second bite and a bolt in the air. */
function bitingWorld() {
  const w = createWorld(SIZE, seeded(1));
  w.time = 1;
  w.biteT = 99;
  Object.assign(w.bites[0], { active: true, x: w.bx, y: w.benjoY - 2, prevY: w.benjoY - 2 });
  Object.assign(w.bites[1], { active: true, x: w.left + 4, y: w.ceiling + 200, prevY: 0 });
  Object.assign(w.bolts[0], { active: true, x: w.right - 4, y: w.benjoY - 200, prevY: 0 });
  return w;
}

/** A world whose formation reaches Benjo's row on the next step. */
function reachingWorld() {
  const w = createWorld(SIZE, seeded(1));
  w.time = 1;
  w.biteT = 99;
  w.originY = w.benjoY - w.bugH - (ROWS - 1) * w.rowStep;
  w.prevOriginY = w.originY;
  return w;
}

describe('module', () => {
  test('lists the twin, rollback, and the garbage collector, and no magnet', () => {
    assert.deepEqual(zapper.powers, ['twin', 'rollback', 'gc']);
  });

  test('never asks about the magnet', () => {
    const { host, log } = powerHost();
    const game = zapper.create(host);
    game.start();
    play(host, game, 1);
    assert.equal(log.magnetAsked, 0);
  });
});

describe('digital twin', () => {
  test('a bite with a twin up vanishes and Benjo keeps his life', () => {
    const w = bitingWorld();
    const aid = countingAid(true);
    stepWorld(w, IDLE, DT, aid);
    assert.equal(aid.calls, 1);
    assert.equal(w.lives, LIVES);
    assert.equal(w.hitT, 0, 'no hit stop');
    assert.equal(w.bites[0].active, false);
    assert.equal(w.bites[1].active, true, 'nothing else changes');
    assert.equal(w.bolts[0].active, true);
    assert.equal(w.graceT, GRACE_T);
  });

  test('with no twin the same bite costs a life as before', () => {
    const w = bitingWorld();
    const aid = countingAid(false);
    stepWorld(w, IDLE, DT, aid);
    assert.equal(aid.calls, 1);
    assert.equal(w.lives, LIVES - 1);
    assert.ok(w.hitT > 0);
    assert.equal(w.bites[1].active, false, 'a real bite clears the air');
  });

  test('a second bite inside the grace misses without spending another twin', () => {
    const w = bitingWorld();
    const aid = countingAid(true);
    stepWorld(w, IDLE, DT, aid);
    Object.assign(w.bites[2], { active: true, x: w.bx, y: w.benjoY - 2, prevY: w.benjoY - 2 });
    stepWorld(w, IDLE, DT, aid);
    assert.equal(aid.calls, 1);
    assert.equal(w.lives, LIVES);
    for (let t = 0; t < GRACE_T; t += DT) stepWorld(w, IDLE, DT, countingAid(false));
    assert.equal(w.graceT, 0, 'the grace runs out');
  });

  test('bugs that reach Benjo are pushed back to the top instead of ending the run', () => {
    const w = reachingWorld();
    const aid = countingAid(true);
    stepWorld(w, IDLE, DT, aid);
    assert.equal(aid.calls, 1);
    assert.equal(w.dead, false);
    assert.equal(w.originY, w.ceiling + FORM_TOP * w.unit);
    assert.equal(w.alive, ROWS * COLS, 'every bug still there');
  });

  test('with no twin the bugs reaching Benjo end the run as before', () => {
    const w = reachingWorld();
    stepWorld(w, IDLE, DT, countingAid(false));
    assert.equal(w.dead, true);
    assert.equal(w.hit, 'reached');
  });

  test('a run with one twin asks once more and lasts longer', () => {
    const runs = [0, 1].map((twins) => {
      const { host, log } = powerHost({ twins });
      const game = zapper.create(host);
      game.start();
      let ticks = 0;
      play(host, game, 300, () => {
        ticks += 1;
      });
      assert.equal(host.log.ends.length, 1);
      return { absorbs: log.absorbs, ticks };
    });
    assert.equal(runs[1].absorbs, runs[0].absorbs + 1);
    assert.ok(runs[1].ticks > runs[0].ticks);
  });
});

describe('garbage collector', () => {
  test('sweep clears every bug and bite, scores the bugs, and ends the wave', () => {
    const w = bitingWorld();
    const n = sweep(w);
    assert.equal(n, ROWS * COLS + 2);
    assert.equal(w.alive, 0);
    assert.ok(w.bugs.every((b) => !b.alive));
    assert.ok(w.bites.every((s) => !s.active));
    assert.equal(w.bolts[0].active, true, "Benjo's own fire stays");
    assert.equal(w.score, ROWS * COLS * BUG_SCORE + WAVE_BONUS);
    assert.equal(w.wave, 2);
    assert.equal(w.waveT, WAVE_PAUSE);
  });

  test('between waves only the bites are left to sweep', () => {
    const w = bitingWorld();
    sweep(w);
    w.bites[0].active = true;
    assert.equal(sweep(w), 1);
    assert.equal(w.wave, 2);
  });

  test('collect returns the count, cheers the next wave, and the HUD catches up', () => {
    const { host, log } = powerHost();
    const game = zapper.create(host);
    assert.equal(game.collect(), 0, 'nothing before start');
    game.start();
    assert.equal(game.collect(), ROWS * COLS);
    assert.deepEqual(log.cues, ['clear']);
    assert.equal(host.log.statuses.at(-1), 'WAVE 2');
    game.update(DT);
    assert.equal(host.log.scores.at(-1), ROWS * COLS * BUG_SCORE + WAVE_BONUS);
    play(host, game, WAVE_PAUSE + 0.1);
    const w = game.snapshot().world;
    assert.equal(w.wave, 2);
    assert.equal(w.alive, w.total, 'the next wave arrives');
    assert.ok(w.total > ROWS * COLS, 'and it is bigger (#83)');
    assert.ok(bugY(w, w.bugs[0]) > w.ceiling);
  });
});

describe('rollback', () => {
  test('restore after the run ends brings the snapshot back and the run plays on', () => {
    const { host, log } = powerHost();
    const game = zapper.create(host);
    game.start();
    play(host, game, 2);
    const snap = game.snapshot();
    const frozen = structuredClone(snap);
    play(host, game, 300);
    assert.equal(host.log.ends.length, 1);
    assert.deepEqual(snap, frozen, 'later updates never touched the snapshot');

    game.restore(snap);
    assert.deepEqual(game.snapshot(), frozen, 'the run is back where it was');
    assert.equal(host.log.scores.at(-1), frozen.world.score);

    host.log.ends.length = 0;
    const cues = log.cues.length;
    game.update(DT);
    assert.equal(log.cues.length, cues, 'no stray sound from the restore');
    play(host, game, 300);
    assert.equal(host.log.ends.length, 1, 'the restored run plays out to its own end');
  });

  test('one snapshot can be restored twice, and nothing before start', () => {
    const { host } = powerHost();
    const game = zapper.create(host);
    assert.equal(game.snapshot(), null);
    game.restore(null);
    game.start();
    play(host, game, 1);
    const snap = game.snapshot();
    const frozen = structuredClone(snap);
    game.restore(snap);
    play(host, game, 2);
    game.restore(snap);
    assert.deepEqual(game.snapshot(), frozen);
  });
});

describe('track', () => {
  test('reports Benjo once per update, where he is drawn', () => {
    const { host, log } = powerHost();
    const game = zapper.create(host);
    game.start();
    play(host, game, 0.5);
    assert.equal(log.tracks.length, Math.round(0.5 / DT));
    assert.deepEqual(log.tracks.at(-1), log.benjo);
    const x = log.tracks.at(-1)[0];
    play(host, game, 0.3, (_t, input) => input.held.add('right'));
    assert.ok(log.tracks.at(-1)[0] > x, 'follows Benjo');
  });
});
