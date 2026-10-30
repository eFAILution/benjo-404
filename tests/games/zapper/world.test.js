import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  biteIntervalFor,
  biteSpeedFor,
  bugX,
  bugY,
  lowest,
  speedFor,
} from '../../../src/games/zapper/formation.js';
import {
  BENJO_SPEED,
  BITE_SPEED_CAP,
  BITE_T_MIN,
  BOLT_POOL,
  BUG_SCORE,
  DROP,
  EVENT_FIRE,
  EVENT_HIT,
  EVENT_KILL,
  EVENT_WAVE,
  FIRE_COOLDOWN,
  FORM_SPEED_CAP,
  FORM_SPEED_CAP_REDUCED,
  FORM_SPEED_RAMP,
  HIT_T,
  LIVES,
  POINTER_SPEED,
  START_GRACE,
  WAVE_BONUS,
  WAVE_PAUSE,
} from '../../../src/games/zapper/tuning.js';
import { createWorld, resizeWorld, stepWorld } from '../../../src/games/zapper/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const idle = () => ({ move: 0, targetX: null, fire: false, firing: false });
const hold = () => ({ ...idle(), firing: true });

/** Step `seconds` of world time with `intent(w)`. */
function run(w, seconds, intent = idle) {
  for (let i = 0; i < Math.round(seconds / DT) && !w.dead; i++) stepWorld(w, intent(w), DT);
  return w;
}

/** A world past the start grace with bites switched off, so a test sets up only what it needs. */
function live(size = SIZE, seed = 1, options = {}) {
  const w = run(createWorld(size, seeded(seed), options), START_GRACE + DT);
  w.biteT = Number.POSITIVE_INFINITY;
  return w;
}

/** Kill every bug except the ones listed as [col, row]. */
function keepOnly(w, ...keep) {
  for (const b of w.bugs) b.alive = keep.some(([c, r]) => b.col === c && b.row === r);
  w.alive = keep.length;
}

const bug = (w, col, row) => w.bugs.find((b) => b.col === col && b.row === row);
const active = (list) => list.filter((s) => s.active);

/** Drop a shot into a pool at (x, y). */
function place(list, x, y) {
  const s = list.find((item) => !item.active);
  Object.assign(s, { active: true, x, y, prevY: y });
  return s;
}

describe('fire', () => {
  test('a bolt kills the lowest bug it crosses and scores 10 times the wave', () => {
    const w = live();
    w.wave = 2;
    const target = bug(w, 2, 2);
    place(w.bolts, bugX(w, target), bugY(w, target) + w.bugH);
    stepWorld(w, idle(), DT);
    assert.equal(target.alive, false);
    assert.equal(bug(w, 2, 1).alive, true, 'the bug above is shielded');
    assert.equal(w.score, BUG_SCORE * 2);
    assert.equal(w.alive, 17);
    assert.ok(w.events & EVENT_KILL);
    assert.equal(active(w.bolts).length, 0, 'the bolt retires');
  });

  test('a bolt between columns misses and retires above the ceiling', () => {
    const w = live();
    const left = bug(w, 0, 2);
    place(w.bolts, bugX(w, left) + w.colStep / 2, bugY(w, left) + w.bugH);
    run(w, 1.5);
    assert.equal(w.alive, 18);
    assert.equal(active(w.bolts).length, 0);
  });

  test('the cooldown limits fire to one bolt per FIRE_COOLDOWN, even when held or mashed', () => {
    for (const intent of [hold, () => ({ ...idle(), fire: true })]) {
      const w = live();
      const fired = [];
      for (let i = 0; i < 60; i++) {
        stepWorld(w, intent(), DT);
        if (w.events & EVENT_FIRE) fired.push(w.time);
      }
      assert.ok(fired.length >= 3);
      for (let i = 1; i < fired.length; i++) {
        assert.ok(fired[i] - fired[i - 1] >= FIRE_COOLDOWN - 1e-9, `${fired[i] - fired[i - 1]}`);
      }
    }
  });

  test('up to BOLT_POOL bolts fly at once, more than the old 3 (#83)', () => {
    const w = live({ width: 960, height: 1080 });
    let shots = 0;
    for (let i = 0; i < 20; i++) {
      w.cooldown = 0;
      stepWorld(w, hold(), DT);
      if (w.events & EVENT_FIRE) shots += 1;
    }
    assert.ok(BOLT_POOL > 3);
    assert.equal(shots, BOLT_POOL);
    assert.equal(active(w.bolts).length, BOLT_POOL);
  });

  test('held fire keeps more than 3 bolts in the air on a tall screen (#83)', () => {
    const w = live({ width: 960, height: 1080 });
    let most = 0;
    for (let i = 0; i < 120; i++) {
      stepWorld(w, hold(), DT);
      most = Math.max(most, active(w.bolts).length);
    }
    assert.ok(most > 3, `${most} at most`);
  });

  test('input inside the start grace is the press that started the run', () => {
    const w = createWorld(SIZE, seeded(1));
    const x = w.bx;
    stepWorld(w, { move: 1, targetX: null, fire: true, firing: true }, DT);
    assert.equal(active(w.bolts).length, 0);
    assert.equal(w.bx, x);
  });
});

describe('Benjo', () => {
  test('keys move at a fixed speed and override the pointer', () => {
    const w = live();
    const x = w.bx;
    stepWorld(w, { ...idle(), move: 1, targetX: 0 }, DT);
    assert.ok(Math.abs(w.bx - x - BENJO_SPEED * w.unit * DT) < 1e-9);
  });

  test('the pointer drags Benjo at a bounded speed, never a teleport', () => {
    const w = live();
    const x = w.bx;
    stepWorld(w, { ...idle(), targetX: w.left }, DT);
    assert.ok(Math.abs(x - w.bx - POINTER_SPEED * w.unit * DT) < 1e-9);
    run(w, 1, () => ({ ...idle(), targetX: -500 }));
    assert.equal(w.bx, w.left + w.benjoH / 2, 'and stops at the play rect edge');
  });
});

describe('formation', () => {
  test('reverses at the edge and drops 14 units', () => {
    const w = live();
    w.originX = w.right - w.bugH / 2 - 5 * w.colStep - 0.01;
    const { originX, originY } = w;
    stepWorld(w, idle(), DT);
    assert.equal(w.dir, -1);
    assert.equal(w.originX, originX);
    assert.ok(Math.abs(w.originY - originY - DROP * w.unit) < 1e-9);
    stepWorld(w, idle(), DT);
    assert.ok(w.originX < originX, 'then heads back left');
  });

  test('the edge follows the living bugs, not the full block', () => {
    const w = live();
    keepOnly(w, [0, 0]);
    w.originX = w.right - w.bugH / 2 - 0.01;
    stepWorld(w, idle(), DT);
    assert.equal(w.dir, -1);
  });

  test('speeds up as bugs die (speedFor), capped, lower with reduced motion', () => {
    const w = live();
    const full = speedFor(w);
    keepOnly(w, [0, 0]);
    assert.ok(Math.abs(speedFor(w) / full - (1 + FORM_SPEED_RAMP * (17 / 18))) < 1e-9);
    w.wave = 100;
    assert.equal(speedFor(w), FORM_SPEED_CAP * w.unit);
    w.reducedMotion = true;
    assert.equal(speedFor(w), FORM_SPEED_CAP_REDUCED * w.unit);
  });

  test('bites come faster and fall faster each wave, up to their caps', () => {
    const w = live();
    const [interval, speed] = [biteIntervalFor(w), biteSpeedFor(w)];
    w.wave = 2;
    assert.ok(biteIntervalFor(w) < interval);
    assert.ok(biteSpeedFor(w) > speed);
    w.wave = 100;
    assert.equal(biteIntervalFor(w), BITE_T_MIN);
    assert.equal(biteSpeedFor(w), BITE_SPEED_CAP * w.unit);
  });

  test('clearing the wave adds the bonus, then wave 2 starts faster', () => {
    const w = live();
    const speed1 = speedFor(w);
    keepOnly(w, [3, 1]);
    const last = bug(w, 3, 1);
    place(w.bolts, bugX(w, last), bugY(w, last) + w.bugH);
    stepWorld(w, idle(), DT);
    assert.equal(w.score, BUG_SCORE + WAVE_BONUS);
    assert.equal(w.wave, 2);
    assert.ok(w.events & EVENT_WAVE);
    run(w, WAVE_PAUSE - 2 * DT);
    assert.equal(w.alive, 0, 'the next formation waits out the pause');
    run(w, 3 * DT);
    assert.equal(w.alive, 21, 'wave 2 is 7 x 3 at this size (#83)');
    assert.equal(w.originY, w.ceiling + 24 * w.unit);
    assert.ok(speedFor(w) > speed1);
  });

  test('a bug reaching Benjo row ends the run as reached', () => {
    const w = live();
    w.originY = w.benjoY - w.bugH - 2 * w.rowStep;
    stepWorld(w, idle(), DT);
    assert.equal(w.dead, true);
    assert.equal(w.hit, 'reached');
  });
});

describe('bites', () => {
  test('a bite on Benjo costs a life, clears every shot, and holds the world still', () => {
    const w = live();
    place(w.bolts, w.bx, w.benjoY - 200);
    place(w.bites, w.bx + w.colStep * 3, w.benjoY - 200);
    place(w.bites, w.bx, w.benjoY - 4);
    stepWorld(w, idle(), DT);
    const { originX, bx } = w;
    assert.equal(w.lives, LIVES - 1);
    assert.ok(w.events & EVENT_HIT);
    assert.equal(w.dead, false);
    assert.equal(active(w.bolts).length + active(w.bites).length, 0);
    assert.equal(w.hitT, HIT_T);
    run(w, HIT_T - DT, () => ({ ...idle(), move: 1 }));
    assert.equal(w.originX, originX, 'hit stop');
    assert.equal(w.bx, bx);
    run(w, 2 * DT, () => ({ ...idle(), move: 1 }));
    assert.ok(w.bx > bx, 'then play resumes');
  });

  test('the third bite ends the run as bite', () => {
    const w = live();
    for (let i = 0; i < LIVES; i++) {
      place(w.bites, w.bx, w.benjoY - 4);
      run(w, HIT_T + DT);
    }
    assert.equal(w.dead, true);
    assert.equal(w.hit, 'bite');
  });

  test('a bite that misses falls off the bottom', () => {
    const w = live();
    place(w.bites, w.bx + w.benjoH * 2, w.benjoY - 20);
    run(w, 1);
    assert.equal(w.lives, LIVES);
    assert.equal(active(w.bites).length, 0);
  });

  test('come only from the lowest living bug of a column', () => {
    const random = seeded(11);
    for (let trial = 0; trial < 200; trial++) {
      const w = live(SIZE, trial + 1);
      for (const b of w.bugs) b.alive = random() < 0.5;
      w.alive = w.bugs.filter((b) => b.alive).length;
      if (w.alive === 0) continue;
      w.biteT = 0;
      stepWorld(w, idle(), DT);
      const [bite] = active(w.bites);
      assert.ok(bite, 'a bite dropped');
      const from = [0, 1, 2, 3, 4, 5].map((c) => lowest(w, c)).filter(Boolean);
      const match = from.find(
        (b) => bugX(w, b) === bite.x && bugY(w, b) + w.bugH / 2 === bite.prevY,
      );
      assert.ok(match, `trial ${trial}`);
    }
  });
});

describe('resize', () => {
  test('keeps Benjo, the formation, and every shot inside the new play area', () => {
    const sizes = [
      { width: 320, height: 480 },
      { width: 320, height: 240 },
      { width: 375, height: 667 },
      { width: 2560, height: 1080 },
      { width: 960, height: 540 },
    ];
    const w = live({ width: 1440, height: 900 });
    w.biteT = 0.5;
    run(w, 3, hold);
    w.originX = w.right - w.bugH / 2 - 5 * w.colStep;
    w.originY += 300;
    place(w.bites, w.right - 2, w.benjoY - 50);
    for (const size of sizes) {
      resizeWorld(w, size);
      assert.equal(w.width, size.width);
      assert.ok(w.bx >= w.left + w.benjoH / 2 && w.bx <= w.right - w.benjoH / 2);
      for (const b of w.bugs.filter((item) => item.alive)) {
        assert.ok(bugX(w, b) - w.bugH / 2 >= w.left - 1e-9, `${size.width} left`);
        assert.ok(bugX(w, b) + w.bugH / 2 <= w.right + 1e-9, `${size.width} right`);
        assert.ok(bugY(w, b) - w.bugH / 2 >= w.ceiling - 1e-9, `${size.width} top`);
        assert.ok(bugY(w, b) < w.benjoY - w.bugH, `${size.width} above Benjo`);
      }
      for (const s of [...active(w.bolts), ...active(w.bites)]) {
        assert.ok(s.x >= w.left && s.x <= w.right && s.y >= 0 && s.y <= w.height);
      }
      stepWorld(w, idle(), DT);
      assert.equal(w.dead, false, `${size.width}x${size.height} keeps the run going`);
    }
  });

  test('a tiny canvas is treated as the minimum size', () => {
    const w = createWorld({ width: 0, height: 0 }, seeded(1));
    assert.equal(w.width, 320);
    assert.equal(w.height, 240);
    assert.equal(w.ceiling, 96);
    assert.ok(bugY(w, bug(w, 0, 2)) < w.benjoY - w.bugH);
    run(w, 1, hold);
    assert.equal(w.dead, false);
  });
});
