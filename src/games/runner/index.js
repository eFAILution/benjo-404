// @ts-check
// Benjo Run: the GameModule. Wires host input, the pure world, effects, drawing, and the HUD.
//
// Two worlds are double-buffered: each update writes the next state into the spare one, then
// the two swap. The older one is what render(alpha) interpolates from, and nothing in the
// update path allocates.

import { createIntent, createTracker, readIntent, resetTracker } from './controls.js';
import { drawFrame } from './draw.js';
import { createFx, stepFx } from './fx.js';
import { contentAspect } from './sprite-bounds.js';
import { DEATH_PAUSE, HINT_T, NEW_BEST_T } from './tuning.js';
import { cloneWorld, createWorld, resizeWorld, stepWorld } from './world.js';

/** @typedef {import('../../contracts').GameModule} GameModule */
/** @typedef {import('../../contracts').GameInstance} GameInstance */
/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('./world.js').World} World */

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
      const next = stepWorld(current, intent, dt, spare);
      spare = current;
      current = next;
      stepFx(fx, current, dt);
      syncHud(current, dt);
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
  bestKey: BEST_KEY,
  create: createRun,
};

export default runner;
