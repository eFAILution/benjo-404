// @ts-check
// The sprint board (#22): three tickets at a time. A ticket comes from its sequence number, so a
// reload deals the same one, and closing a ticket deals the next number.
/** @typedef {import('./host.js').RunEvent} RunEvent */
/**
 * kind: 0 play a game N times, 1 use N power-ups, 2 survive N s in any game, 3 score N in a
 * game, 4 beat your best in a game.
 * @typedef {{ seq: number, kind: number, game: string, goal: number, progress: number }} Ticket
 */

import { mulberry32 } from './nightly.js';

export const BOARD_SIZE = 3;
const XP = [20, 25, 25, 30, 40];

/** @param {Ticket} ticket */
export const ticketId = (ticket) => `BENJO-${100 + ticket.seq}`;
/** @param {Ticket} ticket */
export const ticketXp = (ticket) => XP[ticket.kind] ?? 20;
/** @param {Ticket} ticket */
export const isDone = (ticket) => ticket.progress >= ticket.goal;

/**
 * Deal ticket `seq`. Score and beat tickets need a best to aim at, so with none they become play.
 * @param {number} seq
 * @param {Array<{ id: string }>} games bundled games, at least one
 * @param {(id: string) => number} bestOf
 * @returns {Ticket}
 */
export function dealTicket(seq, games, bestOf) {
  const random = mulberry32(seq * 7919 + 17);
  const game = games[Math.floor(random() * games.length)].id;
  const best = bestOf(game);
  let kind = Math.floor(random() * XP.length);
  if (kind >= 3 && best <= 0) kind = 0;
  const pick = random() < 0.5;
  const goal = [pick ? 2 : 3, pick ? 2 : 3, pick ? 30 : 45, Math.max(3, Math.ceil(best * 0.6)), 1];
  return { seq, kind, game, goal: goal[kind], progress: 0 };
}

/**
 * The ticket's progress after one run event.
 * @param {Ticket} ticket
 * @param {RunEvent} event
 * @returns {number}
 */
export function advance(ticket, event) {
  const { kind, progress } = ticket;
  if (kind === 1)
    return event.type === 'power' || event.type === 'rollback' ? progress + 1 : progress;
  if (event.type !== 'end') return progress;
  if (kind === 2) return Math.max(progress, Math.floor(event.seconds));
  if (event.game !== ticket.game) return progress;
  if (kind === 0) return progress + 1;
  if (kind === 3) return Math.max(progress, event.score);
  return event.score > event.previous && event.previous > 0 ? 1 : progress;
}

/**
 * @param {Ticket} ticket
 * @param {string} name the ticket's game name
 */
export function ticketText(ticket, name) {
  const { goal } = ticket;
  return [
    `Play ${name} ${goal} times`,
    `Use ${goal} power-ups`,
    `Survive ${goal} s in any game`,
    `Score ${goal} in ${name}`,
    `Beat your best in ${name}`,
  ][ticket.kind];
}

/** @param {Ticket[]} tickets */
export const encodeTickets = (tickets) =>
  tickets.map((t) => [t.seq, t.kind, t.game, t.goal, t.progress].join('.')).join(' ');

/**
 * Saved tickets, keeping only well formed ones for games still bundled.
 * @param {string | null} raw
 * @param {Set<string>} bundled
 * @returns {Ticket[]}
 */
export function decodeTickets(raw, bundled) {
  /** @type {Ticket[]} */
  const tickets = [];
  for (const part of (raw ?? '').split(' ').slice(0, BOARD_SIZE)) {
    const [seq, kind, game, goal, progress] = part.split('.');
    const [s, k, g, p] = [seq, kind, goal, progress].map(Number);
    const whole = [s, k, g, p].every((n) => Number.isInteger(n) && n >= 0 && n <= 1e6);
    if (whole && k < XP.length && bundled.has(game)) {
      tickets.push({ seq: s, kind: k, game, goal: g, progress: p });
    }
  }
  return tickets;
}
