// @ts-check
// Cache Muncher: the GameModule. Wires host input, the world, drawing, and the HUD.
//
// The world keeps every actor's previous center, so a single world mutated in place is enough
// for render(alpha) to interpolate, and nothing in the update path allocates.

import { createTracker, readTurn, resetTracker } from './controls.js';
import { drawFrame } from './draw.js';
import { HOW_TO } from './howto.js';
import {
  DEATH_PAUSE,
  EVENT_BYTE,
  EVENT_HIT,
  EVENT_LEVEL,
  EVENT_MUNCH,
  EVENT_PELLET,
  HINT_T,
  NEW_BEST_T,
  STATUS_T,
} from './tuning.js';
import { createWorld, resizeWorld, screenX, screenY, stepWorld } from './world.js';

/** @typedef {import('../../contracts').GameModule} GameModule */
/** @typedef {import('../../contracts').GameInstance} GameInstance */
/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('./world.js').World} World */
/** @typedef {import('./world.js').Intent} Intent */
/** @typedef {import('../../contracts').AudioCue} AudioCue */

/** World events and their sounds, most important first. One cue plays per step. */
/** @type {Array<[number, AudioCue]>} */
const CUES = [
  [EVENT_HIT, 'hit'],
  [EVENT_LEVEL, 'clear'],
  [EVENT_MUNCH, 'score'],
  [EVENT_PELLET, 'pickup'],
  [EVENT_BYTE, 'land'],
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
const HINT_KEYS = 'ARROWS TO TURN';
const HINT_TOUCH = 'SWIPE OR TAP TO TURN';
const NEW_BEST = 'NEW BEST';
const CLEARED = 'CACHE CLEARED';
const SCORE_LABEL = 'SCORE';
const REASON = 'A cache miss caught Benjo.';

/**
 * @param {HostContext} host
 * @returns {GameInstance}
 */
function createMuncher(host) {
  /** @type {World | null} */
  let world = null;
  const tracker = createTracker();
  /** @type {Intent} */
  const intent = { dir: -1 };
  let paused = false;
  let ended = false;
  let lastScore = 0;
  let statusT = 0;
  let best = 0;
  let cheered = false;
  let seenWidth = 0;
  let seenHeight = 0;

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
    if (w.events & EVENT_HIT && !w.dead) {
      showStatus(`LIVES LEFT: ${w.lives}`, STATUS_T);
      return;
    }
    if (w.events & EVENT_LEVEL) {
      showStatus(`LEVEL ${w.level}`, STATUS_T);
      return;
    }
    if (w.events & EVENT_PELLET) {
      showStatus(CLEARED, STATUS_T);
      return;
    }
    if (statusT <= 0) return;
    statusT -= dt;
    if (statusT <= 0) host.setStatus('');
  }

  /** @param {World} w */
  function readIntent(w) {
    const x = screenX(w, w.benjo.x);
    const y = screenY(w, w.benjo.y);
    intent.dir = readTurn(host.input, tracker, w.time, x, y);
    return intent;
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
      stepWorld(world, readIntent(world), dt);
      playCue(host, world.events);
      syncHud(world, dt);
      if (world.dead && world.deadT >= DEATH_PAUSE) {
        ended = true;
        host.end({ score: world.score, scoreLabel: SCORE_LABEL, reason: REASON });
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
  };
}

/** @type {GameModule} */
const muncher = {
  id: 'muncher',
  name: 'Cache Muncher',
  controls: {
    keyboard: HINT_KEYS,
    touch: HINT_TOUCH,
  },
  howTo: HOW_TO,
  bestKey: BEST_KEY,
  create: createMuncher,
};

export default muncher;
