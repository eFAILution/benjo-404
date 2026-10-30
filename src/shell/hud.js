// @ts-check
// The strip HUD, the paused and game over cards, and the play prompt. Built only with dom.el().

import { benjo } from '../assets/benjo.js';
import { el, svgIcon, text } from './dom.js';
import { howToBody } from './howto.js';
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
const speakerSvg = () =>
  svgIcon({
    viewBox: '0 0 24 24',
    paths: SPEAKER_PATHS.map(([className, d]) => ({ class: className, d })),
  });

/** The Benjo mark, in the current text color. @param {number} size CSS px */
const benjoMarkSvg = (size) =>
  svgIcon({
    viewBox: benjo.viewBox.join(' '),
    size,
    paths: benjo.paths.map(({ d }) => ({ d, fill: 'currentColor' })),
  });

/** @typedef {import('./host.js').PowerView} PowerView */

/**
 * The power-up slot (#22). It only shows what is running, or an armed Rollback: power-ups fire
 * as they drop (#74), so there is nothing to press. Screen readers hear the drop toast instead.
 * The draining bar reads --left through CSSOM, so no style attribute is written.
 */
function powerSlot() {
  const label = el('span', {});
  const node = el('span', { class: 'hud-power', 'aria-hidden': 'true', hidden: true }, [
    label,
    el('span', { class: 'hud-power-bar' }),
  ]);
  /** @param {PowerView | null} view */
  const set = (view) => {
    node.hidden = !view;
    text(label, view?.label ?? '');
    node.setAttribute('data-state', view?.state ?? '');
    node.style.setProperty('--left', String(view?.left ?? 0));
  };
  return { node, set };
}

/**
 * @param {{ hudRoot: HTMLElement, cardSlot: HTMLElement, promptSlot: HTMLElement,
 *   cta: HTMLAnchorElement, onPause: () => void, onResume: () => void, onQuit: () => void,
 *   onPlay: () => void, onRestart?: () => void, onSelect?: (id: string) => void,
 *   onSwitch?: (id: string) => void, onMute?: () => void, onHowTo?: () => void }} options
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
  const power = powerSlot();
  hudRoot.append(
    status,
    debugLine,
    el('span', { class: 'hud-group' }, [
      el('span', { class: 'hud-label' }, ['Score']),
      scoreValue,
      el('span', { class: 'hud-label' }, ['Best']),
      bestValue,
      power.node,
      options.onMute ? muteButton : null,
      pauseButton,
    ]),
  );

  let score = '0000';
  let best = '0000';
  let statusText = '';

  /**
   * @param {string} titleId
   * @param {Array<Node | null>} children null entries are skipped, as el() skips them
   * @param {HTMLElement | null} focusTarget null leaves focus where it is
   * @param {string} [extraClass] added to the card's class list
   */
  function showCard(titleId, children, focusTarget, extraClass = '') {
    cardSlot.replaceChildren(
      el(
        'div',
        {
          class: extraClass ? `card ${extraClass}` : 'card',
          role: 'dialog',
          'aria-modal': 'false',
          'aria-labelledby': titleId,
        },
        children,
      ),
    );
    focusTarget?.focus();
  }

  /**
   * Opens the How to play card, when the shell offers one.
   * @param {string} [className]
   */
  const howToButton = (className = 'btn btn-ghost') =>
    options.onHowTo ? button('How to play', className, options.onHowTo) : null;

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
    /** @param {PowerView | null} view */
    setPower(view) {
      power.set(view);
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
            howToButton(),
          ]),
          wheel,
          el('div', { class: 'card-actions' }, [button('Quit', 'btn btn-ghost', options.onQuit)]),
        ],
        focus ? resume : null,
      );
    },
    /**
     * The How to play card. `go` starts or resumes the run; `back` returns to where it opened.
     * @param {{ name: string, howTo: import('../contracts').HowTo }} game
     * @param {import('../contracts').ThemePack} theme
     * @param {{ touch: boolean, powers: import('../contracts').PowerId[] }} device
     * @param {{ goLabel: string, onGo: () => void, onBack: () => void }} actions
     */
    showHowTo({ name, howTo }, theme, device, actions) {
      const go = button(actions.goLabel, 'btn btn-primary', actions.onGo);
      showCard(
        'card-title',
        [
          el('p', { class: 'card-kicker', id: 'card-title' }, [`How to play ${name}`]),
          ...howToBody(howTo, theme, device),
          el('div', { class: 'card-actions' }, [
            go,
            button('Back', 'btn btn-ghost', actions.onBack),
          ]),
        ],
        go,
        'card-howto',
      );
    },
    /**
     * With others, an "All games" button follows the switches and quits to the idle picker.
     * @param {{ score: number, best: number, scoreLabel: string, reason: string }} card
     * @param {GameChoice[]} [others] games the player can switch to, each started at once
     * @param {string} [note] one line under the best, like the XP the run earned
     */
    showOver(card, others = [], note = '') {
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
          note ? el('p', { class: 'card-xp' }, [note]) : null,
          card.reason ? el('p', { class: 'card-reason' }, [card.reason]) : null,
          el('div', { class: 'card-actions' }, [again, ...switches, homeLink(cta)]),
        ],
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
      if (picker && onSelect) {
        promptSlot.append(gameWheel(picker.games, picker.current, onSelect, options.onPlay));
      }
      const help = howToButton('btn btn-ghost btn-small');
      if (help) promptSlot.append(help);
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
