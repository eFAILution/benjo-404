// @ts-check
// Stack the Server: the GameModule. Wires host input, the world, drawing, and the HUD.
//
// The world keeps its own previous positions, so a single world mutated in place is enough for
// render(alpha) to interpolate, and nothing in the update path allocates.
//
// Power-ups (#22): the Digital Twin catches one missed block, Rollback rewinds a toppled stack,
// and the host's twin and ghost follow Benjo. There are no hazards to collect and nothing to pull.

import { freezeWorld, thawWorld } from '../../shell/world-copy.js';
import { createTracker, readDrop, resetTracker } from './controls.js';
import { benjoY, drawFrame } from './draw.js';
import { HOW_TO } from './howto.js';
import {
  DEATH_PAUSE,
  EVENT_LAND,
  EVENT_MISS,
  EVENT_PERFECT,
  EVENT_WIDEN,
  HINT_T,
  NEW_BEST_T,
  PERFECT_T,
} from './tuning.js';
import { createWorld, resizeWorld, stepWorld } from './world.js';

/** @typedef {import('../../contracts').GameModule} GameModule */
/** @typedef {import('../../contracts').GameInstance} GameInstance */
/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('./world.js').World} World */
/** @typedef {import('./world.js').Assist} Assist */
/**
 * Everything update and render read, copied deep for Rollback. The world's random is the host's,
 * so it is left out and put back on restore.
 * @typedef {{ world: Omit<World, 'random'>, lastScore: number, statusT: number, cheered: boolean,
 *   seenWidth: number, seenHeight: number }} Snapshot
 */
/** @typedef {import('../../contracts').AudioCue} AudioCue */

/** World events and their sounds, most important first. One cue plays per step. */
/** @type {Array<[number, AudioCue]>} */
const CUES = [
  [EVENT_MISS, 'hit'],
  [EVENT_WIDEN, 'pickup'],
  [EVENT_PERFECT, 'score'],
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
const HINT_KEYS = 'SPACE TO DROP';
const HINT_TOUCH = 'TAP TO DROP';
const NEW_BEST = 'NEW BEST';
const PERFECT = 'PERFECT';
const SCORE_LABEL = 'HEIGHT';
const REASON_MISS = 'The server stack toppled over.';

/**
 * @param {HostContext} host
 * @returns {GameInstance}
 */
function createStack(host) {
  /** @type {World | null} */
  let world = null;
  const tracker = createTracker();
  let paused = false;
  let ended = false;
  let lastScore = 0;
  let statusT = 0;
  let best = 0;
  let cheered = false;
  let seenWidth = 0;
  let seenHeight = 0;
  /** @type {Assist} */
  const assist = { absorb: () => host.power?.absorb() === true };

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
    if (w.events & EVENT_PERFECT) {
      showStatus(PERFECT, PERFECT_T);
      return;
    }
    if (statusT <= 0) return;
    statusT -= dt;
    if (statusT <= 0) host.setStatus('');
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
      resetTracker(tracker, host.input);
      lastScore = 0;
      host.setScore(0);
      showStatus(host.input.touch ? HINT_TOUCH : HINT_KEYS, HINT_T);
    },

    update(dt) {
      if (!world || paused || ended) return;
      syncLayout();
      stepWorld(world, readDrop(host.input, tracker, world.time), dt, assist);
      host.track?.(world.benjoX, benjoY(world));
      playCue(host, world.events);
      syncHud(world, dt);
      if (world.dead && world.deadT >= DEATH_PAUSE) {
        ended = true;
        host.end({ score: world.score, scoreLabel: SCORE_LABEL, reason: REASON_MISS });
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
      resetTracker(tracker, host.input);
    },

    destroy() {
      ended = true;
      world = null;
    },

    snapshot() {
      if (!world) return null;
      /** @type {Snapshot} */
      const snap = {
        world: freezeWorld(world),
        lastScore,
        statusT,
        cheered,
        seenWidth,
        seenHeight,
      };
      return snap;
    },

    restore(value) {
      if (!value) return;
      const snap = /** @type {Snapshot} */ (value);
      world = thawWorld(snap.world, host.random);
      ({ lastScore, statusT, cheered, seenWidth, seenHeight } = snap);
      ended = false;
      // The press that died is not a drop in the restored run.
      resetTracker(tracker, host.input);
      host.setScore(lastScore);
    },
  };
}

/** @type {GameModule} */
const stack = {
  id: 'stack',
  name: 'Stack the Server',
  controls: {
    keyboard: HINT_KEYS,
    touch: HINT_TOUCH,
  },
  howTo: HOW_TO,
  bestKey: BEST_KEY,
  create: createStack,
  powers: ['twin', 'rollback'],
};

export default stack;
