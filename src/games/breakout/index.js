// @ts-check
// Break the 404: the GameModule. Wires host input, the world, drawing, and the HUD.
// Benjo holds the paddle, his fireball is the ball, and the bricks spell 404.

import { createTracker, readIntent, resetTracker } from './controls.js';
import { drawFrame } from './draw.js';
import { DEATH_PAUSE, EVENT_LOST, EVENT_ROUND, HINT_T, NEW_BEST_T, STATUS_T } from './tuning.js';
import { createWorld, resizeWorld, stepWorld } from './world.js';

/** @typedef {import('../../contracts').GameModule} GameModule */
/** @typedef {import('../../contracts').GameInstance} GameInstance */
/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('./world.js').World} World */

const BEST_KEY = 'best';
const HINT_KEYS = 'ARROWS TO MOVE, SPACE TO SERVE';
const HINT_TOUCH = 'DRAG TO MOVE, TAP TO SERVE';
const NEW_BEST = 'NEW BEST';
const BALLS_LEFT = 'BALLS LEFT: ';
const ROUND = 'ROUND ';
const SCORE_LABEL = 'SCORE';
const REASON = "Benjo's fireball fizzled out.";

/**
 * @param {HostContext} host
 * @returns {GameInstance}
 */
function createBreakout(host) {
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
    if (w.events & EVENT_LOST) showStatus(BALLS_LEFT + w.lives, STATUS_T);
    if (w.events & EVENT_ROUND) showStatus(ROUND + w.round, STATUS_T);
    if (!cheered && best > 0 && w.score > best) {
      cheered = true;
      showStatus(NEW_BEST, NEW_BEST_T);
      return;
    }
    // The hint stays up until the first serve.
    if (statusT <= 0 || !w.served) return;
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
      stepWorld(world, readIntent(host.input, tracker, world.time), dt);
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
const breakout = {
  id: 'breakout',
  name: 'Break the 404',
  controls: {
    keyboard: HINT_KEYS,
    touch: HINT_TOUCH,
  },
  bestKey: BEST_KEY,
  create: createBreakout,
};

export default breakout;
