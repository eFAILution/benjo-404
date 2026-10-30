import assert from 'node:assert/strict';
import { test } from 'node:test';

import { along, BUG_SPACE, placeTarget, TRACK, toward } from '../../../src/games/crackhash/ring.js';
import {
  ARC_MAX,
  BUG_FROM,
  BUG_HALF,
  EVENT_MISS,
  EVENT_POP,
  FIRST_ARC,
  HIT_HALF,
  MAGNET_WIDEN,
  SPEED_CAP,
  SPEED_START,
} from '../../../src/games/crackhash/tuning.js';
import { createWorld, stepWorld } from '../../../src/games/crackhash/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const LOCKS = 8;
/** The shortest a hit window may last at top speed for a person to tap it, seconds. */
const MIN_WINDOW_T = 0.12;
const SIZES = [
  { width: 960, height: 540 },
  { width: 375, height: 667 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1080 },
  { width: 320, height: 240 },
];
const label = (size, reducedMotion) =>
  `${size.width}x${size.height}${reducedMotion ? ' with reduced motion' : ''}`;
const PRESS = { press: true };
const WAIT = { press: false };

/**
 * Taps when Benjo reaches the middle of the target's window: the step he is within half a
 * step's run of it, or just past it.
 */
function centre(w) {
  if (!w.target.active || w.openT > 0) return WAIT;
  const d = along(w, w.s, w.target.s);
  return d <= (w.v * DT) / 2 || TRACK - d < HIT_HALF / 2 ? PRESS : WAIT;
}

/** The bug's middle against the target's: never closer than BUG_SPACE. */
function assertBugClear(w, where) {
  if (!w.bug.active) return;
  const gap = Math.abs(toward(w.bug.s, w.target.s));
  assert.ok(gap >= BUG_SPACE - 1e-9, `${where}: a bug ${gap.toFixed(1)} px from the target`);
}

test('a hit window lasts long enough to tap at top speed, and a bug never reaches it', () => {
  assert.ok((2 * HIT_HALF) / SPEED_CAP >= MIN_WINDOW_T);
  assert.ok(BUG_SPACE > HIT_HALF * MAGNET_WIDEN + BUG_HALF, 'even with the window widened');
  assert.ok(ARC_MAX + BUG_SPACE + 60 < TRACK - BUG_FROM, 'a bug past the target stays clear');
});

for (const size of SIZES) {
  for (const reducedMotion of [false, true]) {
    test(`tapping each target's middle opens ${LOCKS} locks at ${label(size, reducedMotion)}`, () => {
      let bugs = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld(size, seeded(seed), { reducedMotion });
        const where = `seed ${seed} at ${label(size, reducedMotion)}`;
        let pops = 0;
        let bugId = 0;
        for (let i = 0; i < 600 / DT && w.lock <= LOCKS && !w.dead; i++) {
          stepWorld(w, centre(w), DT);
          if (w.events & EVENT_POP) pops += 1;
          if (w.bug.active && w.bug.sprite !== bugId) {
            bugId = w.bug.sprite;
            bugs += 1;
          }
          assertBugClear(w, where);
        }
        assert.equal(w.dead, false, `${where} died (${w.cause}) in lock ${w.lock}`);
        assert.ok(w.lock > LOCKS, `${where} only reached lock ${w.lock}`);
        assert.equal(w.score, pops);
      }
      assert.ok(bugs > 8, `bugs came out (${bugs})`);
    });
  }
}

test('a player who never taps loses the run as Benjo runs past the first target', () => {
  for (const reducedMotion of [false, true]) {
    for (let seed = 1; seed <= 8; seed++) {
      const w = createWorld(SIZES[0], seeded(seed), { reducedMotion });
      while (!w.dead && w.time < 5) stepWorld(w, WAIT, DT);
      assert.equal(w.cause, 'past');
      assert.ok(w.time <= (FIRST_ARC + HIT_HALF) / SPEED_START + 2 * DT, `${w.time} s`);
    }
  }
});

test('every bug sits clear of the window, and one before the target is clear of Benjo', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const w = createWorld(SIZES[0], seeded(seed));
    for (let lock = 2; lock <= 10; lock++) {
      w.lock = lock;
      for (let i = 0; i < 200; i++) {
        w.dir = i % 2 ? 1 : -1;
        w.s = (i * 37) % TRACK;
        placeTarget(w);
        assertBugClear(w, `seed ${seed}, lock ${lock}`);
        if (!w.bug.active) continue;
        const bug = along(w, w.s, w.bug.s);
        assert.ok(bug >= BUG_FROM - 1e-9, `a bug ${bug.toFixed(1)} px ahead of Benjo`);
        // The tap at the window's middle is never on the bug.
        assert.ok(Math.abs(toward(w.target.s, w.bug.s)) >= BUG_HALF);
      }
    }
  }
});

test('tapping on a bug ends the run, even mid-lock', () => {
  const w = createWorld(SIZES[0], seeded(3));
  w.lock = 3;
  w.time = 1;
  Object.assign(w.bug, { active: true, s: w.s });
  stepWorld(w, PRESS, DT);
  assert.ok(w.events & EVENT_MISS);
  assert.equal(w.cause, 'bug');
});
