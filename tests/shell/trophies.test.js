import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ALL_TROPHIES,
  countTrophies,
  hasTrophy,
  TROPHIES,
  TROPHY_COUNT,
  trophiesFor,
  trophiesFromTotals,
  trophyBit,
} from '../../src/shell/trophies.js';

const NONE = { allPlayed: false, missedLast: false, recentEnds: 1 };
const end = (fields = {}) => ({
  type: 'end',
  game: 'runner',
  score: 4,
  previous: 9,
  seconds: 10,
  nightly: false,
  ghost: false,
  ...fields,
});
const earned = (event, facts = NONE) => trophiesFor(event, { ...NONE, ...facts });

describe('the trophy list', () => {
  it('has 18 unique ids in a fixed bit order', () => {
    assert.equal(TROPHY_COUNT, 18);
    assert.equal(new Set(TROPHIES.map(([id]) => id)).size, 18);
    assert.equal(TROPHIES[0][0], 'hello');
    assert.equal(TROPHIES[17][0], 'teapot');
    assert.equal(ALL_TROPHIES, 2 ** 18 - 1);
  });

  it('keeps em dashes and emoji out of the copy', () => {
    for (const entry of TROPHIES) assert.match(entry.join(' '), /^[\x20-\x7e]+$/);
  });

  it('reads and counts bits', () => {
    const mask = trophyBit('hello') | trophyBit('teapot');
    assert.ok(hasTrophy(mask, 'teapot'));
    assert.ok(!hasTrophy(mask, 'shipit'));
    assert.equal(countTrophies(mask), 2);
  });
});

describe('trophiesFor', () => {
  it('Hello, World on any finished run', () => {
    assert.deepEqual(earned(end()), ['hello']);
  });

  it('Full Stack once every game is played', () => {
    assert.ok(earned(end(), { allPlayed: true }).includes('fullstack'));
  });

  it('Zero Downtime at 60 s, not 59', () => {
    assert.ok(earned(end({ seconds: 60 })).includes('uptime'));
    assert.ok(!earned(end({ seconds: 59 })).includes('uptime'));
  });

  it('Off by One one point under a best above 1', () => {
    assert.ok(earned(end({ score: 8, previous: 9 })).includes('offbyone'));
    assert.ok(!earned(end({ score: 7, previous: 9 })).includes('offbyone'));
    assert.ok(!earned(end({ score: 0, previous: 1 })).includes('offbyone'));
  });

  it('Hotfix for a new best right after a miss', () => {
    assert.ok(earned(end({ score: 10 }), { missedLast: true }).includes('hotfix'));
    assert.ok(!earned(end({ score: 10 }), { missedLast: false }).includes('hotfix'));
    assert.ok(!earned(end({ score: 9 }), { missedLast: true }).includes('hotfix'));
    assert.ok(!earned(end({ score: 5, previous: 0 }), { missedLast: true }).includes('hotfix'));
  });

  it('Nightly Build for a finished nightly run', () => {
    assert.ok(earned(end({ nightly: true })).includes('nightly'));
  });

  it('Regression Test for a new best while racing the ghost', () => {
    assert.ok(earned(end({ score: 10, ghost: true })).includes('regression'));
    assert.ok(!earned(end({ score: 10, ghost: false })).includes('regression'));
    assert.ok(!earned(end({ score: 3, ghost: true })).includes('regression'));
  });

  it('Kernel Panic at three run ends inside a minute', () => {
    assert.ok(earned(end(), { recentEnds: 3 }).includes('panic'));
    assert.ok(!earned(end(), { recentEnds: 2 }).includes('panic'));
  });

  it('Works on My Machine, git revert, and Garbage Day from power events', () => {
    assert.deepEqual(earned({ type: 'absorb' }), ['works']);
    assert.deepEqual(earned({ type: 'rollback' }), ['revert']);
    assert.deepEqual(earned({ type: 'collect', count: 5 }), ['gcday']);
    assert.deepEqual(earned({ type: 'collect', count: 4 }), []);
    assert.deepEqual(earned({ type: 'power', id: 'gc' }), []);
  });
});

describe('trophiesFromTotals', () => {
  const totals = { powers: 0, closed: 0, streak: 0 };

  it('Feature Complete needs all six power-ups', () => {
    assert.deepEqual(trophiesFromTotals({ ...totals, powers: 62 }, 0), []);
    assert.deepEqual(trophiesFromTotals({ ...totals, powers: 63 }, 0), ['feature']);
  });

  it('Velocity at 5 closed tickets, Three Nines at a 3-day streak, Ship It at v1', () => {
    assert.deepEqual(trophiesFromTotals({ ...totals, closed: 5 }, 0), ['velocity']);
    assert.deepEqual(trophiesFromTotals({ ...totals, streak: 3 }, 0), ['threenines']);
    assert.deepEqual(trophiesFromTotals(totals, 4), []);
    assert.deepEqual(trophiesFromTotals(totals, 5), ['shipit']);
  });
});
