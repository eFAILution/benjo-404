// @ts-check
// Turns run events into XP, trophies, and closed tickets (#22), and saves after each one. Every
// change returns the short notices the page shows as toasts.
/** @typedef {import('../contracts').GameStorage} GameStorage */
/** @typedef {import('./host.js').RunEvent} RunEvent */
/** @typedef {import('./tickets.js').Ticket} Ticket */

import { dayNumber, finishNightly } from './nightly.js';
import {
  levelOf,
  loadState,
  looksUnlocked,
  MAJOR_LOOKS,
  runXp,
  saveState,
  TROPHY_XP,
  version,
} from './progress.js';
import { decodeSave, encodeSave, KNOWN_GAMES, mergeSave } from './save-code.js';
import { SKINS } from './skins.js';
import {
  advance,
  BOARD_SIZE,
  dealTicket,
  decodeTickets,
  encodeTickets,
  isDone,
  ticketId,
  ticketXp,
} from './tickets.js';
import { ALL_POWERS, ALL_TROPHIES, TROPHIES, trophiesFor, trophiesFromTotals } from './trophies.js';

/** @type {Record<string, number>} */
const POWER_BITS = { twin: 1, rollback: 2, cache: 4, gc: 8, breakpoint: 16, magnet: 32 };
const PANIC_MS = 60000;
const TICKETS_KEY = 't';
const LEVELS_PER_MAJOR = 5;

/** @param {string} id */
const gameBit = (id) => {
  const index = KNOWN_GAMES.indexOf(/** @type {(typeof KNOWN_GAMES)[number]} */ (id));
  return index < 0 ? 0 : 2 ** index;
};

/**
 * @param {{ storage: GameStorage, games: Array<{ id: string, name: string }>,
 *   bestOf: (id: string) => number, setBest: (id: string, value: number) => void,
 *   now?: () => number }} options games: bundled games, at least one
 */
export function createPipeline({ storage, games, bestOf, setBest, now = Date.now }) {
  const state = loadState(storage);
  const bundled = new Set(games.map((game) => game.id));
  const everyGame = games.reduce((mask, game) => mask | gameBit(game.id), 0);
  let tickets = decodeTickets(storage.get(TICKETS_KEY), bundled);
  /** @type {number[]} */
  let ends = [];
  /** @type {string[]} */
  let notices = [];
  /** @type {{ gained: number, from: string, to: string } | null} */
  let lastRun = null;

  function deal() {
    while (tickets.length < BOARD_SIZE) {
      tickets = [...tickets, dealTicket(state.seq, games, bestOf)];
      state.seq += 1;
    }
  }

  /** @param {number} xp */
  function grant(xp) {
    state.xp = Math.min(1e9, state.xp + xp);
  }

  /** @param {string[]} ids */
  function award(ids) {
    TROPHIES.forEach(([id, name], index) => {
      const bit = 2 ** index;
      if (!ids.includes(id) || state.trophies & bit) return;
      state.trophies |= bit;
      grant(TROPHY_XP);
      notices.push(`Trophy: ${name}`);
    });
  }

  /**
   * Totals trophies, one notice for any level change, then save.
   * @param {number} startLevel
   */
  function settle(startLevel) {
    award(trophiesFromTotals(state, levelOf(state.xp).level));
    const { level } = levelOf(state.xp);
    const major = Math.floor(level / LEVELS_PER_MAJOR);
    if (major > Math.floor(startLevel / LEVELS_PER_MAJOR) && major <= MAJOR_LOOKS) {
      notices.push(`v${major}.0.0 shipped. New look: ${SKINS[major - 1].name}`);
    } else if (level > startLevel) notices.push(`Build bumped to ${version(state.xp)}`);
    saveState(storage, state);
    storage.set(TICKETS_KEY, encodeTickets(tickets));
    const out = notices;
    notices = [];
    return out;
  }

  /** @param {Extract<RunEvent, { type: 'end' }>} event */
  function endRun(event) {
    const time = now();
    const bit = gameBit(event.game);
    const missedLast = (state.missed & bit) !== 0;
    state.runs += 1;
    state.played |= bit;
    state.missed = event.score > event.previous ? state.missed & ~bit : state.missed | bit;
    ends = [...ends.filter((at) => time - at < PANIC_MS), time];
    grant(runXp(event));
    const bonus = event.nightly ? finishNightly(state, dayNumber(time)) : 0;
    if (bonus > 0) {
      grant(bonus);
      notices.push(`Nightly build shipped. +${bonus} XP`);
    }
    const allPlayed = everyGame > 0 && (state.played & everyGame) === everyGame;
    return { allPlayed, missedLast, recentEnds: ends.length };
  }

  /** @param {RunEvent} event */
  function work(event) {
    tickets = tickets.map((ticket) => ({ ...ticket, progress: advance(ticket, event) }));
    for (const ticket of tickets.filter(isDone)) {
      state.closed += 1;
      grant(ticketXp(ticket));
      notices.push(`${ticketId(ticket)} closed. +${ticketXp(ticket)} XP`);
    }
    tickets = tickets.filter((ticket) => !isDone(ticket));
    deal();
  }

  /** @returns {import('./save-code.js').SaveData} */
  function snapshot() {
    const bests = KNOWN_GAMES.map((id) => (bundled.has(id) ? bestOf(id) : 0));
    return { ...state, bests };
  }

  deal();

  return {
    get state() {
      return /** @type {Readonly<typeof state>} */ (state);
    },
    get tickets() {
      return tickets;
    },
    /** XP and version change from the last finished run, for the game over card. */
    get lastRun() {
      return lastRun;
    },
    /** @param {RunEvent} event */
    onEvent(event) {
      const xp = state.xp;
      const startLevel = levelOf(xp).level;
      if (event.type === 'power' || event.type === 'rollback') {
        state.powers |= POWER_BITS[event.type === 'power' ? event.id : 'rollback'] ?? 0;
      }
      const facts =
        event.type === 'end'
          ? endRun(event)
          : { allPlayed: false, missedLast: false, recentEnds: 0 };
      award(trophiesFor(event, facts));
      work(event);
      const out = settle(startLevel);
      if (event.type === 'end')
        lastRun = { gained: state.xp - xp, from: version(xp), to: version(state.xp) };
      return out;
    },
    /** A page load. Coming back on another day earns Legacy Code. */
    visit() {
      const today = dayNumber(now());
      const startLevel = levelOf(state.xp).level;
      if (state.lastDay > 0 && state.lastDay !== today) award(['legacy']);
      state.lastDay = today;
      return settle(startLevel);
    },
    /** @param {string} id a trophy earned outside a run, like the teapot */
    unlock(id) {
      const startLevel = levelOf(state.xp).level;
      award([id]);
      return settle(startLevel);
    },
    /** @param {number} look 0 for none */
    setLook(look) {
      state.look = Math.max(0, Math.min(Math.floor(look) || 0, looksUnlocked(state.xp)));
      saveState(storage, state);
    },
    code: () => encodeSave(snapshot()),
    /**
     * Merge a save code into this browser's progress. Null when the code does not check out.
     * @param {string} code
     * @returns {string[] | null}
     */
    restore(code) {
      const theirs = decodeSave(code);
      if (!theirs) return null;
      const startLevel = levelOf(state.xp).level;
      const merged = mergeSave(snapshot(), theirs, {
        today: dayNumber(now()),
        trophies: ALL_TROPHIES,
        powers: ALL_POWERS,
        games: 2 ** KNOWN_GAMES.length - 1,
        looks: looksUnlocked(Math.max(state.xp, theirs.xp)),
      });
      const { bests, ...numbers } = merged;
      Object.assign(state, numbers);
      KNOWN_GAMES.forEach((id, index) => {
        if (bundled.has(id) && bests[index] > bestOf(id)) setBest(id, bests[index]);
      });
      award(['backup']);
      return settle(startLevel);
    },
  };
}

/** @typedef {ReturnType<typeof createPipeline>} Pipeline */

/**
 * The game over card's XP line, from the 'end' event the host sends just before the card.
 * @param {{ gained: number, from: string, to: string } | null} run
 */
export function xpNote(run) {
  if (!run) return '';
  const change = run.from === run.to ? run.to : `${run.from} to ${run.to}`;
  return `+${run.gained} XP \u00b7 ${change}`;
}
