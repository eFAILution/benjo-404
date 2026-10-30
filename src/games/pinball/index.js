// @ts-check
// Benjo Pinball: the GameModule (ADR-0076). Wires host input, the table, drawing, sound, music,
// and the HUD. The table is the USS Never Sleeps, seen from above.

import { freezeWorld, thawWorld } from '../../shell/world-copy.js';
import { createControls } from './controls.js';
import { drawFrame } from './draw.js';
import { HOW_TO } from './howto.js';
import { loseBall, saveBall, squash } from './rules.js';
import { BRIDGE_TRACK, CUES, HULL_TRACK, TWIN_TRACK } from './sounds.js';
import { createWorld, stepWorld } from './table.js';

/** @typedef {import('../../contracts').GameModule} GameModule */
/** @typedef {import('../../contracts').GameInstance} GameInstance */
/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('./table.js').World} World */

const BEST_KEY = 'best';
const HINT_KEYS = 'ARROWS FLIP, HOLD SPACE TO LAUNCH';
const HINT_TOUCH = 'HOLD A SIDE TO FLIP, LET GO TO LAUNCH';
const SCORE_LABEL = 'SCORE';
const STATUS_T = 2.5;

/** @param {World} w */
const trackFor = (w) => (w.twin ? TWIN_TRACK : w.deck === 'hull' ? HULL_TRACK : BRIDGE_TRACK);

/**
 * @param {HostContext} host
 * @returns {GameInstance}
 */
function createPinball(host) {
  /** @type {World | null} */
  let world = null;
  const controls = createControls(host);
  let paused = false;
  let ended = false;
  let lastScore = -1;
  let sayN = 0;
  let statusT = 0;

  /** @param {string} text */
  function showStatus(text) {
    host.setStatus(text);
    statusT = STATUS_T;
  }

  /** @param {World} w @param {number} dt */
  function syncHud(w, dt) {
    if (w.score !== lastScore) {
      lastScore = w.score;
      host.setScore(w.score);
    }
    if (w.sayN !== sayN) {
      sayN = w.sayN;
      showStatus(w.say);
      return;
    }
    if (statusT <= 0) return;
    statusT -= dt;
    if (statusT <= 0) host.setStatus('');
  }

  /** A ball is gone with no save left: the Digital Twin may still take it. @param {World} w */
  function settleLost(w) {
    if (!w.lost) return;
    if (!w.tilted && host.power?.absorb()) saveBall(w, 'DIGITAL TWIN');
    else loseBall(w);
  }

  return {
    start() {
      world = createWorld(host.random, { reducedMotion: host.reducedMotion });
      paused = false;
      ended = false;
      lastScore = -1;
      sayN = 0;
      controls.reset();
      showStatus(host.input.touch ? HINT_TOUCH : HINT_KEYS);
    },

    update(dt) {
      if (!world || paused || ended) return;
      const intent = controls.read(host.input);
      if (intent.leftPressed || intent.rightPressed) host.audio?.play('flip');
      stepWorld(world, intent, dt);
      settleLost(world);
      for (const cue of world.cues) host.audio?.play(cue);
      syncHud(world, dt);
      if (world.phase === 'play') host.music?.play(trackFor(world));
      else host.music?.stop();
      if (world.ended) {
        ended = true;
        host.end({ score: world.score, scoreLabel: SCORE_LABEL, reason: world.endReason });
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
      controls.reset();
    },

    destroy() {
      ended = true;
      world = null;
    },

    // Garbage Collector squashes every bug on the table.
    collect() {
      if (!world || ended) return 0;
      const count = world.bugs.length;
      world.bugs = [];
      squash(world, count);
      if (count) host.audio?.play('squash');
      return count;
    },

    snapshot() {
      return world ? { world: freezeWorld(world), sayN } : null;
    },

    restore(saved) {
      if (!saved) return;
      const snap = /** @type {{ world: Omit<World, 'random'>, sayN: number }} */ (saved);
      world = /** @type {World} */ (thawWorld(snap.world, host.random));
      sayN = snap.sayN;
      ended = false;
      lastScore = world.score;
      host.setScore(world.score);
      controls.reset();
    },
  };
}

/** @type {GameModule} */
const pinball = {
  id: 'pinball',
  name: 'Benjo Pinball',
  controls: { keyboard: HINT_KEYS, touch: HINT_TOUCH },
  howTo: HOW_TO,
  bestKey: BEST_KEY,
  create: createPinball,
  powers: ['twin', 'rollback', 'gc'],
  cues: CUES,
};

export default pinball;
