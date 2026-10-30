// @ts-check
// Fix the Link: the GameModule. Wires host input, the world, drawing, and the HUD.
// Turn tiles until the link runs from Benjo on the left to the home page on the right.
//
// Power-ups (#22): the Digital Twin puts time back when the clock runs out, Rollback rewinds a
// timed-out board, and the Garbage Collector sets a few wrong tiles right. Benjo never moves and
// nothing drifts toward him, so there is no track and no magnet.

import { createIntent, createTracker, readIntent, resetTracker } from './controls.js';
import { cursorX, cursorY, drawFrame } from './draw.js';
import { HOW_TO } from './howto.js';
import { END_T, EVENT_SOLVED, EVENT_TURN, HINT_T, NEW_BEST_T, SOLVED_T } from './tuning.js';
import { createWorld, fixTiles, resizeWorld, stepWorld } from './world.js';

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
  [EVENT_SOLVED, 'clear'],
  [EVENT_TURN, 'turn'],
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
const HINT_KEYS = 'ARROWS TO PICK, SPACE TO TURN';
const HINT_TOUCH = 'TAP A TILE TO TURN IT';
const LINK_FIXED = 'LINK FIXED';
const NEW_BEST = 'NEW BEST';
const SCORE_LABEL = 'SCORE';
const REASON_TIMEOUT = 'The link timed out.';

/**
 * @param {HostContext} host
 * @returns {GameInstance}
 */
function createLinks(host) {
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
  /** @type {Assist} */
  const assist = { absorb: () => host.power?.absorb() === true };

  /** @param {string} text @param {number} seconds */
  function showStatus(text, seconds) {
    host.setStatus(text);
    statusT = seconds;
  }

  /** Re-lay the board out when the host resized the canvas. */
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
    if (w.events & EVENT_SOLVED) showStatus(LINK_FIXED, SOLVED_T);
    if (!cheered && best > 0 && w.score > best) {
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
      stepWorld(world, readIntent(host.input, tracker, world, intent), dt, assist);
      playCue(host, world.events);
      syncHud(world, dt);
      // The cursor is what the player steers, so the twin and the ghost follow it.
      host.track?.(cursorX(world), cursorY(world));
      if (world.dead && world.deadT >= END_T) {
        ended = true;
        host.end({ score: world.score, scoreLabel: SCORE_LABEL, reason: REASON_TIMEOUT });
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
      const fixed = fixTiles(world);
      if (fixed === 0) return 0;
      // A solve here happens between steps, so the next step would clear its event: say it now.
      host.audio?.play(world.connected ? 'clear' : 'turn');
      if (world.connected) showStatus(LINK_FIXED, SOLVED_T);
      syncScore(world);
      return fixed;
    },

    snapshot() {
      if (!world) return null;
      const { random: _random, ...rest } = world;
      /** @type {Snapshot} */
      const snap = { world: rest, lastScore, statusT, cheered, seenWidth, seenHeight };
      return structuredClone(snap);
    },

    restore(value) {
      if (!value) return;
      const snap = /** @type {Snapshot} */ (structuredClone(value));
      world = { ...snap.world, random: host.random };
      ({ lastScore, statusT, cheered, seenWidth, seenHeight } = snap);
      ended = false;
      resetTracker(tracker, host.input);
      host.setScore(lastScore);
    },
  };
}

/** @type {GameModule} */
const links = {
  id: 'links',
  name: 'Fix the Link',
  controls: {
    keyboard: HINT_KEYS,
    touch: HINT_TOUCH,
  },
  howTo: HOW_TO,
  bestKey: BEST_KEY,
  create: createLinks,
  powers: ['twin', 'rollback', 'gc'],
};

export default links;
