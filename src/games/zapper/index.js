// @ts-check
// Bug Zapper: the GameModule. Wires host input, the world, drawing, and the HUD.
//
// The world keeps its own previous positions, so a single world mutated in place is enough
// for render(alpha) to interpolate, and nothing in the update path allocates.

import { createIntent, createTracker, readIntent, resetTracker } from './controls.js';
import { drawFrame } from './draw.js';
import {
  DEATH_PAUSE,
  EVENT_FIRE,
  EVENT_HIT,
  EVENT_KILL,
  EVENT_WAVE,
  HINT_T,
  NEW_BEST_T,
  STATUS_T,
} from './tuning.js';
import { createWorld, resizeWorld, stepWorld, sweep } from './world.js';

/** @typedef {import('../../contracts').GameModule} GameModule */
/** @typedef {import('../../contracts').GameInstance} GameInstance */
/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('./world.js').World} World */
/** @typedef {import('../../contracts').AudioCue} AudioCue */
/** @typedef {import('./world.js').Aid} Aid */
/**
 * Everything update and render read, for Rollback. The world goes without its random source,
 * which stays the host's.
 * @typedef {{ world: Omit<World, 'random'>, status: string, statusT: number, cheered: boolean,
 *   seenWidth: number, seenHeight: number }} Snapshot
 */

/** World events and their sounds, most important first. One cue plays per step. */
/** @type {Array<[number, AudioCue]>} */
const CUES = [
  [EVENT_HIT, 'hit'],
  [EVENT_WAVE, 'clear'],
  [EVENT_KILL, 'score'],
  [EVENT_FIRE, 'shoot'],
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
const KEY_HINT = 'ARROWS TO MOVE, SPACE TO BREATHE FIRE';
const TOUCH_HINT = 'DRAG TO MOVE, TAP TO BREATHE FIRE';
const NEW_BEST = 'NEW BEST';
const SCORE_LABEL = 'SCORE';
const REASON_BITE = "A bug got into Benjo's code.";
const REASON_REACHED = 'The bugs reached the server room.';

/**
 * @param {HostContext} host
 * @returns {GameInstance}
 */
function createZapper(host) {
  /** @type {World | null} */
  let world = null;
  const tracker = createTracker();
  const intent = createIntent();
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
  const aid = { absorb: () => host.power?.absorb() ?? false };

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
    if (w.events & EVENT_WAVE) return showStatus(`WAVE ${w.wave}`, STATUS_T);
    if (w.events & EVENT_HIT && !w.dead) return showStatus(`LIVES LEFT: ${w.lives}`, STATUS_T);
    if (statusT <= 0) return;
    statusT -= dt;
    if (statusT <= 0) showStatus('', 0);
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
      showStatus(host.input.touch ? TOUCH_HINT : KEY_HINT, HINT_T);
    },

    update(dt) {
      if (!world || paused || ended) return;
      syncLayout();
      stepWorld(world, readIntent(host.input, tracker, world.time, intent), dt, aid);
      playCue(host, world.events);
      syncHud(world, dt);
      host.track?.(world.bx, world.benjoY);
      if (world.dead && world.deadT >= DEATH_PAUSE) {
        ended = true;
        const reason = world.hit === 'reached' ? REASON_REACHED : REASON_BITE;
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
      if (!world || ended || world.dead) return 0;
      const { wave } = world;
      const n = sweep(world);
      if (world.wave !== wave) {
        host.audio?.play('clear');
        showStatus(`WAVE ${world.wave}`, STATUS_T);
      } else if (n) host.audio?.play('score');
      return n;
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
const zapper = {
  id: 'zapper',
  name: 'Bug Zapper',
  controls: { keyboard: KEY_HINT, touch: TOUCH_HINT },
  bestKey: BEST_KEY,
  create: createZapper,
  // No 'magnet': nothing here is a pickup, only bugs and their bites.
  powers: ['twin', 'rollback', 'gc'],
};

export default zapper;
