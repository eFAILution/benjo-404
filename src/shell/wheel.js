// @ts-check
// The idle game picker as a horizontal wheel (#20). The chosen game sits in the middle with its
// neighbors fanned out to each side, and the ends wrap around. Built only with dom.el(); every
// position is a data-offset the CSS places, so the shell never writes a style attribute.

import { el, text } from './dom.js';
import { wrap } from './wrap.js';

/** Neighbors shown on each side of the chosen game. The CSS parks anything farther out. */
export const WHEEL_REACH = 2;
/** A horizontal drag this long, in CSS pixels, spins the wheel one step. */
const SWIPE_PX = 24;

/**
 * Signed distance from the chosen game to game `index`, the short way around the wheel.
 * @param {number} index
 * @param {number} current
 * @param {number} count
 */
export function wheelOffset(index, current, count) {
  const half = Math.floor(count / 2);
  return wrap(index - current + half, count) - half;
}

/**
 * The index `step` places from `current`, wrapping at both ends.
 * @param {number} current
 * @param {number} step
 * @param {number} count
 */
export function wheelStep(current, step, count) {
  return wrap(current + step, count);
}

/** @param {number} value */
const pad2 = (value) => String(value).padStart(2, '0');

/**
 * @param {string} label
 * @param {string} glyph
 * @param {() => void} onSpin
 */
function arrow(label, glyph, onSpin) {
  // Off the Tab order and never focused by a click, so Space after a click still plays.
  const node = el(
    'button',
    { type: 'button', class: 'wheel-arrow', tabindex: '-1', 'aria-label': label },
    [glyph],
  );
  node.addEventListener('pointerdown', (event) => event.preventDefault());
  node.addEventListener('click', onSpin);
  return node;
}

/** @typedef {{ id: string, name: string }} GameChoice */

/**
 * Spinning only selects a game. Pressing the game in the middle plays it, so Space or Enter on
 * the focused wheel starts the run the same way the play prompt does.
 * @param {GameChoice[]} games
 * @param {string} current
 * @param {(id: string) => void} onSelect
 * @param {() => void} onPlay
 */
export function gameWheel(games, current, onSelect, onPlay) {
  const count = games.length;
  let chosen = Math.max(
    0,
    games.findIndex((game) => game.id === current),
  );
  let swiped = false;
  let downX = 0;

  const items = games.map((game, index) => {
    const node = el('button', { type: 'button', class: 'wheel-item' }, [game.name]);
    node.addEventListener('click', (event) => {
      // The click that ends a swipe is not a press. Keyboard clicks (detail 0) always count.
      if (swiped && event.detail !== 0) return;
      if (index === chosen) onPlay();
      else choose(index);
    });
    return node;
  });
  const counter = el('span', { class: 'wheel-count', 'aria-hidden': 'true' });
  const track = el('div', { class: 'wheel-track' }, items);

  function layout() {
    items.forEach((node, index) => {
      const offset = wheelOffset(index, chosen, count);
      const parked = Math.max(-WHEEL_REACH - 1, Math.min(WHEEL_REACH + 1, offset));
      node.setAttribute('data-offset', String(parked));
      node.setAttribute('aria-pressed', String(offset === 0));
      node.setAttribute('aria-hidden', String(Math.abs(offset) > WHEEL_REACH));
      node.tabIndex = offset === 0 ? 0 : -1;
    });
    text(counter, `${pad2(chosen + 1)} / ${pad2(count)}`);
  }

  /** @param {number} index */
  function choose(index) {
    const hadFocus = items.includes(/** @type {HTMLButtonElement} */ (document.activeElement));
    chosen = index;
    layout();
    if (hadFocus) items[chosen].focus({ preventScroll: true });
    onSelect(games[chosen].id);
  }

  /** @param {number} step */
  const spin = (step) => choose(wheelStep(chosen, step, count));

  track.addEventListener('pointerdown', (event) => {
    swiped = false;
    downX = event.clientX;
  });
  track.addEventListener('pointerup', (event) => {
    const dx = event.clientX - downX;
    if (Math.abs(dx) < SWIPE_PX) return;
    swiped = true;
    spin(dx < 0 ? 1 : -1);
  });

  const root = el('div', { class: 'wheel', role: 'group', 'aria-label': 'Choose a game' }, [
    el('div', { class: 'wheel-row' }, [
      arrow('Previous game', '‹', () => spin(-1)),
      track,
      arrow('Next game', '›', () => spin(1)),
    ]),
    counter,
  ]);
  root.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    spin(step);
  });
  layout();
  return root;
}
