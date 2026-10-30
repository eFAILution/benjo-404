// @ts-check
// The build bar on the idle screen and the profile card it opens (#22): the build version and
// looks, the sprint board and nightly build, trophies, and the save code. Built only with el().
/** @typedef {import('./pipeline.js').Pipeline} Pipeline */
/** @typedef {{ id: string, name: string }} GameChoice */

import { el, text } from './dom.js';
import { dayNumber, liveStreak, nightlyGame } from './nightly.js';
import { levelOf, looksUnlocked, version } from './progress.js';
import { SKINS } from './skins.js';
import { ticketId, ticketText, ticketXp } from './tickets.js';
import { countTrophies, hasTrophy, TROPHIES, TROPHY_COUNT } from './trophies.js';

const TABS = ['Build', 'Sprint', 'Trophies', 'Save'];

/**
 * @param {string} label
 * @param {() => void} onClick
 * @param {string} [className]
 */
function button(label, onClick, className = 'btn btn-ghost btn-small') {
  const node = el('button', { type: 'button', class: className }, [label]);
  node.addEventListener('click', onClick);
  return node;
}

/** A thin XP bar. CSSOM sets the fill, so no style attribute is ever written. @param {number} xp */
function xpBar(xp) {
  const bar = el('span', { class: 'xp-bar', 'aria-hidden': 'true' });
  const { into, cost } = levelOf(xp);
  bar.style.setProperty('--fill', String(into / cost));
  return bar;
}

/**
 * The compact button under the game wheel. update() rewrites it in place, so focus stays put.
 * @param {() => void} onOpen
 */
export function createBuildBar(onOpen) {
  const node = el('button', { type: 'button', class: 'build-bar', id: 'build-bar' });
  node.addEventListener('click', onOpen);
  return {
    node,
    /** @param {Pipeline} pipeline */
    update(pipeline) {
      const { xp, trophies } = pipeline.state;
      node.replaceChildren(
        el('span', {}, [`BENJO ${version(xp)}`]),
        xpBar(xp),
        el('span', {}, [`Trophies ${countTrophies(trophies)}/${TROPHY_COUNT}`]),
      );
      node.setAttribute('aria-label', `Build ${version(xp)}. Open profile`);
    },
  };
}

/** @param {Pipeline} pipeline */
function buildPanel(pipeline) {
  const { xp, look, runs, closed } = pipeline.state;
  const { level, into, cost } = levelOf(xp);
  const next = level + 1;
  const unlocked = looksUnlocked(xp);
  const looks = ['None', ...SKINS.map((skin) => skin.name)].map((name, index) => {
    const locked = index > unlocked;
    const node = button(locked ? `${name} · v${index}` : name, () => {
      pipeline.setLook(index);
      for (const sibling of looks) sibling.setAttribute('aria-pressed', String(sibling === node));
    });
    node.setAttribute('aria-pressed', String(index === look));
    node.disabled = locked;
    return node;
  });
  return [
    el('p', { class: 'profile-version' }, [version(xp)]),
    xpBar(xp),
    el('p', { class: 'profile-note' }, [
      `${cost - into} XP to v${Math.floor(next / 5)}.${next % 5}.0`,
    ]),
    el('p', { class: 'profile-label' }, ['Looks']),
    el('div', { class: 'profile-row', role: 'group', 'aria-label': 'Looks' }, looks),
    el('p', { class: 'profile-note' }, [`Runs ${runs} · Tickets closed ${closed}`]),
  ];
}

/**
 * @param {Pipeline} pipeline
 * @param {{ games: GameChoice[], now: () => number, onNightly: () => void }} options
 */
function sprintPanel(pipeline, options) {
  const nameOf = (/** @type {string} */ id) =>
    options.games.find((game) => game.id === id)?.name ?? id;
  const day = dayNumber(options.now());
  const nightly = nightlyGame(day, options.games);
  const shipped = pipeline.state.nightlyDay === day;
  return [
    el(
      'ul',
      { class: 'profile-list' },
      pipeline.tickets.map((ticket) =>
        el('li', {}, [
          el('span', { class: 'profile-label' }, [ticketId(ticket)]),
          el('span', {}, [ticketText(ticket, nameOf(ticket.game))]),
          el('span', { class: 'profile-note' }, [
            `${Math.min(ticket.progress, ticket.goal)}/${ticket.goal} · +${ticketXp(ticket)} XP`,
          ]),
        ]),
      ),
    ),
    el('p', { class: 'profile-label' }, ['Nightly build']),
    el('p', {}, [`${nightly?.name ?? ''} · Uptime ${liveStreak(pipeline.state, day)} days`]),
    el('p', { class: 'profile-note' }, [
      shipped ? 'Shipped today. Replays earn no bonus.' : 'Same seed for everyone today.',
    ]),
    button('Play nightly', options.onNightly, 'btn btn-primary btn-small'),
  ];
}

/** @param {Pipeline} pipeline */
function trophyPanel(pipeline) {
  const mask = pipeline.state.trophies;
  return [
    el(
      'ul',
      { class: 'profile-list' },
      TROPHIES.map(([id, name, how]) => {
        const on = hasTrophy(mask, id);
        return el('li', { class: on ? '' : 'is-locked' }, [
          el('span', {}, [name]),
          el('span', { class: 'profile-note' }, [id === 'teapot' && !on ? '???' : how]),
        ]);
      }),
    ),
  ];
}

/**
 * @param {Pipeline} pipeline
 * @param {{ toast: (messages: string[]) => void }} options
 */
function savePanel(pipeline, options) {
  const code = el('p', { class: 'save-code' }, [pipeline.code()]);
  const result = el('p', { class: 'profile-note', role: 'status' });
  const field = el('input', { type: 'text', class: 'save-field' });
  field.spellcheck = false;
  field.autocomplete = 'off';
  field.maxLength = 240;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.textContent ?? '');
      text(result, 'Copied.');
    } catch {
      text(result, 'Copy blocked. Select the code and copy it.');
    }
  };
  const restore = () => {
    const notices = pipeline.restore(field.value);
    text(result, notices ? 'Restored. Welcome back.' : 'That code did not check out.');
    if (!notices) return;
    text(code, pipeline.code());
    field.value = '';
    options.toast(notices);
  };
  return [
    el('p', { class: 'profile-note' }, [
      'Progress lives in this browser. Copy the code to move it.',
    ]),
    code,
    button('Copy', copy),
    el('label', { class: 'profile-label' }, ['Paste a code', field]),
    button('Restore', restore),
    result,
  ];
}

/**
 * Show the profile card in the card slot. Escape or Close shuts it and calls onClose.
 * @param {HTMLElement} cardSlot
 * @param {Pipeline} pipeline
 * @param {{ games: GameChoice[], now: () => number, onNightly: () => void,
 *   onClose: () => void, toast: (messages: string[]) => void }} options
 */
export function openProfile(cardSlot, pipeline, options) {
  const panel = el('div', { class: 'profile-panel' });
  const close = () => {
    cardSlot.replaceChildren();
    options.onClose();
  };
  const renders = [
    () => buildPanel(pipeline),
    () => sprintPanel(pipeline, options),
    () => trophyPanel(pipeline),
    () => savePanel(pipeline, options),
  ];
  const tabs = TABS.map((label, index) =>
    button(label, () => {
      for (const tab of tabs) tab.setAttribute('aria-pressed', String(tab === tabs[index]));
      panel.replaceChildren(...renders[index]());
    }),
  );
  const card = el(
    'div',
    { class: 'card card-profile', role: 'dialog', 'aria-labelledby': 'profile-title' },
    [
      el('div', { class: 'profile-head' }, [
        el('p', { class: 'card-kicker', id: 'profile-title' }, ['Build info']),
        button('Close', close),
      ]),
      el('div', { class: 'profile-tabs', role: 'group', 'aria-label': 'Sections' }, tabs),
      panel,
    ],
  );
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close();
  });
  cardSlot.replaceChildren(card);
  tabs[0].click();
  tabs[0].focus();
}
