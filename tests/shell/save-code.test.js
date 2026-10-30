import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decodeSave, encodeSave, KNOWN_GAMES, mergeSave } from '../../src/shell/save-code.js';

const DATA = {
  xp: 1234,
  trophies: 0b101000000000000011,
  look: 2,
  streak: 3,
  nightlyDay: 20389,
  runs: 77,
  seq: 15,
  closed: 12,
  played: 0b110000011,
  powers: 0b101101,
  bests: [41, 0, 7, 300, 0, 0, 0, 0, 1e9],
};
const ZERO = { ...DATA, ...Object.fromEntries(Object.keys(DATA).map((key) => [key, 0])) };
const LIMITS = { today: 20400, trophies: 2 ** 18 - 1, powers: 63, games: 511, looks: 4 };

/** Flip one character to another base32 character. */
const tamper = (code, at) => {
  const chars = [...code];
  const index = chars.findIndex((char, i) => i >= at && char !== '-');
  chars[index] = chars[index] === 'z' ? 'y' : 'z';
  return chars.join('');
};

describe('save codes', () => {
  it('lists the known games in their fixed order', () => {
    assert.deepEqual(KNOWN_GAMES.slice(0, 3), ['runner', 'flight', 'stack']);
    assert.equal(KNOWN_GAMES.length, 9);
  });

  it('round-trips', () => {
    assert.deepEqual(decodeSave(encodeSave(DATA)), DATA);
    assert.deepEqual(decodeSave(encodeSave({ ...ZERO, bests: [] })), { ...ZERO, bests: [] });
  });

  it('reads like commit hashes: lower-case base32 in groups of 7', () => {
    const code = encodeSave(DATA);
    assert.match(code, /^[0-9a-hjkmnp-tv-z]{7}(-[0-9a-hjkmnp-tv-z]{1,7})*$/);
    assert.ok(
      code
        .split('-')
        .slice(0, -1)
        .every((group) => group.length === 7),
    );
    assert.ok(code.length < 120);
  });

  it('forgives case, spaces, and the letters Crockford reads as digits', () => {
    const code = encodeSave(DATA);
    const messy = ` ${code.toUpperCase().replace(/-/g, ' - ').replace(/0/g, 'O').replace(/1/g, 'l')} `;
    assert.deepEqual(decodeSave(messy), DATA);
  });

  it('rejects a changed character', () => {
    const code = encodeSave(DATA);
    for (let at = 0; at < code.length; at += 3) {
      assert.equal(decodeSave(tamper(code, at)), null, `at ${at}`);
    }
  });

  it('rejects junk, cut codes, extra characters, and non-strings without throwing', () => {
    const code = encodeSave(DATA);
    const bad = ['', '-', 'hello world!', 'uuuuuuu', code.slice(0, -1), `${code}0`, `${code}00`];
    for (const value of [...bad, 'z'.repeat(5000), null, 42, {}, undefined]) {
      assert.equal(decodeSave(value), null, JSON.stringify(value)?.slice(0, 20));
    }
  });

  it('clamps values it writes to the range a code may hold', () => {
    const code = encodeSave({ ...DATA, xp: 5e12, runs: -4, seq: Number.NaN });
    const back = decodeSave(code);
    assert.equal(back?.xp, 1e9);
    assert.equal(back?.runs, 0);
    assert.equal(back?.seq, 0);
  });
});

describe('mergeSave', () => {
  it('keeps the larger number and every mask bit', () => {
    const mine = { ...DATA, xp: 5000, trophies: 0b1, played: 0b1000, runs: 3, bests: [50, 2] };
    const merged = mergeSave(mine, DATA, LIMITS);
    assert.equal(merged.xp, 5000);
    assert.equal(merged.runs, 77);
    assert.equal(merged.trophies, DATA.trophies | 1);
    assert.equal(merged.played, DATA.played | 0b1000);
    assert.deepEqual(merged.bests, [50, 2]);
  });

  it('takes their best where it is higher', () => {
    const merged = mergeSave({ ...ZERO, bests: [10, 10, 10, 10] }, DATA, LIMITS);
    assert.deepEqual(merged.bests, [41, 10, 10, 300]);
  });

  it('clamps masks, the look, and a nightly day from the future', () => {
    const theirs = { ...DATA, trophies: 2 ** 29, powers: 255, played: 2 ** 20, look: 9 };
    const merged = mergeSave({ ...ZERO, bests: [] }, { ...theirs, nightlyDay: 99999 }, LIMITS);
    assert.equal(merged.trophies, 0);
    assert.equal(merged.powers, 63);
    assert.equal(merged.played, 0);
    assert.equal(merged.look, 4);
    assert.equal(merged.nightlyDay, LIMITS.today);
  });

  it('keeps the streak of the later nightly day, so an old code cannot inflate today', () => {
    const today = { ...DATA, streak: 1, nightlyDay: LIMITS.today };
    const stale = { ...DATA, streak: 10, nightlyDay: LIMITS.today - 7 };
    for (const [mine, theirs] of [
      [today, stale],
      [stale, today],
    ]) {
      const merged = mergeSave(mine, theirs, LIMITS);
      assert.deepEqual([merged.streak, merged.nightlyDay], [1, LIMITS.today]);
    }
    const sameDay = mergeSave(today, { ...today, streak: 4 }, LIMITS);
    assert.equal(sameDay.streak, 4, 'the same day keeps the longer streak');
    const future = mergeSave(today, { ...stale, nightlyDay: 99999 }, LIMITS);
    assert.equal(future.streak, 10, 'a day from the future counts as today');
  });

  it('keeps the look already picked', () => {
    assert.equal(mergeSave({ ...DATA, look: 1 }, { ...DATA, look: 3 }, LIMITS).look, 1);
  });
});
