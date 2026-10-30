// @ts-check
// Scoring helpers the rules share: points, status words, cues, and the twin health board's
// repairs (ADR-0076 section 2).

import {
  COMBO_MAX,
  COMBO_T,
  EXTRA_BALL_AT,
  POP_T,
  QUARTERS_REPAIRS,
  SCORE,
  SHAKE_T,
  SYSTEMS,
} from './tuning.js';

/** @typedef {import('./physics.js').Ball} Ball */
/** @typedef {import('./rules.js').Rules} Rules */
/** @typedef {import('./rules.js').RulesWorld} RulesWorld */

/** The system that is offline now. @param {Rules} w */
export const activeSystem = (w) => SYSTEMS[w.order[w.active]];

/** Is the way to Benjo's Quarters open? @param {Rules} w */
export const eggLit = (w) => w.repaired - w.eggAt >= QUARTERS_REPAIRS;

/** @param {RulesWorld} w @param {string} text */
export function say(w, text) {
  w.say = text;
  w.sayN += 1;
}

/** @param {RulesWorld} w @param {string} cue */
export const cue = (w, cue) => w.cues.push(cue);

/**
 * Score points. Big ones also float up from the ball.
 * @param {RulesWorld} w @param {number} points @param {Ball | null} [ball]
 */
export function add(w, points, ball) {
  w.score += points;
  if (ball && points >= 10000)
    w.pops.push({ x: ball.x, y: ball.y, text: String(points), t: POP_T });
  if (!w.extra && w.score >= EXTRA_BALL_AT) {
    w.extra = 1;
    say(w, 'EXTRA BALL');
    cue(w, 'extra');
  }
}

/** The next system still offline after the active one. @param {Rules} w */
function nextOffline(w) {
  for (let i = 1; i <= w.order.length; i++) {
    const at = (w.active + i) % w.order.length;
    if (!w.online[w.order[at]]) return at;
  }
  return w.active;
}

/** @param {RulesWorld} w @param {Ball | null} ball */
function repair(w, ball) {
  const index = w.order[w.active];
  const system = SYSTEMS[index];
  w.online[index] = true;
  w.repaired += 1;
  w.ballRepairs += 1;
  add(w, w.repaired * SCORE.repair, ball);
  if (system.kind === 'sling') w.outSave += 1;
  say(w, `${system.name.toUpperCase()} ONLINE`);
  cue(w, 'repair');
  w.flash = SHAKE_T;
  w.progress = 0;
  if (w.online.every(Boolean)) {
    add(w, SCORE.operational, ball);
    say(w, 'FULLY OPERATIONAL');
    cue(w, 'jackpot');
    w.online.fill(false);
  }
  w.active = nextOffline(w);
}

/**
 * Count a shot toward the system that is offline.
 * @param {RulesWorld} w @param {string} kind @param {number} id @param {Ball | null} ball
 */
export function mission(w, kind, id, ball) {
  const system = activeSystem(w);
  if (system.kind !== kind) return;
  w.progress = system.ids ? w.progress | (1 << id) : w.progress + 1;
  const count = system.ids ? w.progress.toString(2).replace(/0/g, '').length : w.progress;
  if (count >= system.need) repair(w, ball);
}

/** Ramps and loops in quick succession multiply. @param {RulesWorld} w */
export function combo(w) {
  w.combo = w.time - w.comboAt < COMBO_T ? Math.min(COMBO_MAX, w.combo + 1) : 1;
  w.comboAt = w.time;
  if (w.combo > 1) say(w, `COMBO ${w.combo}X`);
  return w.combo;
}
