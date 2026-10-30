// @ts-check
// Break the 404: the GameModule. Wires host input, the world, drawing, and the HUD.
// Benjo holds the paddle, his fireball is the ball, and the bricks spell 404.

import { createTracker, readIntent, resetTracker } from './controls.js';
import { drawFrame } from './draw.js';
import { HOW_TO } from './howto.js';
import {
  BENJO_DY,
  DEATH_PAUSE,
  EVENT_BOUNCE,
  EVENT_BRICK,
  EVENT_HIT,
  EVENT_LOST,
  EVENT_ROUND,
  EVENT_SERVE,
  HINT_T,
  NEW_BEST_T,
  STATUS_T,
} from './tuning.js';
import { clearRow, createWorld, resizeWorld, stepWorld } from './world.js';

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
  [EVENT_LOST, 'hit'],
  [EVENT_ROUND, 'clear'],
  [EVENT_BRICK, 'score'],
  [EVENT_BOUNCE, 'land'],
  [EVENT_SERVE, 'shoot'],
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
      showStatus(host.input.touch ? HINT_TOUCH : HINT_KEYS, HINT_T);
    },

    update(dt) {
      if (!world || paused || ended) return;
      syncLayout();
      aid.magnet = host.power?.active('magnet') ?? false;
      stepWorld(world, readIntent(host.input, tracker, world.time), dt, aid);
      playCue(host, world.events);
      syncHud(world, dt);
      host.track?.(world.px, world.paddleY + BENJO_DY * world.unit);
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

    // Garbage Collector. Bricks are the targets here, not threats, so clearing all of them would
    // skip a round; the lowest row pops instead and scores as if hit.
    collect() {
      if (!world || ended || world.dead) return 0;
      const { round } = world;
      const n = clearRow(world);
      if (world.round !== round) {
        host.audio?.play('clear');
        showStatus(ROUND + world.round, STATUS_T);
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
const breakout = {
  id: 'breakout',
  name: 'Break the 404',
  controls: {
    keyboard: HINT_KEYS,
    touch: HINT_TOUCH,
  },
  howTo: HOW_TO,
  bestKey: BEST_KEY,
  create: createBreakout,
  powers: ['twin', 'rollback', 'gc', 'magnet'],
};

export default breakout;
