// @ts-check
// Uptime Tower (#95): the GameModule. Wires host input, the world, drawing, and the HUD.
//
// The world keeps Benjo's, the view's, and each bug's previous spot, so a single world mutated in
// place is enough for render(alpha) to interpolate, and nothing in the update path allocates.
//
// Power-ups (#22): the magnet and the Digital Twin reach the world through `powers`, collect()
// clears every bug, and snapshot()/restore() copy the run for Rollback.

import { freezeWorld, thawWorld } from '../../shell/world-copy.js';
import { createIntent, createTracker, readIntent, resetTracker } from './controls.js';
import { drawFrame } from './draw.js';
import { HOW_TO } from './howto.js';
import {
  DEATH_PAUSE,
  EVENT_COMBO,
  EVENT_HIT,
  EVENT_JUMP,
  EVENT_LAND,
  EVENT_ORB,
  HINT_T,
  NEW_BEST_T,
  STATUS_T,
} from './tuning.js';
import { clearBugs, createWorld, resizeWorld, stepWorld } from './world.js';

/** @typedef {import('../../contracts').GameModule} GameModule */
/** @typedef {import('../../contracts').GameInstance} GameInstance */
/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').AudioCue} AudioCue */
/** @typedef {import('./world.js').World} World */
/** @typedef {import('./world.js').Powers} Powers */
/**
 * @typedef {{ world: Omit<World, 'random'>, statusT: number, cheered: boolean,
 *   seenWidth: number, seenHeight: number }} Snapshot
 */

/** World events and their sounds, most important first. One cue plays per step. */
/** @type {Array<[number, AudioCue]>} */
const CUES = [
  [EVENT_HIT, 'hit'],
  [EVENT_COMBO, 'clear'],
  [EVENT_ORB, 'pickup'],
  [EVENT_JUMP, 'jump'],
  [EVENT_LAND, 'land'],
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
const HINT_KEYS = 'ARROWS TO RUN, SPACE TO JUMP';
const HINT_TOUCH = 'PRESS TO JUMP, HOLD TO RUN';
const NEW_BEST = 'NEW BEST';
const SCORE_LABEL = 'SCORE';
const REASON_BUG = 'A bug caught Benjo on the way up.';
const REASON_FALL = 'Benjo fell behind the climb.';

/**
 * @param {HostContext} host
 * @returns {GameInstance}
 */
function createTower(host) {
  /** @type {World | null} */
  let world = null;
  const tracker = createTracker();
  const intent = createIntent();
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

  /** Re-lay the world out when the host resized the canvas. */
  function syncLayout() {
    const { width, height } = host.size;
    if (!world || (width === seenWidth && height === seenHeight)) return;
    seenWidth = width;
    seenHeight = height;
    resizeWorld(world, host.size);
  }

  /** @param {World} w @param {number} dt */
  function syncHud(w, dt) {
    if (w.score !== lastScore) {
      lastScore = w.score;
      host.setScore(lastScore);
    }
    if (!cheered && best > 0 && w.score > best) {
      cheered = true;
      showStatus(NEW_BEST, NEW_BEST_T);
      return;
    }
    if (w.events & EVENT_COMBO) {
      showStatus(`COMBO ${w.lastCombo} FLOORS`, STATUS_T);
      return;
    }
    if (statusT <= 0) return;
    statusT -= dt;
    if (statusT <= 0) host.setStatus('');
  }

  /** @param {HostContext['input']} input */
  function reset(input) {
    resetTracker(tracker, input);
    intent.px = null;
  }

  return {
    start() {
      world = createWorld(host.size, host.random, { reducedMotion: host.reducedMotion });
      seenWidth = host.size.width;
      seenHeight = host.size.height;
      paused = false;
      ended = false;
      cheered = false;
      best = host.storage.getNumber(BEST_KEY, 0);
      reset(host.input);
      lastScore = 0;
      host.setScore(0);
      showStatus(host.input.touch ? HINT_TOUCH : HINT_KEYS, HINT_T);
    },

    update(dt) {
      if (!world || paused || ended) return;
      syncLayout();
      powers.magnet = Boolean(host.power?.active('magnet'));
      stepWorld(world, readIntent(host.input, tracker, world.time, intent), dt, powers);
      playCue(host, world.events);
      syncHud(world, dt);
      host.track?.(world.ox + world.x * world.k, world.bottom - (world.y - world.camY) * world.k);
      if (world.dead && world.deadT >= DEATH_PAUSE) {
        ended = true;
        const reason = world.hit === 'fall' ? REASON_FALL : REASON_BUG;
        host.end({ score: world.score, scoreLabel: SCORE_LABEL, reason });
      }
    },

    render(alpha) {
      if (world) drawFrame(host, world, alpha);
    },

    pause() {
      paused = true;
    },

    resume() {
      paused = false;
      reset(host.input);
    },

    destroy() {
      ended = true;
      world = null;
    },

    collect() {
      return world ? clearBugs(world) : 0;
    },

    snapshot() {
      if (!world) return null;
      /** @type {Snapshot} */
      const snap = { world: freezeWorld(world), statusT, cheered, seenWidth, seenHeight };
      return snap;
    },

    restore(saved) {
      const snap = /** @type {Snapshot | null} */ (saved);
      if (!snap) return;
      world = thawWorld(snap.world, host.random);
      statusT = snap.statusT;
      cheered = snap.cheered;
      seenWidth = snap.seenWidth;
      seenHeight = snap.seenHeight;
      ended = false;
      reset(host.input);
      lastScore = world.score;
      host.setScore(lastScore);
    },
  };
}

/** @type {GameModule} */
const tower = {
  id: 'tower',
  name: 'Uptime Tower',
  controls: {
    keyboard: HINT_KEYS,
    touch: HINT_TOUCH,
  },
  howTo: HOW_TO,
  bestKey: BEST_KEY,
  create: createTower,
  powers: ['twin', 'rollback', 'gc', 'magnet'],
};

export default tower;
