// @ts-check
// The strip HUD, the paused and game over cards, and the play prompt. Built only with dom.el().

import { benjoMarkSvg } from '../assets/benjo.js';
import { el, text } from './dom.js';

const PROMPT_ICON_PX = 20;

/** @param {number} value */
export function pad4(value) {
  return String(Math.max(0, Math.floor(Number(value) || 0))).padStart(4, '0');
}

/**
 * @param {string} label
 * @param {string} className
 * @param {() => void} onClick
 */
function button(label, className, onClick) {
  const node = el('button', { type: 'button', class: className }, [label]);
  node.addEventListener('click', onClick);
  return node;
}

/**
 * The card's RETURN HOME is a copy of the static link, so the shell never writes an href.
 * @param {HTMLAnchorElement} cta
 */
function homeLink(cta) {
  const link = /** @type {HTMLAnchorElement} */ (cta.cloneNode(true));
  link.removeAttribute('id');
  link.className = 'btn btn-ghost';
  return link;
}

/**
 * @param {{ hudRoot: HTMLElement, cardSlot: HTMLElement, promptSlot: HTMLElement,
 *   cta: HTMLAnchorElement, onPause: () => void, onResume: () => void, onQuit: () => void,
 *   onPlay: () => void }} options
 */
export function createHud(options) {
  const { hudRoot, cardSlot, promptSlot, cta } = options;

  const status = el('span', { class: 'hud-status', role: 'status', 'aria-live': 'polite' });
  const debugLine = el('span', { class: 'hud-debug', hidden: true });
  const scoreValue = el('span', { class: 'hud-value hud-score' }, ['0000']);
  const bestValue = el('span', { class: 'hud-value' }, ['0000']);
  const pauseButton = el(
    'button',
    { type: 'button', class: 'hud-pause', 'aria-label': 'Pause game' },
    [
      el('span', { class: 'hud-pause-bar', 'aria-hidden': 'true' }),
      el('span', { class: 'hud-pause-bar', 'aria-hidden': 'true' }),
    ],
  );
  pauseButton.addEventListener('click', options.onPause);
  hudRoot.append(
    status,
    debugLine,
    el('span', { class: 'hud-group' }, [
      el('span', { class: 'hud-label' }, ['Score']),
      scoreValue,
      el('span', { class: 'hud-label' }, ['Best']),
      bestValue,
      pauseButton,
    ]),
  );

  let score = '0000';
  let best = '0000';
  let statusText = '';

  /**
   * @param {string} titleId
   * @param {Array<Node>} children
   * @param {HTMLElement} focusTarget
   */
  function showCard(titleId, children, focusTarget) {
    cardSlot.replaceChildren(
      el(
        'div',
        { class: 'card', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': titleId },
        children,
      ),
    );
    focusTarget.focus();
  }

  /** @param {Element} node */
  function showPrompt(node) {
    promptSlot.replaceChildren(node);
  }

  return {
    pauseButton,
    /** @param {number} value */
    setScore(value) {
      const next = pad4(value);
      if (next === score) return;
      score = next;
      text(scoreValue, next);
    },
    /** @param {number} value */
    setBest(value) {
      const next = pad4(value);
      if (next === best) return;
      best = next;
      text(bestValue, next);
    },
    /** @param {string} value */
    setStatus(value) {
      const next = String(value).slice(0, 40);
      if (next === statusText) return;
      statusText = next;
      text(status, next);
    },
    /** @param {string} line */
    setDebug(line) {
      text(debugLine, line);
      debugLine.hidden = line === '';
    },
    showPaused() {
      const resume = button('Resume', 'btn btn-primary', options.onResume);
      showCard(
        'card-title',
        [
          el('p', { class: 'card-kicker', id: 'card-title' }, ['Paused']),
          el('div', { class: 'card-actions' }, [
            resume,
            button('Quit', 'btn btn-ghost', options.onQuit),
          ]),
        ],
        resume,
      );
    },
    /** @param {{ score: number, best: number, scoreLabel: string, reason: string }} card */
    showOver(card) {
      const again = button('Play again', 'btn btn-primary', options.onPlay);
      showCard(
        'card-title',
        [
          el('p', { class: 'card-kicker', id: 'card-title' }, [card.scoreLabel]),
          el('p', { class: 'card-score' }, [pad4(card.score)]),
          el('p', { class: 'card-best' }, [`Best ${pad4(card.best)}`]),
          card.reason ? el('p', { class: 'card-reason' }, [card.reason]) : null,
          el('div', { class: 'card-actions' }, [again, homeLink(cta)]),
        ].filter((node) => node !== null),
        again,
      );
    },
    clearCard() {
      cardSlot.replaceChildren();
    },
    /** @param {string} label */
    showPlayPrompt(label) {
      const node = el('button', { type: 'button', class: 'prompt', id: 'play-prompt' }, [
        benjoMarkSvg(PROMPT_ICON_PX),
        el('span', {}, [label]),
      ]);
      node.addEventListener('click', options.onPlay);
      showPrompt(node);
    },
    showError() {
      showPrompt(
        el('div', { class: 'prompt-error' }, [
          el('span', { class: 'prompt-status', role: 'status' }, ['Benjo wandered off.']),
          button('Try again', 'btn btn-ghost btn-small', options.onPlay),
        ]),
      );
    },
    hidePrompt() {
      promptSlot.replaceChildren();
    },
  };
}
