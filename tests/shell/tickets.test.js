import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advance,
  dealTicket,
  decodeTickets,
  encodeTickets,
  isDone,
  ticketId,
  ticketText,
  ticketXp,
} from '../../src/shell/tickets.js';

const GAMES = [{ id: 'runner' }, { id: 'flight' }, { id: 'stack' }];
const noBest = () => 0;
const best20 = () => 20;
const end = (fields = {}) => ({
  type: 'end',
  game: 'runner',
  score: 0,
  previous: 20,
  seconds: 0,
  nightly: false,
  ghost: false,
  ...fields,
});
const ticket = (kind, goal, game = 'runner') => ({ seq: 4, kind, game, goal, progress: 0 });

describe('dealTicket', () => {
  it('deals the same ticket for the same number', () => {
    for (let seq = 0; seq < 20; seq += 1) {
      assert.deepEqual(dealTicket(seq, GAMES, best20), dealTicket(seq, GAMES, best20));
    }
  });

  it('numbers tickets from BENJO-100', () => {
    assert.equal(ticketId(dealTicket(0, GAMES, noBest)), 'BENJO-100');
    assert.equal(ticketId(dealTicket(37, GAMES, noBest)), 'BENJO-137');
  });

  it('deals every kind with goals and XP in range', () => {
    const kinds = new Set();
    for (let seq = 0; seq < 200; seq += 1) {
      const t = dealTicket(seq, GAMES, best20);
      kinds.add(t.kind);
      assert.ok(GAMES.some((game) => game.id === t.game));
      const goals = [[2, 3], [2, 3], [30, 45], [12], [1]][t.kind];
      assert.ok(goals.includes(t.goal), `kind ${t.kind} goal ${t.goal}`);
      assert.equal(ticketXp(t), [20, 25, 25, 30, 40][t.kind]);
      assert.equal(t.progress, 0);
    }
    assert.deepEqual([...kinds].sort(), [0, 1, 2, 3, 4]);
  });

  it('turns score and beat tickets into play tickets while the game has no best', () => {
    for (let seq = 0; seq < 200; seq += 1) {
      assert.ok(dealTicket(seq, GAMES, noBest).kind < 3);
    }
  });

  it('aims a score ticket at 60% of the best, at least 3', () => {
    const scoreSeq = Array.from({ length: 200 }, (_, seq) => seq).find(
      (seq) => dealTicket(seq, GAMES, best20).kind === 3,
    );
    assert.equal(dealTicket(scoreSeq, GAMES, () => 1).goal, 3);
    assert.equal(dealTicket(scoreSeq, GAMES, () => 7).goal, 5);
  });
});

describe('advance', () => {
  it('counts plays of the ticket game only', () => {
    const t = ticket(0, 2);
    assert.equal(advance(t, end()), 1);
    assert.equal(advance(t, end({ game: 'flight' })), 0);
    assert.equal(advance(t, { type: 'start', game: 'runner', nightly: false }), 0);
  });

  it('counts power-ups fired and rollbacks', () => {
    const t = ticket(1, 2);
    assert.equal(advance(t, { type: 'power', id: 'cache' }), 1);
    assert.equal(advance(t, { type: 'rollback' }), 1);
    assert.equal(advance(t, { type: 'drop', id: 'cache' }), 0);
  });

  it('keeps the longest survival in any game', () => {
    const t = { ...ticket(2, 30), progress: 12 };
    assert.equal(advance(t, end({ game: 'flight', seconds: 31.7 })), 31);
    assert.equal(advance(t, end({ seconds: 5 })), 12);
  });

  it('keeps the top score in the ticket game', () => {
    const t = { ...ticket(3, 12), progress: 4 };
    assert.equal(advance(t, end({ score: 9 })), 9);
    assert.equal(advance(t, end({ score: 30, game: 'flight' })), 4);
  });

  it('closes a beat ticket only on a new best over an old one', () => {
    const t = ticket(4, 1);
    assert.equal(advance(t, end({ score: 21 })), 1);
    assert.equal(advance(t, end({ score: 20 })), 0);
    assert.equal(advance(t, end({ score: 5, previous: 0 })), 0);
  });

  it('is done at the goal', () => {
    assert.ok(isDone({ ...ticket(0, 2), progress: 2 }));
    assert.ok(!isDone({ ...ticket(0, 2), progress: 1 }));
  });
});

describe('ticket text and storage', () => {
  it('reads like a backlog item', () => {
    assert.equal(ticketText(ticket(0, 3), 'Runner'), 'Play Runner 3 times');
    assert.equal(ticketText(ticket(1, 2), 'Runner'), 'Use 2 power-ups');
    assert.equal(ticketText(ticket(2, 45), 'Runner'), 'Survive 45 s in any game');
    assert.equal(ticketText(ticket(3, 12), 'Runner'), 'Score 12 in Runner');
    assert.equal(ticketText(ticket(4, 1), 'Runner'), 'Beat your best in Runner');
  });

  it('round-trips through one short string', () => {
    const tickets = [0, 1, 2].map((seq) => dealTicket(seq, GAMES, best20));
    const raw = encodeTickets(tickets);
    assert.ok(raw.length < 256);
    assert.deepEqual(decodeTickets(raw, new Set(['runner', 'flight', 'stack'])), tickets);
  });

  it('drops malformed tickets and tickets for games no longer bundled', () => {
    const bundled = new Set(['runner']);
    assert.deepEqual(decodeTickets(null, bundled), []);
    assert.deepEqual(decodeTickets('junk 1.2 3.9.runner.1.0 4.0.flight.2.0', bundled), []);
    assert.deepEqual(decodeTickets('5.0.runner.2.1', bundled), [
      { seq: 5, kind: 0, game: 'runner', goal: 2, progress: 1 },
    ]);
  });
});
