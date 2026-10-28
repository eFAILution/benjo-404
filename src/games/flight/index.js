// @ts-check
// Benjo Flight: the GameModule. Wires host input, the world, drawing, and the HUD.
//
// The world keeps its own previous Benjo height and scroll, so a single world mutated in place
// is enough for render(alpha) to interpolate, and nothing in the update path allocates.
//
// Power-ups (#22): the magnet and the Digital Twin reach the world through `powers`, collect()
// clears the towers on screen, and snapshot()/restore() copy the run for Rollback.

import { createTracker, readFlap, resetTracker } from './controls.js';
import { drawFrame } from './draw.js';
import {
  DEATH_PAUSE,
  EVENT_FLAP,
  EVENT_HIT,
  EVENT_PICKUP,
  EVENT_SCORE,
  HINT_T,
  NEW_BEST_T,
} from './tuning.js';
import { clearTowers, createWorld, resizeWorld, stepWorld } from './world.js';

/** @typedef {import('../../contracts').GameModule} GameModule */
/** @typedef {import('../../contracts').GameInstance} GameInstance */
/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('./world.js').World} World */
/** @typedef {import('../../contracts').AudioCue} AudioCue */
/** @typedef {import('./world.js').Powers} Powers */
/**
 * @typedef {{ world: Omit<World, 'random'>, statusT: number, cheered: boolean,
 *   seenWidth: number, seenHeight: number }} Snapshot
 */

/** World events and their sounds, most important first. One cue plays per step. */
/** @type {Array<[number, AudioCue]>} */
const CUES = [
  [EVENT_HIT, 'hit'],
  [EVENT_PICKUP, 'pickup'],
  [EVENT_SCORE, 'score'],
  [EVENT_FLAP, 'jump'],
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
const HINT = 'SPACE OR TAP TO FLAP';
const NEW_BEST = 'NEW BEST';
const SCORE_LABEL = 'SCORE';
const REASON_TOWER = 'Benjo clipped a 404 tower.';
const REASON_GROUND = 'Benjo touched down too soon.';

/**
 * @param {HostContext} host
 * @returns {GameInstance}
 */
function createFlight(host) {
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
    if (statusT <= 0 || w.ready) return;
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
      showStatus(HINT, HINT_T);
    },

    update(dt) {
      if (!world || paused || ended) return;
      syncLayout();
      powers.magnet = Boolean(host.power?.active('magnet'));
      stepWorld(world, readFlap(host.input, tracker, world.time), dt, powers);
      playCue(host, world.events);
      syncHud(world, dt);
      host.track?.(world.benjoX, world.by);
      if (world.dead && world.deadT >= DEATH_PAUSE) {
        ended = true;
        const reason = world.hit === 'ground' ? REASON_GROUND : REASON_TOWER;
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

    collect() {
      return world ? clearTowers(world) : 0;
    },

    snapshot() {
      if (!world) return null;
      // The host's random is a function, so it stays out of the copy.
      const { random: _, ...rest } = world;
      /** @type {Snapshot} */
      const snap = { world: structuredClone(rest), statusT, cheered, seenWidth, seenHeight };
      return snap;
    },

    restore(saved) {
      const snap = /** @type {Snapshot | null} */ (saved);
      if (!snap) return;
      world = { ...structuredClone(snap.world), random: host.random };
      statusT = snap.statusT;
      cheered = snap.cheered;
      seenWidth = snap.seenWidth;
      seenHeight = snap.seenHeight;
      ended = false;
      resetTracker(tracker, host.input);
      lastScore = world.score;
      host.setScore(lastScore);
    },
  };
}

/** @type {GameModule} */
const flight = {
  id: 'flight',
  name: 'Benjo Flight',
  controls: {
    keyboard: 'SPACE OR UP TO FLAP',
    touch: 'TAP TO FLAP',
  },
  bestKey: BEST_KEY,
  create: createFlight,
  powers: ['twin', 'rollback', 'gc', 'magnet'],
};

export default flight;
