// @ts-check
// Benjo Run: the GameModule. Wires host input, the pure world, effects, drawing, and the HUD.
//
// Two worlds are double-buffered: each update writes the next state into the spare one, then
// the two swap. The older one is what render(alpha) interpolates from, and nothing in the
// update path allocates.
//
// Power-ups (#22): the magnet and the Digital Twin reach the world through `powers`, collect()
// clears the hazards on screen, and snapshot()/restore() copy the run for Rollback.

import { freezeWorld, thawWorld } from '../../shell/world-copy.js';
import { createIntent, createTracker, readIntent, resetTracker } from './controls.js';
import { drawFrame } from './draw.js';
import { createFx, stepFx } from './fx.js';
import { HOW_TO } from './howto.js';
import { contentAspect } from './sprite-bounds.js';
import {
  DEATH_PAUSE,
  EVENT_HIT,
  EVENT_JUMP,
  EVENT_PICKUP,
  GROUND_FRAC,
  HINT_T,
  NEW_BEST_T,
} from './tuning.js';
import { clearObstacles, cloneWorld, createWorld, resizeWorld, stepWorld } from './world.js';

/** @typedef {import('../../contracts').GameModule} GameModule */
/** @typedef {import('../../contracts').GameInstance} GameInstance */
/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('./world.js').World} World */
/** @typedef {import('../../contracts').AudioCue} AudioCue */
/** @typedef {import('./world.js').Powers} Powers */
/** @typedef {import('./fx.js').Fx} Fx */
/**
 * @typedef {{ world: Omit<World, 'random'>, fx: Fx, statusT: number, cheered: boolean,
 *   seenWidth: number, seenHeight: number }} Snapshot
 */

/** World events and their sounds, most important first. One cue plays per step. */
/** @type {Array<[number, AudioCue]>} */
const CUES = [
  [EVENT_HIT, 'hit'],
  [EVENT_PICKUP, 'pickup'],
  [EVENT_JUMP, 'jump'],
];

/**
 * @param {HostContext} host
 * @param {number} events
 */
function playCue(host, events) {
  const match = CUES.find(([bit]) => events & bit);
  if (match) host.audio?.play(match[1]);
}

const BEST_KEY = 'best';
const HINT = 'SPACE OR TAP TO JUMP';
const NEW_BEST = 'NEW BEST';
const SCORE_LABEL = 'DISTANCE';
const REASON = 'Benjo hit a broken link.';

/**
 * @param {HostContext} host
 * @returns {GameInstance}
 */
function createRun(host) {
  /** @type {World | null} */
  let current = null;
  /** @type {World | null} */
  let spare = null;
  let fx = createFx();
  const intent = createIntent();
  const tracker = createTracker();
  let paused = false;
  let ended = false;
  let lastScore = 0;
  let statusT = 0;
  let best = 0;
  let cheered = false;
  let seenWidth = 0;
  let seenHeight = 0;
  /** @type {Required<Powers>} */
  const powers = { magnet: false, absorb: () => host.power?.absorb() ?? false };

  /** @param {string} text @param {number} seconds */
  function showStatus(text, seconds) {
    host.setStatus(text);
    statusT = seconds;
  }

  /** Re-lay the world out when the host resized the canvas. Rare, so it may allocate. */
  function syncLayout() {
    const { width, height } = host.size;
    if (!current || (width === seenWidth && height === seenHeight)) return;
    seenWidth = width;
    seenHeight = height;
    current = resizeWorld(current, host.size);
    spare = cloneWorld(current);
  }

  /** @param {World} world @param {number} dt */
  function syncHud(world, dt) {
    if (world.score !== lastScore) {
      lastScore = world.score;
      host.setScore(lastScore);
    }
    if (!cheered && best > 0 && world.score > best) {
      cheered = true;
      showStatus(NEW_BEST, NEW_BEST_T);
      return;
    }
    if (statusT <= 0) return;
    statusT -= dt;
    if (statusT <= 0) host.setStatus('');
  }

  return {
    start() {
      current = createWorld(host.size, host.random, {
        reducedMotion: host.reducedMotion,
        hazardAspects: host.theme.sprites.hazards.map(contentAspect),
      });
      spare = cloneWorld(current);
      fx = createFx();
      seenWidth = host.size.width;
      seenHeight = host.size.height;
      paused = false;
      ended = false;
      cheered = false;
      best = host.storage.getNumber(BEST_KEY, 0);
      resetTracker(tracker, host.input);
      lastScore = 0;
      host.setScore(0);
      showStatus(HINT, HINT_T);
    },

    update(dt) {
      if (!current || !spare || paused || ended) return;
      syncLayout();
      readIntent(host.input, intent, tracker, current.time);
      powers.magnet = Boolean(host.power?.active('magnet'));
      const next = stepWorld(current, intent, dt, spare, powers);
      playCue(host, next.events);
      spare = current;
      current = next;
      stepFx(fx, current, dt);
      syncHud(current, dt);
      const groundY = Math.round(current.height * GROUND_FRAC);
      host.track?.(current.benjoX, groundY - current.by - current.benjoH / 2);
      if (current.dead && current.deadT >= DEATH_PAUSE) {
        ended = true;
        host.end({ score: current.score, scoreLabel: SCORE_LABEL, reason: REASON });
      }
    },

    render(alpha) {
      if (current && spare) drawFrame(host, spare, current, alpha, fx);
    },

    pause() {
      paused = true;
    },

    resume() {
      paused = false;
      resetTracker(tracker, host.input);
    },

    destroy() {
      ended = true;
      current = null;
      spare = null;
    },

    collect() {
      return current ? clearObstacles(current) : 0;
    },

    snapshot() {
      if (!current) return null;
      /** @type {Snapshot} */
      const snap = {
        world: freezeWorld(current),
        fx: structuredClone(fx),
        statusT,
        cheered,
        seenWidth,
        seenHeight,
      };
      return snap;
    },

    restore(saved) {
      const snap = /** @type {Snapshot | null} */ (saved);
      if (!snap) return;
      current = thawWorld(snap.world, host.random);
      spare = cloneWorld(current);
      fx = structuredClone(snap.fx);
      statusT = snap.statusT;
      cheered = snap.cheered;
      seenWidth = snap.seenWidth;
      seenHeight = snap.seenHeight;
      ended = false;
      resetTracker(tracker, host.input);
      lastScore = current.score;
      host.setScore(lastScore);
    },
  };
}

/** @type {GameModule} */
const runner = {
  id: 'runner',
  name: 'Benjo Run',
  controls: {
    keyboard: 'SPACE OR UP TO JUMP, DOWN TO DUCK',
    touch: 'TAP TO JUMP, SWIPE DOWN TO DUCK',
  },
  howTo: HOW_TO,
  bestKey: BEST_KEY,
  create: createRun,
  powers: ['twin', 'rollback', 'gc', 'magnet'],
};

export default runner;
