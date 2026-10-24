import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { HOLIDAYS } from '../../src/holidays/calendar.js';
import { resolveTheme } from '../../src/holidays/resolve.js';

const pack = (id, holiday = id) => ({ id, holiday });

const fixtureThemes = {
  default: pack('default', 'default'),
  halloween: pack('halloween'),
  christmas: pack('christmas'),
  newyear: pack('newyear'),
};

const on = (y, m, d, themes = fixtureThemes) => resolveTheme({ y, m, d }, HOLIDAYS, themes).id;

describe('resolveTheme', () => {
  test('Dec 26 picks christmas over newyear', () => {
    assert.equal(on(2026, 12, 26), 'christmas');
  });

  test('Jan 2 picks newyear', () => {
    assert.equal(on(2027, 1, 2), 'newyear');
  });

  test('Oct 10 picks halloween at the edge of its window', () => {
    assert.equal(on(2026, 10, 10), 'halloween');
    assert.equal(on(2026, 10, 9), 'default');
  });

  test('Nov 1 still shows halloween, Nov 2 does not', () => {
    assert.equal(on(2026, 11, 1), 'halloween');
    assert.equal(on(2026, 11, 2), 'default');
  });

  test('Jul 20 picks default', () => {
    assert.equal(on(2026, 7, 20), 'default');
  });

  test('Dec 28 resolves the newyear of the next year', () => {
    assert.equal(on(2026, 12, 28), 'newyear');
  });

  test('a holiday with no pack is never picked inside its window', () => {
    assert.equal(on(2026, 7, 4), 'default');
    assert.equal(on(2026, 11, 26), 'default');
    assert.equal(on(2026, 4, 5), 'default');
  });

  test('a holiday with a pack is picked when its pack is bundled', () => {
    const themes = { ...fixtureThemes, independence: pack('independence') };
    assert.equal(on(2026, 7, 4, themes), 'independence');
  });

  test('without holiday packs everything resolves to default', () => {
    const themes = { default: pack('default', 'default') };
    for (const [m, d] of [
      [1, 1],
      [10, 31],
      [12, 25],
    ]) {
      assert.equal(on(2026, m, d, themes), 'default');
    }
  });

  test('pack lookup goes by pack.holiday, not by the registry key', () => {
    const themes = {
      default: pack('default', 'default'),
      spooky: pack('spooky', 'halloween'),
    };
    assert.equal(on(2026, 10, 24, themes), 'spooky');
  });
});

describe('resolveTheme tie breaks', () => {
  const fixed = (id, month, day) => ({
    id,
    name: id,
    rule: { kind: 'fixed', month, day },
    before: 5,
    after: 5,
  });

  test('the nearer holiday wins', () => {
    const calendar = [fixed('a', 3, 10), fixed('b', 3, 13)];
    const themes = {
      default: pack('default', 'default'),
      a: pack('a'),
      b: pack('b'),
    };
    assert.equal(resolveTheme({ y: 2026, m: 3, d: 12 }, calendar, themes).id, 'b');
  });

  test('upcoming beats just passed at the same distance', () => {
    const calendar = [fixed('past', 3, 10), fixed('next', 3, 14)];
    const themes = {
      default: pack('default', 'default'),
      past: pack('past'),
      next: pack('next'),
    };
    assert.equal(resolveTheme({ y: 2026, m: 3, d: 12 }, calendar, themes).id, 'next');
  });

  test('same date prefers the earlier calendar entry', () => {
    const calendar = [fixed('first', 3, 14), fixed('second', 3, 14)];
    const themes = {
      default: pack('default', 'default'),
      second: pack('second'),
      first: pack('first'),
    };
    assert.equal(resolveTheme({ y: 2026, m: 3, d: 12 }, calendar, themes).id, 'first');
  });

  test('the window bounds are inclusive on both sides', () => {
    const calendar = [fixed('x', 3, 14)];
    const themes = { default: pack('default', 'default'), x: pack('x') };
    const at = (d) => resolveTheme({ y: 2026, m: 3, d }, calendar, themes).id;
    assert.equal(at(9), 'x');
    assert.equal(at(8), 'default');
    assert.equal(at(19), 'x');
    assert.equal(at(20), 'default');
  });
});
