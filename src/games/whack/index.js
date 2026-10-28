// @ts-check
// Whack-a-Bug: the GameModule. Wires host input, the world, drawing, and the HUD.
// A 45 second round: squash bugs as they pop out of the code, leave the features alone.
//
// Power-ups (#22): the Digital Twin forgives one costly mistake, the Garbage Collector squashes
// every bug that is up, and the magnet pops bugs up next to Benjo. Rollback is left out: the
// round always ends on the clock, so rewinding it would only replay the last seconds.

import { createTracker, readWhack, resetTracker } from './controls.js';
import { drawFrame } from './draw.js';
import {
  COMBO_SHOW,
  COMBO_T,
  DECOY_T,
  END_T,
  EVENT_DECOY,
  EVENT_SQUASH,
  EVENT_WHIFF,
  HINT_T,
  NEW_BEST_T,
} from './tuning.js';
import { createWorld, resizeWorld, stepWorld, zapBugs } from './world.js';

/** @typedef {import('../../contracts').GameModule} GameModule */
/** @typedef {import('../../contracts').GameInstance} GameInstance */
/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('./world.js').World} World */
/** @typedef {import('./world.js').Assist} Assist */
/** @typedef {import('../../contracts').AudioCue} AudioCue */

/** World events and their sounds, most important first. One cue plays per step. */
/** @type {Array<[number, AudioCue]>} */
const CUES = [
  [EVENT_DECOY, 'hit'],
  [EVENT_SQUASH, 'score'],
  [EVENT_WHIFF, 'turn'],
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
const HINT_KEYS = 'ARROWS OR SPACE TO WHACK';
const HINT_TOUCH = 'TAP A BUG TO WHACK IT';
const NEW_BEST = 'NEW BEST';
const DECOY = 'THAT WAS A FEATURE';
const SCORE_LABEL = 'SQUASHED';
const REASON_TIME = "Time's up. The bugs crawled back in.";

/**
 * @param {HostContext} host
 * @returns {GameInstance}
 */
function createWhack(host) {
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
  const assist = { absorb: () => host.power?.absorb() === true, magnet: false };

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

  /** @param {World} w */
  function syncScore(w) {
    if (w.score === lastScore) return;
    lastScore = w.score;
    host.setScore(lastScore);
  }

  /** @param {World} w @param {number} dt */
  function syncHud(w, dt) {
    syncScore(w);
    if (!cheered && best > 0 && w.score > best) {
      cheered = true;
      showStatus(NEW_BEST, NEW_BEST_T);
      return;
    }
    if (w.events & EVENT_DECOY) {
      showStatus(DECOY, DECOY_T);
      return;
    }
    if (w.events & EVENT_SQUASH && w.combo >= COMBO_SHOW) {
      showStatus(`COMBO ${w.combo}`, COMBO_T);
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
      assist.magnet = host.power?.active('magnet') === true;
      stepWorld(world, readWhack(host.input, tracker, world.time, world), dt, assist);
      playCue(host, world.events);
      syncHud(world, dt);
      if (world.dead && world.deadT >= END_T) {
        ended = true;
        host.end({ score: world.score, scoreLabel: SCORE_LABEL, reason: REASON_TIME });
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

    collect() {
      if (!world || ended) return 0;
      const zapped = zapBugs(world);
      if (zapped > 0) host.audio?.play('clear');
      syncScore(world);
      return zapped;
    },
  };
}

/** @type {GameModule} */
const whack = {
  id: 'whack',
  name: 'Whack-a-Bug',
  controls: {
    keyboard: HINT_KEYS,
    touch: HINT_TOUCH,
  },
  bestKey: BEST_KEY,
  create: createWhack,
  powers: ['twin', 'gc', 'magnet'],
};

export default whack;
