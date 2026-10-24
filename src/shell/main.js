// @ts-check
// Runtime entry. The static message and Return Home link work without any of this.
/** @typedef {import('../contracts').Registry} Registry */
/** @typedef {import('../contracts').BenjoConfig} BenjoConfig */
/** @typedef {import('../contracts').Palette} Palette */
/** @typedef {import('../contracts').MessageModule} MessageModule */
/** @typedef {import('./boot.js').PickTheme} PickTheme */
/**
 * @typedef {object} Holidays
 * @property {(today: import('./boot.js').DayDate, calendar: unknown[],
 *   themes: Record<string, import('../contracts').ThemePack>) => import('../contracts').ThemePack} resolveTheme
 * @property {unknown[]} calendar
 */

import { createAttract } from './attract.js';
import { formatDay, resolve } from './boot.js';
import { byId, readQuery, text } from './dom.js';
import { createHost } from './host.js';
import { createHud } from './hud.js';
import { attachInput } from './input.js';
import { drawSprite } from './sprite.js';
import { createStorage } from './storage.js';
import { watchSize } from './viewport.js';

/** Only these four palette entries become CSS custom properties (plan section 3). */
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
 * @param {HTMLElement} hudRoot
 * @param {() => string} describe
 */
function startDebugMeter(hudRoot, describe) {
  let frames = 0;
  let since = performance.now();
  /** @param {number} now */
  const tick = (now) => {
    frames += 1;
    if (now - since >= 1000) {
      const fps = Math.round((frames * 1000) / (now - since));
      hudRoot.dispatchEvent(new CustomEvent('benjo-debug', { detail: `${describe()} fps=${fps}` }));
      frames = 0;
      since = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
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
  );
  const { theme, game, reducedMotion } = resolved;
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

  function play() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && message?.contains(active)) active.blur();
    host?.play();
  }

  const hud = createHud({
    hudRoot,
    cardSlot,
    promptSlot,
    cta,
    onPlay: play,
    onPause: () => host?.pause(),
    onResume: () => host?.resume(),
    onQuit: () => {
      host?.quit();
      byId('play-prompt')?.focus();
    },
  });

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

  if (resolved.debug) {
    hudRoot.addEventListener('benjo-debug', (event) =>
      hud.setDebug(String(/** @type {CustomEvent} */ (event).detail)),
    );
    const line = () =>
      `game=${game?.id ?? 'none'} theme=${theme.id} date=${formatDay(resolved.date)}`;
    hud.setDebug(line());
    startDebugMeter(hudRoot, line);
  }

  attract.start();
  if (!game) return;

  host = createHost({
    root: gameRoot,
    canvas,
    ctx,
    size,
    theme,
    game,
    reducedMotion,
    random,
    hud,
    attract,
    frames,
    storage: createStorage(game.id),
    setClass(name, on) {
      html.classList.toggle(name, on);
      if (name === 'is-playing') hudRoot.hidden = !on;
    },
    createInput: (signal) =>
      attachInput({ canvas, signal, pauseButton: hud.pauseButton, onPause: () => host?.pause() }),
    drawSprite: (target, sprite, x, y, h, opts) =>
      drawSprite(target, theme.palette, sprite, x, y, h, opts),
    onFailure: (failures) => (failures >= 2 ? hud.hidePrompt() : hud.showError()),
  });
  hud.showPlayPrompt(resolved.message.playPrompt);

  const pauseIfPlaying = () => host?.pause();
  const options = { signal: page.signal };
  document.addEventListener('visibilitychange', () => document.hidden && pauseIfPlaying(), options);
  window.addEventListener('blur', pauseIfPlaying, options);
  // Focus moving into the message strip pauses without stealing focus, so Tab reaches the link.
  message.addEventListener('focusin', () => host?.pause({ focus: false }), options);
  const canStart = () => host?.state === 'idle' && promptSlot.firstElementChild !== null;
  overlay?.addEventListener('click', () => canStart() && play(), options);
  window.addEventListener(
    'keydown',
    (event) => {
      const onBody = document.activeElement === document.body;
      if (!onBody || event.code !== 'Space' || !canStart()) return;
      event.preventDefault();
      play();
    },
    options,
  );
}
