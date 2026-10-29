// @ts-check
// The strip HUD, the paused and game over cards, and the play prompt. Built only with dom.el().

import { benjoMarkSvg, SVG_NS } from '../assets/benjo.js';
import { el, text } from './dom.js';
import { gameWheel } from './wheel.js';

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

/** @typedef {import('./wheel.js').GameChoice} GameChoice */

const SPEAKER_PATHS = [
  ['hud-mute-body', 'M4 9h4l5-4v14l-5-4H4z'],
  ['hud-mute-wave', 'M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11'],
  ['hud-mute-cross', 'M16 9l5 6M21 9l-5 6'],
];

/** A speaker icon. The CSS shows the waves while sound is on and the cross while muted. */
function speakerSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [className, d] of SPEAKER_PATHS) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', className);
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

/**
 * @param {{ hudRoot: HTMLElement, cardSlot: HTMLElement, promptSlot: HTMLElement,
 *   cta: HTMLAnchorElement, onPause: () => void, onResume: () => void, onQuit: () => void,
 *   onPlay: () => void, onRestart?: () => void, onSelect?: (id: string) => void,
 *   onSwitch?: (id: string) => void, onMute?: () => void }} options
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
  const muteButton = el(
    'button',
    { type: 'button', class: 'hud-mute', 'aria-label': 'Mute sound', 'aria-pressed': 'false' },
    [speakerSvg()],
  );
  // A click never takes focus, so Space and the arrows keep going to the game.
  muteButton.addEventListener('pointerdown', (event) => event.preventDefault());
  muteButton.addEventListener('click', () => options.onMute?.());
  hudRoot.append(
    status,
    debugLine,
    el('span', { class: 'hud-group' }, [
      el('span', { class: 'hud-label' }, ['Score']),
      scoreValue,
      el('span', { class: 'hud-label' }, ['Best']),
      bestValue,
      options.onMute ? muteButton : null,
      pauseButton,
    ]),
  );

  let score = '0000';
  let best = '0000';
  let statusText = '';

  /**
   * @param {string} titleId
   * @param {Array<Node>} children
   * @param {HTMLElement | null} focusTarget null leaves focus where it is
   */
  function showCard(titleId, children, focusTarget) {
    cardSlot.replaceChildren(
      el(
        'div',
        { class: 'card', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': titleId },
        children,
      ),
    );
    focusTarget?.focus();
  }

  /** @param {Element} node */
  function showPrompt(node) {
    promptSlot.replaceChildren(node);
  }

  return {
    pauseButton,
    /** @param {boolean} muted */
    setMuted(muted) {
      muteButton.setAttribute('aria-pressed', String(muted));
    },
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
    /**
     * A pause from focus entering the message strip passes focus false, so Tab can carry on to
     * Return Home instead of being pulled back to Resume. With a picker, the wheel sits between
     * Play again and Quit; spinning it only chooses, and pressing the middle game starts it.
     * @param {{ focus?: boolean }} [how]
     * @param {{ games: GameChoice[], current: string } | null} [picker]
     */
    showPaused({ focus = true } = {}, picker = null) {
      const resume = button('Resume', 'btn btn-primary', options.onResume);
      let chosen = picker?.current ?? '';
      const wheel =
        picker && options.onSwitch
          ? gameWheel(
              picker.games,
              picker.current,
              (id) => {
                chosen = id;
              },
              () => options.onSwitch?.(chosen),
            )
          : null;
      showCard(
        'card-title',
        [
          el('p', { class: 'card-kicker', id: 'card-title' }, ['Paused']),
          el('div', { class: 'card-actions' }, [
            resume,
            options.onRestart ? button('Play again', 'btn btn-ghost', options.onRestart) : null,
          ]),
          wheel,
          el('div', { class: 'card-actions' }, [button('Quit', 'btn btn-ghost', options.onQuit)]),
        ].filter((node) => node !== null),
        focus ? resume : null,
      );
    },
    /**
     * With others, an "All games" button follows the switches and quits to the idle picker.
     * @param {{ score: number, best: number, scoreLabel: string, reason: string }} card
     * @param {GameChoice[]} [others] games the player can switch to, each started at once
     */
    showOver(card, others = []) {
      const again = button('Play again', 'btn btn-primary', options.onPlay);
      const switches = others.map((game) =>
        button(`Play ${game.name}`, 'btn btn-ghost', () => options.onSwitch?.(game.id)),
      );
      if (switches.length > 0) switches.push(button('All games', 'btn btn-ghost', options.onQuit));
      showCard(
        'card-title',
        [
          el('p', { class: 'card-kicker', id: 'card-title' }, [card.scoreLabel]),
          el('p', { class: 'card-score' }, [pad4(card.score)]),
          el('p', { class: 'card-best' }, [`Best ${pad4(card.best)}`]),
          card.reason ? el('p', { class: 'card-reason' }, [card.reason]) : null,
          el('div', { class: 'card-actions' }, [again, ...switches, homeLink(cta)]),
        ].filter((node) => node !== null),
        again,
      );
    },
    clearCard() {
      cardSlot.replaceChildren();
    },
    /**
     * @param {string} label
     * @param {{ games: GameChoice[], current: string } | null} [picker] shown under the prompt
     */
    showPlayPrompt(label, picker = null) {
      const node = el('button', { type: 'button', class: 'prompt', id: 'play-prompt' }, [
        benjoMarkSvg(PROMPT_ICON_PX),
        el('span', {}, [label]),
      ]);
      node.addEventListener('click', options.onPlay);
      showPrompt(node);
      const { onSelect } = options;
      if (!picker || !onSelect) return;
      promptSlot.append(gameWheel(picker.games, picker.current, onSelect, options.onPlay));
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
