import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FILE_X, girderY, LADDERS, TOP } from '../../../src/games/savefile/level.js';
import { BENJO_HIT_H, BUG_R, GIRDER_T, LADDER_REACH } from '../../../src/games/savefile/tuning.js';
import { createWorld, stepWorld } from '../../../src/games/savefile/world.js';
import { DT, seeded } from '../runner/fake-host.js';

/** Jump toward a bug rolling at Benjo on his girder when it is this close, in level units. */
const JUMP_AT = 44;
/** Don't start up a ladder while a bug rolling toward its top is this close: it takes ~1.5 s. */
const TOP_CLEAR = 110;
/** Don't start up a ladder while a bug rolling at Benjo on his girder is this close. */
const CLIMB_CLEAR = 90;
/** Keep this far from the foot of a ladder a bug is coming down. */
const FOOT_CLEAR = 24;

/** The ladder up from girder `g` nearest Benjo. */
function ladderUp(w) {
  let best = null;
  for (const l of LADDERS) {
    if (l.bottom === w.g && (!best || Math.abs(l.x - w.x) < Math.abs(best.x - w.x))) best = l;
  }
  return best;
}

/** A bug coming down ladder `l`. */
const descending = (w, l) => w.bugs.some((b) => b.active && b.state === 'ladder' && b.x === l.x);

/** A bug that will cross the top of ladder `l` soon: rolling toward it on its top girder. */
const crossing = (w, l) =>
  w.bugs.some(
    (b) =>
      b.active &&
      ((b.state === 'roll' && b.g === l.top && Math.sign(l.x - b.x) === b.dir) ||
        (b.state === 'fall' && b.g === l.top + 1)) &&
      Math.abs(b.x - l.x) < TOP_CLEAR,
  );

/** A ladder down to Benjo's girder with a bug on it, whose foot is too close. */
const footDanger = (w) =>
  LADDERS.find((l) => l.bottom === w.g && descending(w, l) && Math.abs(l.x - w.x) < FOOT_CLEAR);

/**
 * The spec's autopilot, on the keys: walk to the nearest ladder up and climb it, then walk to
 * the file. It jumps toward a bug rolling at Benjo when it is close, as a player would, waits at a ladder's foot until no
 * bug is about to cross its top or come down it, backs down from a bug coming down the ladder
 * it is on, and steps away from the foot of a ladder a bug is coming down. If it keeps saving
 * the file, the level is beatable from the keyboard by a player who watches the bugs.
 */
function autopilot(w) {
  const intent = { mx: 0, my: 0, jump: false, climb: 0, px: null, held: 0 };
  if (w.state === 'jump') return intent;
  if (w.state === 'climb') {
    const l = LADDERS[w.ladder];
    const above = w.bugs.some((b) => b.active && b.state === 'ladder' && b.x === l.x && b.y < w.y);
    // Below this, Benjo's head is under the top girder, out of reach of bugs rolling over it.
    const safe = girderY(l.top, l.x) + BENJO_HIT_H + GIRDER_T;
    if (above) intent.my = 1;
    else if (crossing(w, l)) intent.my = w.y < safe ? 1 : 0;
    else intent.my = -1;
    return intent;
  }
  const threat = w.bugs.find(
    (b) =>
      b.active &&
      b.state === 'roll' &&
      b.g === w.g &&
      Math.sign(w.x - b.x) === b.dir &&
      Math.abs(w.x - b.x) < JUMP_AT + BUG_R,
  );
  if (threat) {
    intent.jump = true;
    intent.mx = -threat.dir;
    return intent;
  }
  const foot = footDanger(w);
  if (foot) {
    intent.mx = w.x < foot.x ? -1 : 1;
    return intent;
  }
  if (w.g === TOP) {
    intent.mx = Math.sign(FILE_X - w.x);
    return intent;
  }
  const l = ladderUp(w);
  // A climbing Benjo can't jump, so a bug rolling at him along this girder goes first.
  const coming = w.bugs.some(
    (b) =>
      b.active &&
      b.state === 'roll' &&
      b.g === w.g &&
      Math.sign(w.x - b.x) === b.dir &&
      Math.abs(w.x - b.x) < CLIMB_CLEAR,
  );
  if (Math.abs(l.x - w.x) <= LADDER_REACH / 2) {
    if (!descending(w, l) && !crossing(w, l) && !coming) intent.my = -1;
  } else intent.mx = Math.sign(l.x - w.x);
  return intent;
}

for (const reducedMotion of [false, true]) {
  test(`an autopilot saves level 1 with every life, and three files without a game over${reducedMotion ? ' with reduced motion' : ''}`, () => {
    for (let seed = 1; seed <= 8; seed++) {
      const w = createWorld({ width: 960, height: 540 }, seeded(seed), { reducedMotion });
      let firstLives = null;
      for (let i = 0; i < 240 * 60 && !w.dead && w.level < 4; i++) {
        stepWorld(w, autopilot(w), DT);
        if (w.level === 2 && firstLives === null) firstLives = w.lives;
      }
      assert.equal(
        w.dead,
        false,
        `seed ${seed}: ${w.hit} at ${w.time.toFixed(1)} s, level ${w.level}`,
      );
      assert.ok(w.level >= 4, `seed ${seed} reached only level ${w.level}`);
      assert.equal(firstLives, 3, `seed ${seed} lost a life in level 1`);
    }
  });
}

test('a Benjo who only walks to the first ladder and waits is hit within a minute', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const w = createWorld({ width: 960, height: 540 }, seeded(seed));
    const lives = w.lives;
    for (let i = 0; i < 60 * 60 && w.lives === lives; i++) {
      stepWorld(
        w,
        { mx: Math.sign(128 - w.x), my: 0, jump: false, climb: 0, px: null, held: 0 },
        DT,
      );
    }
    assert.ok(w.lives < lives, `seed ${seed} stood still for a minute`);
  }
});
