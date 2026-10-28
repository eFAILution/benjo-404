import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  freshState,
  levelCost,
  levelOf,
  loadState,
  looksUnlocked,
  runXp,
  saveState,
  version,
} from '../../src/shell/progress.js';
import { createStorage } from '../../src/shell/storage.js';
import { memoryBacking } from './fixtures/fake-host-env.js';

/** Total XP to reach `level` from zero. */
const xpFor = (level) =>
  Array.from({ length: level }, (_, l) => levelCost(l)).reduce((a, b) => a + b, 0);

describe('XP and the build version', () => {
  it('costs 40 + 10L to go from level L to L + 1', () => {
    assert.equal(levelCost(0), 40);
    assert.equal(levelCost(7), 110);
  });

  it('splits XP into a level and the progress inside it', () => {
    assert.deepEqual(levelOf(0), { level: 0, into: 0, cost: 40 });
    assert.deepEqual(levelOf(39), { level: 0, into: 39, cost: 40 });
    assert.deepEqual(levelOf(40), { level: 1, into: 0, cost: 50 });
    assert.deepEqual(levelOf(xpFor(3) + 25), { level: 3, into: 25, cost: 70 });
  });

  it('writes major.minor.patch with five levels to a major and tenths for the patch', () => {
    assert.equal(version(0), 'v0.0.0');
    assert.equal(version(39), 'v0.0.9');
    assert.equal(version(xpFor(3) + 35), 'v0.3.5');
    assert.equal(version(xpFor(5)), 'v1.0.0');
    assert.equal(version(xpFor(12) + 1), 'v2.2.0');
  });

  it('unlocks one look per major release, up to four', () => {
    assert.equal(looksUnlocked(xpFor(5) - 1), 0);
    assert.equal(looksUnlocked(xpFor(5)), 1);
    assert.equal(looksUnlocked(xpFor(20)), 4);
    assert.equal(looksUnlocked(xpFor(40)), 4);
  });

  it('pays a run 5, plus 1 per 4 s up to 15, plus 10 for a new best', () => {
    assert.equal(runXp({ score: 3, previous: 9, seconds: 3 }), 5);
    assert.equal(runXp({ score: 3, previous: 9, seconds: 41 }), 15);
    assert.equal(runXp({ score: 3, previous: 9, seconds: 999 }), 20);
    assert.equal(runXp({ score: 10, previous: 9, seconds: 8 }), 17);
  });

  it('gives no best bonus on the very first score', () => {
    assert.equal(runXp({ score: 10, previous: 0, seconds: 0 }), 5);
  });

  it('never loops forever on huge or negative XP', () => {
    assert.match(version(1e12), /^v\d+\.\d\.\d$/);
    assert.equal(version(-50), 'v0.0.0');
  });
});

describe('progress persistence', () => {
  it('round-trips the state through the meta storage', () => {
    const storage = createStorage('meta', memoryBacking());
    const state = { ...freshState(), xp: 321, trophies: 5, look: 1, runs: 9, lastDay: 20000 };
    saveState(storage, state);
    assert.deepEqual(loadState(storage), state);
  });

  it('keeps each stored value under the 256 char limit', () => {
    const backing = memoryBacking();
    const storage = createStorage('meta', backing);
    const big = Object.fromEntries(Object.keys(freshState()).map((key) => [key, 1e9]));
    saveState(storage, big);
    for (const value of backing.data.values()) assert.ok(value.length <= 256);
    assert.equal(loadState(storage).xp, 1e9);
  });

  it('starts fresh when the data is missing or corrupt', () => {
    const backing = memoryBacking();
    const storage = createStorage('meta', backing);
    assert.deepEqual(loadState(storage), freshState());
    for (const bad of ['', 'garbage', '2,1,2,3', '1,a,b', `1,${'-1,'.repeat(12)}0`, '1,1.5']) {
      backing.data.set('benjo404:meta:p', bad);
      assert.deepEqual(loadState(storage), freshState(), JSON.stringify(bad));
    }
  });

  it('falls back to a fresh state when storage throws', () => {
    const backing = memoryBacking();
    backing.getItem = () => {
      throw new Error('SecurityError');
    };
    assert.deepEqual(loadState(createStorage('meta', backing)), freshState());
  });
});
