import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  dayNumber,
  finishNightly,
  liveStreak,
  mulberry32,
  nightlyGame,
  nightlyRandom,
} from '../../src/shell/nightly.js';

const GAMES = ['runner', 'flight', 'stack', 'tail', 'breakout'].map((id) => ({ id }));
const DAY = 20000;

describe('nightly build', () => {
  it('counts UTC days, turning over at midnight UTC', () => {
    const midnight = Date.UTC(2026, 9, 28);
    assert.equal(dayNumber(midnight) - dayNumber(midnight - 1), 1);
    assert.equal(dayNumber(midnight), dayNumber(midnight + 86399999));
  });

  it('seeds a repeatable generator in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 50; i += 1) {
      const value = a();
      assert.equal(value, b());
      assert.ok(value >= 0 && value < 1);
    }
    assert.notEqual(mulberry32(1)(), mulberry32(2)());
  });

  it('picks the same game for everyone on a day, and varies across days', () => {
    assert.equal(nightlyGame(DAY, GAMES), nightlyGame(DAY, GAMES));
    const picks = new Set(Array.from({ length: 30 }, (_, i) => nightlyGame(DAY + i, GAMES)?.id));
    assert.ok(picks.size > 2);
    assert.equal(nightlyGame(DAY, []), undefined);
  });

  it('gives each day its own seeded run random', () => {
    assert.equal(nightlyRandom(DAY)(), nightlyRandom(DAY)());
    assert.notEqual(nightlyRandom(DAY)(), nightlyRandom(DAY + 1)());
  });

  it('pays 30 + 10 per streak day up to 5, once a day', () => {
    const state = { streak: 0, nightlyDay: 0 };
    assert.equal(finishNightly(state, DAY), 40);
    assert.equal(finishNightly(state, DAY), 0);
    assert.equal(finishNightly(state, DAY + 1), 50);
    assert.deepEqual(state, { streak: 2, nightlyDay: DAY + 1 });
    const long = { streak: 9, nightlyDay: DAY - 1 };
    assert.equal(finishNightly(long, DAY), 80);
  });

  it('resets the streak after a missed day', () => {
    const state = { streak: 4, nightlyDay: DAY - 2 };
    assert.equal(finishNightly(state, DAY), 40);
    assert.equal(state.streak, 1);
  });

  it('shows a live streak only while yesterday or today shipped', () => {
    assert.equal(liveStreak({ streak: 3, nightlyDay: DAY }, DAY), 3);
    assert.equal(liveStreak({ streak: 3, nightlyDay: DAY - 1 }, DAY), 3);
    assert.equal(liveStreak({ streak: 3, nightlyDay: DAY - 2 }, DAY), 0);
  });
});
