// @ts-check
// Runtime entry. The static message and Return Home link work without any of this.
/** @typedef {import('../contracts').Registry} Registry */
/** @typedef {import('../contracts').BenjoConfig} BenjoConfig */
/** @typedef {import('../contracts').Palette} Palette */
/** @typedef {import('../contracts').MessageModule} MessageModule */
/** @typedef {import('../contracts').GameModule} GameModule */
/** @typedef {{ score: number, best: number, scoreLabel: string, reason: string }} OverCard */
/** @typedef {import('./boot.js').PickTheme} PickTheme */
/**
 * @typedef {object} Holidays
 * @property {(today: import('./boot.js').DayDate, calendar: unknown[],
 *   themes: Record<string, import('../contracts').ThemePack>) => import('../contracts').ThemePack} resolveTheme
 * @property {unknown[]} calendar
 */

import { createAttract } from './attract.js';
import { createAudio } from './audio.js';
import { formatDay, nextGames, resolve } from './boot.js';
import { createDebugMeter } from './debug-meter.js';
import { byId, readQuery, text } from './dom.js';
import { createHost } from './host.js';
import { createHud } from './hud.js';
import { attachInput } from './input.js';
import { drawSprite } from './sprite.js';
import { createStorage } from './storage.js';
import { watchSize } from './viewport.js';

/** Only these four palette entries become CSS custom properties; the rest stay in canvas code. */
const PALETTE_TOKENS = /** @type {const} */ ([
  ['--bg', 'bg'],
  ['--accent', 'accent'],
  ['--accent-soft', 'accentSoft'],
  ['--glow', 'glow'],
]);
const HEX = /^#[0-9a-f]{3,8}$/i;

/**
 * @param {HTMLElement} root
 * @param {Palette} palette
 */
function applyPalette(root, palette) {
  for (const [property, key] of PALETTE_TOKENS) {
    if (HEX.test(palette[key])) root.style.setProperty(property, palette[key]);
  }
}

/** A ?message= override swaps text only; the link target stays the static one. @param {MessageModule} message */
function swapMessageText(message) {
  const pairs = /** @type {const} */ ([
    ['m-kicker', message.kicker],
    ['m-code', message.code],
    ['m-body', message.body],
    ['m-cta', message.cta.label],
  ]);
  for (const [id, value] of pairs) {
    const node = byId(id);
    if (node) text(node, value);
  }
}

/**
 * @param {Registry} registry
 * @param {BenjoConfig} config
 * @param {Holidays | null} [holidays] calendar and resolver for theme 'auto'
 */
export function boot(registry, config, holidays = null) {
  const html = document.documentElement;
  const gameRoot = byId('game-root');
  const canvas = /** @type {HTMLCanvasElement | null} */ (byId('game-canvas'));
  const message = byId('message');
  const hudRoot = byId('hud');
  const cardSlot = byId('card-slot');
  const promptSlot = byId('prompt-slot');
  const overlay = byId('overlay');
  const cta = /** @type {HTMLAnchorElement | null} */ (byId('m-cta'));
  const ctx = canvas?.getContext('2d');
  if (!gameRoot || !canvas || !ctx || !message || !hudRoot || !cardSlot || !promptSlot || !cta)
    return;

  /** @type {PickTheme | null} */
  const pick = holidays
    ? (date, themes) => holidays.resolveTheme(date, holidays.calendar, themes)
    : null;
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const resolved = resolve(
    registry,
    config,
    readQuery(location.search),
    new Date(),
    reducedQuery.matches,
    pick,
    Math.random,
  );
  const { theme, reducedMotion } = resolved;
  /** The game the next run plays. The picker and the game over card can change it (ADR-0014). */
  let game = resolved.game;
  applyPalette(html, theme.palette);
  html.setAttribute('data-theme', theme.id);
  if (resolved.message.id !== config.message) swapMessageText(resolved.message);

  const frames = {
    request: (/** @type {FrameRequestCallback} */ cb) => requestAnimationFrame(cb),
    cancel: (/** @type {number} */ id) => cancelAnimationFrame(id),
  };
  const size = { width: 0, height: 0, dpr: 1 };
  const random = Math.random;
  const attract = createAttract({ ctx, size, theme, reducedMotion, random, frames });
  /** @type {ReturnType<typeof createHost> | null} */
  let host = null;
  const page = new AbortController();
  const audio = createAudio({ storage: createStorage('audio'), cues: theme.cues });

  /** Games whose How to play card the visitor has already seen (#28). */
  const howToSeen = createStorage('howto');

  /** Play, unless this game's How to play card has not been seen yet: show that first. */
  function play() {
    if (game?.howTo && host?.state === 'idle' && howToSeen.getNumber(game.id, 0) === 0) {
      openHowTo(false);
      return;
    }
    startRun();
  }

  function startRun() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && message?.contains(active)) active.blur();
    host?.play();
  }

  /**
   * From the start screen the card plays the game; from the paused card it resumes, and Back
   * returns to the paused card. Either way the game counts as seen.
   * @param {boolean} paused
   */
  function openHowTo(paused) {
    const current = game;
    const howTo = current?.howTo;
    if (!current || !howTo) return;
    hud.showHowTo({ name: current.name, howTo }, theme, {
      goLabel: paused ? 'Resume' : 'Got it, play',
      onGo: () => {
        howToSeen.setNumber(current.id, 1);
        hud.clearCard();
        if (paused) host?.resume();
        else startRun();
      },
      onBack: () => {
        if (paused) {
          // The host's own HUD wrapper, so the paused card gets its game wheel back.
          hostHud.showPaused({});
          return;
        }
        hud.clearCard();
        byId('play-prompt')?.focus();
      },
    });
  }

  const hud = createHud({
    hudRoot,
    cardSlot,
    promptSlot,
    cta,
    onPlay: play,
    onPause: () => host?.pause(),
    onResume: () => host?.resume(),
    onRestart: () => host?.restart(),
    onQuit: () => {
      host?.quit();
      byId('play-prompt')?.focus();
    },
    onSelect: (id) => selectGame(id, false),
    onSwitch: (id) => {
      // The paused card's wheel ends the run first, so the chosen game starts fresh.
      if (host?.state === 'paused') host.quit();
      selectGame(id, true);
    },
    onMute: toggleMute,
    onHowTo: () => openHowTo(host?.state === 'paused'),
  });
  hud.setMuted(audio.muted);

  function toggleMute() {
    audio.setMuted(!audio.muted);
    hud.setMuted(audio.muted);
  }

  watchSize({
    root: gameRoot,
    canvas,
    ctx,
    size,
    signal: page.signal,
    onResize: () => {
      if (!host?.redraw()) attract.redraw();
    },
  });

  const describe = () =>
    `game=${game?.id ?? 'none'} theme=${theme.id} date=${formatDay(resolved.date)}`;
  const meter = resolved.debug ? createDebugMeter({ frames, emit: hud.setDebug, describe }) : null;
  if (meter) hud.setDebug(describe());
  // The meter only spends frames while a run is playing on a visible page.
  const syncMeter = () => {
    const { classList } = html;
    const playing = classList.contains('is-playing') && !classList.contains('is-paused');
    meter?.setRunning(playing && !classList.contains('is-over') && !document.hidden);
  };

  attract.start();
  if (!game) return;

  /** Games the player can switch to from the game over card: the next two in config order. */
  const others = () => (resolved.picker ? nextGames(resolved.games, game) : []);
  /** The paused card's wheel, starting on the game in play. */
  const pausePicker = () =>
    resolved.picker && game ? { games: resolved.games, current: game.id } : null;
  // The host only knows its own game, so the paused and game over cards get the games here.
  const hostHud = {
    ...hud,
    showPaused: (/** @type {{ focus?: boolean }} */ how) => hud.showPaused(how, pausePicker()),
    showOver: (/** @type {OverCard} */ card) => hud.showOver(card, others()),
  };

  /** @param {GameModule} next */
  const hostFor = (next) =>
    createHost({
      root: gameRoot,
      canvas,
      ctx,
      size,
      theme,
      game: next,
      reducedMotion,
      random,
      hud: hostHud,
      attract,
      frames,
      storage: createStorage(next.id),
      setClass(name, on) {
        html.classList.toggle(name, on);
        if (name === 'is-playing') hudRoot.hidden = !on;
        syncMeter();
      },
      createInput: (signal) =>
        attachInput({ canvas, signal, pauseButton: hud.pauseButton, onPause: () => host?.pause() }),
      drawSprite: (target, sprite, x, y, h, opts) =>
        drawSprite(target, theme.palette, sprite, x, y, h, opts),
      onFailure: (failures) => (failures >= 2 ? hud.hidePrompt() : hud.showError()),
      audio,
    });

  /**
   * Switch to another bundled game while idle or on the game over card. A run in progress is
   * never swapped out. `start` plays it at once, as the game over card's buttons do.
   * @param {string} id
   * @param {boolean} start
   */
  function selectGame(id, start) {
    const next = resolved.games.find((choice) => choice.id === id);
    if (!next || !host || host.state === 'playing' || host.state === 'paused') return;
    if (next !== game) {
      host.quit();
      game = next;
      host = hostFor(next);
      if (meter) hud.setDebug(describe());
    }
    if (start) {
      showPrompt();
      play();
    }
  }

  const showPrompt = () =>
    hud.showPlayPrompt(
      resolved.message.playPrompt,
      resolved.picker && game ? { games: resolved.games, current: game.id } : null,
    );

  host = hostFor(game);
  showPrompt();

  const pauseIfPlaying = () => host?.pause();
  const options = { signal: page.signal };
  const onVisibility = () => {
    if (document.hidden) pauseIfPlaying();
    syncMeter();
  };
  document.addEventListener('visibilitychange', onVisibility, options);
  window.addEventListener('blur', pauseIfPlaying, options);
  // Focus moving into the message strip pauses without stealing focus, so Tab reaches the link.
  message.addEventListener('focusin', () => host?.pause({ focus: false }), options);
  const canStart = () => host?.state === 'idle' && promptSlot.firstElementChild !== null;
  overlay?.addEventListener('click', () => canStart() && play(), options);
  // Browsers only allow sound after a gesture, so every input tries to wake the audio. A touch
  // pointerdown is not a gesture, and iOS Safari interrupts a context made there.
  for (const type of ['pointerup', 'touchend', 'keydown']) {
    window.addEventListener(type, audio.unlock, { ...options, capture: true, passive: true });
  }
  window.addEventListener(
    'keydown',
    (event) => {
      if (
        event.code === 'KeyM' &&
        !event.repeat &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        toggleMute();
        return;
      }
      const onBody = document.activeElement === document.body;
      if (!onBody || event.code !== 'Space' || !canStart()) return;
      event.preventDefault();
      play();
    },
    options,
  );
}
