// @ts-check
// Dragon Tail: the GameModule. Wires host input, the world, drawing, and the HUD.
//
// The world keeps how far its last move has slid, so one world mutated in place is enough for
// render(alpha) to interpolate, and nothing in the update path allocates.

import { createTracker, readTurn, resetTracker } from './controls.js';
import { drawFrame } from './draw.js';
import { HOW_TO } from './howto.js';
import { DEATH_PAUSE, HINT_T, NEW_BEST_T } from './tuning.js';
import { centerX, centerY, createWorld, headX, headY, resizeWorld, stepWorld } from './world.js';

/** @typedef {import('../../contracts').GameModule} GameModule */
/** @typedef {import('../../contracts').GameInstance} GameInstance */
/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('./world.js').World} World */
/** @typedef {import('./world.js').Aid} Aid */
/**
 * Everything update and render read, for Rollback. The world goes without its random source,
 * which stays the host's.
 * @typedef {{ world: Omit<World, 'random'>, status: string, statusT: number, cheered: boolean,
 *   seenWidth: number, seenHeight: number }} Snapshot
 */

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
  let status = '';
  let statusT = 0;
  let best = 0;
  let cheered = false;
  let seenWidth = 0;
  let seenHeight = 0;

  /** @type {Aid} */
  const aid = { magnet: false, absorb: () => host.power?.absorb() ?? false };

  /** @param {string} text @param {number} seconds */
  function showStatus(text, seconds) {
    host.setStatus(text);
    status = text;
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
    if (statusT <= 0) showStatus('', 0);
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
      aid.magnet = host.power?.active('magnet') ?? false;
      stepWorld(world, readInput(world), dt, aid);
      // The snake's world raises no events, so the sound comes from what changed this step.
      if (world.dead && !dead) host.audio?.play(world.hit === 'full' ? 'clear' : 'hit');
      else if (world.score > score) host.audio?.play('pickup');
      syncHud(world, dt);
      const p = world.dead || world.reducedMotion ? 1 : world.progress;
      host.track?.(headX(world, p), headY(world, p));
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

    snapshot() {
      if (!world) return null;
      const { random: _random, ...rest } = world;
      /** @type {Snapshot} */
      const snap = { world: rest, status, statusT, cheered, seenWidth, seenHeight };
      return structuredClone(snap);
    },

    restore(saved) {
      if (!saved) return;
      const snap = /** @type {Snapshot} */ (structuredClone(saved));
      world = { ...snap.world, random: host.random };
      ({ cheered, seenWidth, seenHeight } = snap);
      showStatus(snap.status, snap.statusT);
      ended = false;
      lastScore = world.score;
      host.setScore(lastScore);
      resetTracker(tracker, host.input);
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
  // No 'gc': nothing on the grid is a hazard to clear, only the walls and Benjo's own tail.
  powers: ['twin', 'rollback', 'magnet'],
};

export default tail;
