// @ts-check
// Dragon Tail: the GameModule. Wires host input, the world, drawing, and the HUD.
//
// The world keeps how far its last move has slid, so one world mutated in place is enough for
// render(alpha) to interpolate, and nothing in the update path allocates.

import { createTracker, readTurn, resetTracker } from './controls.js';
import { drawFrame } from './draw.js';
import { HOW_TO } from './howto.js';
import { DEATH_PAUSE, HINT_T, NEW_BEST_T } from './tuning.js';
import { centerX, centerY, createWorld, resizeWorld, stepWorld } from './world.js';

/** @typedef {import('../../contracts').GameModule} GameModule */
/** @typedef {import('../../contracts').GameInstance} GameInstance */
/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('./world.js').World} World */

const BEST_KEY = 'best';
const HINT = 'ARROWS TO TURN';
const NEW_BEST = 'NEW BEST';
const SCORE_LABEL = 'PAGES';
const REASONS = {
  wall: 'Benjo ran off the edge of the map.',
  tail: 'Benjo tripped over his own tail.',
  full: 'Benjo found every lost page.',
};

/**
 * @param {HostContext} host
 * @returns {GameInstance}
 */
function createTail(host) {
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
    if (statusT <= 0 || w.ready) return;
    statusT -= dt;
    if (statusT <= 0) host.setStatus('');
  }

  /** @param {World} w */
  function readInput(w) {
    const hx = centerX(w, w.xs[w.head]);
    const hy = centerY(w, w.ys[w.head]);
    return readTurn(host.input, tracker, w.time, hx, hy);
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
      showStatus(HINT, HINT_T);
    },

    update(dt) {
      if (!world || paused || ended) return;
      syncLayout();
      const { score, dead } = world;
      stepWorld(world, readInput(world), dt);
      // The snake's world raises no events, so the sound comes from what changed this step.
      if (world.dead && !dead) host.audio?.play(world.hit === 'full' ? 'clear' : 'hit');
      else if (world.score > score) host.audio?.play('pickup');
      syncHud(world, dt);
      if (world.dead && world.deadT >= DEATH_PAUSE) {
        ended = true;
        const reason = REASONS[world.hit ?? 'wall'];
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
      resetTracker(tracker, host.input);
    },

    destroy() {
      ended = true;
      world = null;
    },
  };
}

/** @type {GameModule} */
const tail = {
  id: 'tail',
  name: 'Dragon Tail',
  controls: {
    keyboard: 'ARROWS TO TURN',
    touch: 'SWIPE OR TAP TO TURN',
  },
  howTo: HOW_TO,
  bestKey: BEST_KEY,
  create: createTail,
};

export default tail;
