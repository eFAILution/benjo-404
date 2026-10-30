// @ts-check
// The rules (ADR-0076 section 2): scoring, the twin health board, S-H-I-P lanes, the skill shot,
// combos, Twin Mode, ball save, tilt, Benjo's Quarters, and the end of each ball. table.js reports
// every hit here. Rules never move balls themselves: they ask table.js through `serveT`,
// `gotoDeck`, and `addBalls`.

import { add, combo, cue, eggLit, mission, say } from './score.js';
import {
  BALL_SAVE_T,
  BALLS,
  DRAIN_PAUSE,
  END_PAUSE,
  MULT_MAX,
  NUDGE_WARN,
  NUDGE_WINDOW,
  QUARTERS_T,
  SCORE,
  SHAKE_T,
  SKILL_T,
  SYSTEMS,
} from './tuning.js';

/** @typedef {import('./physics.js').Ball} Ball */
/** @typedef {import('./decks.js').DeckId} DeckId */
/**
 * @typedef {{
 *   score: number, ballNo: number, extra: number, phase: 'play' | 'over', phaseT: number,
 *   fresh: boolean, saveT: number, outSave: number, skillLane: number, skillT: number,
 *   lanes: boolean[], mult: number, order: number[], active: number, progress: number,
 *   online: boolean[], repaired: number, ballRepairs: number, squashed: number, ballBugs: number,
 *   locks: number, twin: boolean, jackpot: number, combo: number, comboAt: number,
 *   nudges: number[], tilted: boolean, quartersT: number, letters: boolean[], eggAt: number,
 *   say: string, sayN: number, serveT: number, serveAuto: boolean, gotoDeck: DeckId | null,
 *   addBalls: number, lost: boolean, ended: boolean, endReason: string
 * }} Rules
 * The parts of the world the rules read besides their own.
 * @typedef {Rules & { random: () => number, time: number, deck: DeckId, balls: Ball[], drops: boolean[],
 *   cues: string[], pops: Array<{ x: number, y: number, text: string, t: number }>,
 *   shake: number, flash: number, bugs: unknown[] }} RulesWorld
 */

/** @param {RulesWorld} w */
export function startRules(w) {
  const order = SYSTEMS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(w.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  Object.assign(w, {
    score: 0,
    ballNo: 1,
    extra: 0,
    phase: 'play',
    phaseT: 0,
    fresh: true,
    saveT: 0,
    outSave: 0,
    skillLane: -1,
    skillT: 0,
    lanes: [false, false, false, false],
    mult: 1,
    order,
    active: 0,
    progress: 0,
    online: SYSTEMS.map(() => false),
    repaired: 0,
    ballRepairs: 0,
    squashed: 0,
    ballBugs: 0,
    locks: 0,
    twin: false,
    jackpot: SCORE.jackpot,
    combo: 0,
    comboAt: -99,
    nudges: [],
    tilted: false,
    quartersT: 0,
    letters: [false, false, false, false, false],
    eggAt: 0,
    say: '',
    sayN: 0,
    serveT: 0,
    serveAuto: false,
    gotoDeck: null,
    addBalls: 0,
    lost: false,
    ended: false,
    endReason: '',
  });
}

/** @param {RulesWorld} w @param {number} id @param {Ball | null} ball */
function lane(w, id, ball) {
  if (w.skillT > 0 && id === w.skillLane) {
    add(w, SCORE.skill, ball);
    say(w, 'CLEAN DEPLOY');
    cue(w, 'jackpot');
  }
  w.skillT = 0;
  w.lanes[id] = true;
  add(w, SCORE.lane, ball);
  cue(w, 'lane');
  if (!w.lanes.every(Boolean)) return;
  w.lanes.fill(false);
  w.mult = Math.min(MULT_MAX, w.mult + 1);
  say(w, `SHIP ${w.mult}X`);
  cue(w, 'target');
  mission(w, 'ship', 0, ball);
}

/** @param {RulesWorld} w @param {Ball | null} ball */
function lock(w, ball) {
  add(w, SCORE.lock, ball);
  cue(w, 'lock');
  mission(w, 'lock', 0, ball);
  if (w.twin) return;
  w.locks += 1;
  if (w.locks < 2) {
    say(w, 'HANGAR LOCK 1');
    return;
  }
  w.locks = 0;
  w.twin = true;
  w.addBalls = 2;
  w.saveT = Math.max(w.saveT, BALL_SAVE_T * 0.8);
  say(w, 'TWIN MODE');
  cue(w, 'twin');
}

/** @param {RulesWorld} w @param {Ball | null} ball */
function ramp(w, ball) {
  const times = combo(w);
  mission(w, 'ramp', 0, ball);
  if (w.twin) {
    add(w, w.jackpot * times, ball);
    w.jackpot += SCORE.jackpotStep;
    say(w, 'JACKPOT');
    cue(w, 'jackpot');
    w.flash = SHAKE_T;
    return;
  }
  add(w, SCORE.ramp * times, ball);
  if (!w.tilted) say(w, 'TO THE BRIDGE');
  cue(w, 'ramp');
}

/** @param {RulesWorld} w @param {Ball | null} ball */
function egg(w, ball) {
  if (!eggLit(w)) {
    add(w, SCORE.stand, ball);
    cue(w, 'target');
    return;
  }
  w.eggAt = w.repaired;
  add(w, SCORE.egg, ball);
  w.quartersT = QUARTERS_T;
  w.letters.fill(false);
  w.gotoDeck = 'quarters';
  say(w, "BENJO'S QUARTERS");
  cue(w, 'repair');
}

/** @param {RulesWorld} w @param {number} id @param {Ball | null} ball */
function letter(w, id, ball) {
  if (w.letters[id]) return;
  w.letters[id] = true;
  add(w, SCORE.letter, ball);
  cue(w, 'target');
  if (!w.letters.every(Boolean)) return;
  w.letters.fill(false);
  add(w, SCORE.benjo, ball);
  say(w, 'B-E-N-J-O!');
  cue(w, 'jackpot');
}

/** Three nudges inside the window warn; one more tilts. @param {RulesWorld} w */
function nudged(w) {
  w.nudges = [...w.nudges.filter((t) => w.time - t < NUDGE_WINDOW), w.time];
  cue(w, 'nudge');
  if (w.nudges.length === NUDGE_WARN) {
    say(w, 'TILT WARNING');
    cue(w, 'tilt');
  } else if (w.nudges.length > NUDGE_WARN) {
    w.tilted = true;
    say(w, 'TILT');
    cue(w, 'tilt');
  }
}

/** @param {RulesWorld} w @param {Ball | null} ball */
function drained(w, ball) {
  const left = w.balls.length;
  if (left === 1 && w.twin) {
    w.twin = false;
    say(w, 'TWIN MODE OVER');
  }
  if (left > 0 || w.phase !== 'play') return;
  cue(w, 'drain');
  const outlane = ball !== null && (ball.x < 46 || ball.x > 328);
  if (!w.tilted && w.saveT > 0) return saveBall(w, 'BALL SAVED');
  if (!w.tilted && outlane && w.outSave > 0) {
    w.outSave -= 1;
    return saveBall(w, 'HULL SAVE');
  }
  w.lost = true;
}

/** A drained ball comes straight back. @param {RulesWorld} w @param {string} text */
export function saveBall(w, text) {
  say(w, text);
  w.serveT = 0.4;
  w.serveAuto = true;
  w.lost = false;
}

/** The ball is gone for good: count the bonus, then serve the next one or end. @param {RulesWorld} w */
export function loseBall(w) {
  w.lost = false;
  const bonus = w.tilted
    ? 0
    : (w.ballRepairs * SCORE.bonusRepair + w.ballBugs * SCORE.bonusBug) * w.mult;
  add(w, bonus);
  Object.assign(w, {
    mult: 1,
    ballRepairs: 0,
    ballBugs: 0,
    tilted: false,
    nudges: [],
    twin: false,
  });
  w.lanes.fill(false);
  w.ballNo += 1;
  if (w.ballNo > BALLS + w.extra) {
    w.phase = 'over';
    w.phaseT = END_PAUSE;
    w.endReason = 'All three hulls breached.';
    say(w, 'SHIP LOST');
    return;
  }
  say(w, bonus ? `BONUS ${bonus}` : `BALL ${w.ballNo}`);
  w.serveT = DRAIN_PAUSE;
  w.serveAuto = false;
  w.fresh = true;
}

/**
 * Score one hit. `ball` is null for hits with no ball of their own, like a spinner tick.
 * @param {RulesWorld} w @param {string} kind @param {number} id @param {Ball | null} ball
 */
export function hit(w, kind, id, ball) {
  if (w.tilted && kind !== 'drain') return;
  if (kind !== 'lane' && kind !== 'launch' && kind !== 'spin') w.skillT = 0;
  switch (kind) {
    case 'launch':
      cue(w, 'launch');
      if (!w.fresh) return;
      w.fresh = false;
      w.saveT = BALL_SAVE_T;
      w.skillLane = Math.floor(w.random() * 4);
      w.skillT = SKILL_T;
      return;
    case 'bumper':
    case 'chair':
      add(w, SCORE.bumper, ball);
      cue(w, 'bumper');
      w.shake = Math.max(w.shake, SHAKE_T / 2);
      return mission(w, kind, id, ball);
    case 'sling':
      add(w, SCORE.sling, ball);
      cue(w, 'sling');
      return mission(w, kind, id, ball);
    case 'lane':
      return lane(w, id, ball);
    case 'loop':
      add(w, SCORE.loop * combo(w), ball);
      cue(w, 'ramp');
      mission(w, 'loop', id, ball);
      return id === 0 ? mission(w, 'loopL', 0, ball) : undefined;
    case 'spin':
      add(w, SCORE.spin);
      cue(w, 'spin');
      return mission(w, 'spin', 0, ball);
    case 'drop':
      add(w, SCORE.drop, ball);
      cue(w, 'target');
      if (w.drops.every(Boolean)) add(w, SCORE.bank, ball);
      return mission(w, 'drop', id, ball);
    case 'stand':
    case 'inlane':
      add(w, kind === 'stand' ? SCORE.stand : SCORE.inlane, ball);
      cue(w, kind === 'stand' ? 'target' : 'lane');
      return mission(w, kind, id, ball);
    case 'ramp':
      return ramp(w, ball);
    case 'lock':
      return lock(w, ball);
    case 'kick':
      return cue(w, 'sling');
    case 'egg':
      return egg(w, ball);
    case 'letter':
      return letter(w, id, ball);
    case 'bug':
      add(w, SCORE.bug, ball);
      w.squashed += 1;
      w.ballBugs += 1;
      return cue(w, 'squash');
    case 'nudge':
      return nudged(w);
    case 'drain':
      return drained(w, ball);
  }
}

/**
 * Rules that run on time: ball save, the skill shot, the Quarters clock, lane change, game over.
 * @param {RulesWorld} w @param {{ leftPressed: boolean, rightPressed: boolean }} intent @param {number} dt
 */
export function tick(w, intent, dt) {
  w.saveT = Math.max(0, w.saveT - dt);
  w.skillT = Math.max(0, w.skillT - dt);
  if (w.phase === 'over') {
    w.phaseT -= dt;
    w.ended = w.phaseT <= 0;
    return;
  }
  if (w.deck === 'quarters') w.quartersT -= dt;
  if (w.deck === 'quarters' && w.quartersT <= 0) w.gotoDeck = 'bridge';
  if (w.deck !== 'hull' || w.tilted) return;
  // The flippers move the lit S-H-I-P lanes, as on a real table.
  if (intent.leftPressed) w.lanes.push(/** @type {boolean} */ (w.lanes.shift()));
  if (intent.rightPressed) w.lanes.unshift(/** @type {boolean} */ (w.lanes.pop()));
}

/** Points for bugs a power-up squashed. @param {RulesWorld} w @param {number} count */
export function squash(w, count) {
  w.squashed += count;
  w.ballBugs += count;
  add(w, SCORE.bug * count);
}
