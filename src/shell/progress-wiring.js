// @ts-check
// The progress layer on the page (#22): the pipeline and its toasts, the build bar and profile
// card, the nightly build, the teapot, Benjo's looks, and the power-up toasts. main.js boots
// the page and hands this what it needs; games know nothing about it.
/** @typedef {import('../contracts').GameModule} GameModule */
/** @typedef {import('../contracts').ThemePack} ThemePack */
/** @typedef {import('../contracts').Sprite} Sprite */
/** @typedef {import('./host.js').RunEvent} RunEvent */
/** @typedef {import('./host.js').RunOptions} RunOptions */

import { benjo } from '../assets/benjo.js';
import { byId } from './dom.js';
import { dayNumber, nightlyGame, nightlyRandom } from './nightly.js';
import { createPipeline, xpNote } from './pipeline.js';
import { POWERS } from './power.js';
import { createBuildBar, openProfile } from './profile.js';
import { skinFor } from './skins.js';
import { drawSprite } from './sprite.js';
import { createStorage } from './storage.js';
import { watchTeapot } from './teapot.js';
import { createToasts } from './toast.js';

/**
 * @param {{ games: GameModule[], theme: ThemePack, cardSlot: HTMLElement,
 *   audio: { play(cue: import('../contracts').AudioCue): void }, signal: AbortSignal,
 *   hostState: () => string | undefined,
 *   startGame: (id: string, run: RunOptions) => void }} page
 */
export function createProgressWiring({ games, theme, cardSlot, audio, signal, ...page }) {
  // One storage per game, shared by the host and the progress, so a browser without
  // localStorage still sees one memory copy of each best.
  /** @type {Map<string, ReturnType<typeof createStorage>>} */
  const stores = new Map();
  const storeFor = (/** @type {string} */ id) => {
    const store = stores.get(id) ?? createStorage(id);
    stores.set(id, store);
    return store;
  };
  const bestKeyOf = (/** @type {string} */ id) =>
    games.find((choice) => choice.id === id)?.bestKey ?? 'best';
  const pipeline = createPipeline({
    storage: createStorage('meta'),
    games,
    bestOf: (id) => storeFor(id).getNumber(bestKeyOf(id), 0),
    setBest: (id, value) => storeFor(id).setNumber(bestKeyOf(id), value),
  });
  const toasts = createToasts(byId('page') ?? document.body);
  const bar = createBuildBar(() => openCard());
  /** @param {string[]} notices */
  const announce = (notices) => {
    toasts.showAll(notices);
    bar.update(pipeline);
  };

  function playNightly() {
    const day = dayNumber(Date.now());
    const pick = nightlyGame(day, games);
    if (pick) page.startGame(pick.id, { random: nightlyRandom(day), nightly: true });
  }

  function openCard() {
    if (page.hostState() !== 'idle') return;
    openProfile(cardSlot, pipeline, {
      games,
      now: Date.now,
      onNightly: () => {
        cardSlot.replaceChildren();
        playNightly();
      },
      onClose: () => bar.node.focus(),
      toast: announce,
    });
  }

  const mCode = byId('m-code');
  if (mCode) {
    watchTeapot(
      mCode,
      () => {
        audio.play('clear');
        announce(pipeline.unlock('teapot'));
      },
      signal,
    );
  }

  return {
    storeFor,
    /** The build bar, which sits under the play prompt. */
    barNode: bar.node,
    /** A visit counts once, at boot. */
    visit: () => announce(pipeline.visit()),

    /** @param {RunEvent} event */
    onEvent(event) {
      // Power-ups fire as they drop (#74), so the toast says what just started.
      if (event.type === 'drop') {
        const name = POWERS[event.id]?.[1];
        if (name)
          toasts.show(event.id === 'rollback' ? 'Rollback armed for your next crash' : name);
      }
      announce(pipeline.onEvent(event));
    },

    /** The game over card's XP line for the run that just ended. */
    xpLine: () => xpNote(pipeline.lastRun),

    /**
     * Benjo wears the chosen look everywhere he is drawn: the game, the twin, and the ghost.
     * A picked look replaces a holiday hat, so the two never stack.
     * @param {CanvasRenderingContext2D} target @param {Sprite} sprite @param {number} x
     * @param {number} y @param {number} h @param {object} [opts]
     */
    drawSprite(target, sprite, x, y, h, opts) {
      const skin = skinFor(sprite, theme.sprites.benjo, pipeline.state.look);
      drawSprite(target, theme.palette, skin ? benjo : sprite, x, y, h, opts);
      if (skin) drawSprite(target, theme.palette, skin, x, y, h, opts);
    },
  };
}

/** @typedef {ReturnType<typeof createProgressWiring>} ProgressWiring */
