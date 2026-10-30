import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { hit, loseBall, tick } from '../../../src/games/pinball/rules.js';
import { activeSystem, eggLit } from '../../../src/games/pinball/score.js';
import { createWorld, stepWorld } from '../../../src/games/pinball/table.js';
import {
  BALL_SAVE_T,
  BALLS,
  EXTRA_BALL_AT,
  NUDGE_WARN,
  QUARTERS_REPAIRS,
  QUARTERS_T,
  SCORE,
  SYSTEMS,
} from '../../../src/games/pinball/tuning.js';
import { seeded } from '../runner/fake-host.js';

const DT = 1 / 60;
const IDLE = {
  left: false,
  right: false,
  pull: false,
  nudge: false,
  leftPressed: false,
  rightPressed: false,
};

/** Hit the active system's shot until it is repaired. */
function repairActive(w) {
  const { kind, need, ids } = activeSystem(w);
  const before = w.repaired;
  for (let i = 0; i < need && w.repaired === before; i++) {
    if (kind === 'ship') for (let lane = 0; lane < 4; lane++) hit(w, 'lane', lane, null);
    else if (kind === 'loopL') hit(w, 'loop', 0, null);
    else hit(w, kind, ids ? i : 0, null);
  }
  assert.equal(w.repaired, before + 1, `repaired ${SYSTEMS[w.order[w.active]]?.name}`);
}

/** Drain every ball in play, as the table does. */
function drainAll(w) {
  const balls = w.balls;
  w.balls = [];
  for (const b of balls) hit(w, 'drain', 0, b);
}

describe('pinball rules', () => {
  test('the repair order is shuffled from the run random, the same for the same seed', () => {
    const a = createWorld(seeded(5));
    const b = createWorld(seeded(5));
    const c = createWorld(seeded(6));
    assert.deepEqual(a.order, b.order);
    assert.notDeepEqual(a.order, c.order);
    assert.deepEqual(
      [...a.order].sort((x, y) => x - y),
      SYSTEMS.map((_, i) => i),
    );
  });

  test('each repair scores more than the last and lights the next offline system', () => {
    const w = createWorld(seeded(1));
    for (let n = 1; n <= 3; n++) {
      const score = w.score;
      repairActive(w);
      assert.ok(w.score - score >= n * SCORE.repair);
      assert.equal(w.online[w.order[w.active]], false);
    }
    assert.match(w.say, /ONLINE/);
  });

  test('all twelve systems online pays Fully Operational and resets the board', () => {
    const w = createWorld(seeded(2));
    for (let i = 0; i < SYSTEMS.length; i++) repairActive(w);
    assert.equal(w.repaired, SYSTEMS.length);
    assert.ok(w.score >= SCORE.operational);
    assert.ok(w.online.every((on) => !on));
  });

  test('Hull lights an outlane save', () => {
    const w = createWorld(seeded(3));
    w.order = [
      SYSTEMS.findIndex((s) => s.kind === 'sling'),
      ...w.order.filter((i) => SYSTEMS[i].kind !== 'sling'),
    ];
    w.active = 0;
    repairActive(w);
    assert.equal(w.outSave, 1);
  });

  test('a drain inside the ball save serves the ball again', () => {
    const w = createWorld(seeded(1));
    hit(w, 'launch', 0, w.balls[0]);
    assert.equal(w.saveT, BALL_SAVE_T);
    drainAll(w);
    assert.equal(w.say, 'BALL SAVED');
    assert.equal(w.lost, false);
    for (let i = 0; i < 60; i++) stepWorld(w, IDLE, DT);
    assert.equal(w.balls.length, 1);
    assert.equal(w.ballNo, 1);
  });

  test('a drain with no save left loses the ball, counts the bonus, and ends after the last', () => {
    const w = createWorld(seeded(1));
    for (let n = 1; n <= BALLS; n++) {
      drainAll(w);
      assert.equal(w.lost, true);
      w.ballBugs = 2;
      w.mult = 2;
      const score = w.score;
      loseBall(w);
      assert.equal(w.score - score, 2 * SCORE.bonusBug * 2);
      assert.equal(w.mult, 1);
      if (n < BALLS) for (let i = 0; i < 120; i++) stepWorld(w, IDLE, DT);
    }
    assert.equal(w.phase, 'over');
    tick(w, IDLE, 5);
    assert.equal(w.ended, true);
  });

  test('the extra ball comes once, at its score', () => {
    const w = createWorld(seeded(1));
    w.score = EXTRA_BALL_AT - 1;
    hit(w, 'bumper', 0, null);
    hit(w, 'bumper', 0, null);
    assert.equal(w.extra, 1);
    assert.equal(w.say, 'EXTRA BALL');
  });

  test('the S-H-I-P lanes raise the bonus multiplier, and flippers move the lit lanes', () => {
    const w = createWorld(seeded(1));
    for (let lane = 0; lane < 4; lane++) hit(w, 'lane', lane, null);
    assert.equal(w.mult, 2);
    hit(w, 'lane', 0, null);
    tick(w, { ...IDLE, rightPressed: true }, DT);
    assert.deepEqual(w.lanes, [false, true, false, false]);
  });

  test('the skill shot pays for the blinking lane right after launch', () => {
    const w = createWorld(seeded(1));
    hit(w, 'launch', 0, w.balls[0]);
    const score = w.score;
    hit(w, 'lane', w.skillLane, null);
    assert.equal(w.score - score, SCORE.skill + SCORE.lane);
  });

  test('ramps and loops in quick succession combo', () => {
    const w = createWorld(seeded(1));
    w.time = 10;
    hit(w, 'loop', 1, null);
    w.time = 11;
    const score = w.score;
    hit(w, 'loop', 1, null);
    assert.equal(w.score - score, SCORE.loop * 2);
  });

  test('two hangar locks start Twin Mode, which ends when one ball is left', () => {
    const w = createWorld(seeded(1));
    hit(w, 'lock', 0, null);
    assert.equal(w.twin, false);
    hit(w, 'lock', 0, null);
    assert.equal(w.twin, true);
    stepWorld(w, IDLE, DT);
    assert.equal(w.balls.length, 3);
    const jackpot = w.jackpot;
    hit(w, 'ramp', 0, null);
    assert.equal(w.jackpot, jackpot + SCORE.jackpotStep);
    w.balls.pop();
    hit(w, 'drain', 0, null);
    assert.equal(w.twin, true);
    w.balls.pop();
    hit(w, 'drain', 0, null);
    assert.equal(w.twin, false);
  });

  test("Easter Eggs opens Benjo's Quarters after three repairs, and its clock sends the ball back", () => {
    const w = createWorld(seeded(4), { reducedMotion: true });
    hit(w, 'egg', 0, null);
    assert.equal(w.gotoDeck, null);
    for (let i = 0; i < QUARTERS_REPAIRS; i++) repairActive(w);
    assert.equal(eggLit(w), true);
    hit(w, 'egg', 0, null);
    assert.equal(w.gotoDeck, 'quarters');
    stepWorld(w, IDLE, DT);
    assert.equal(w.deck, 'quarters');
    assert.equal(w.quartersT, QUARTERS_T);
    w.quartersT = DT / 2;
    stepWorld(w, IDLE, DT);
    assert.equal(w.deck, 'bridge');
  });

  test('B-E-N-J-O pays its bonus once all five letters are lit', () => {
    const w = createWorld(seeded(1));
    const score = w.score;
    for (let id = 0; id < 5; id++) hit(w, 'letter', id, null);
    assert.equal(w.score - score, 5 * SCORE.letter + SCORE.benjo);
    assert.ok(w.letters.every((on) => !on));
  });

  test('too many nudges warn, then tilt, and a tilted ball scores nothing', () => {
    const w = createWorld(seeded(1));
    for (let i = 0; i < NUDGE_WARN; i++) hit(w, 'nudge', 0, null);
    assert.equal(w.say, 'TILT WARNING');
    hit(w, 'nudge', 0, null);
    assert.equal(w.tilted, true);
    const score = w.score;
    hit(w, 'bumper', 0, null);
    assert.equal(w.score, score);
    drainAll(w);
    assert.equal(w.lost, true);
  });
});
