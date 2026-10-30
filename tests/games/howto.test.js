import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, test } from 'node:test';

import { pickSprite } from '../../src/shell/howto.js';
import { fakeTheme } from '../shell/fixtures/theme.js';

const GAMES = readdirSync(new URL('../../src/games/', import.meta.url));
const PALETTE_KEYS = Object.keys(fakeTheme.palette);

/** @param {string} value @param {number} max @param {string} what */
function short(value, max, what) {
  assert.equal(typeof value, 'string', what);
  assert.ok(value.length > 0, `${what} is empty`);
  assert.ok(value.length <= max, `${what} is ${value.length} chars, over ${max}: ${value}`);
}

describe('every bundled game has a How to play card (#28)', () => {
  test('all ten games are checked', () => {
    assert.equal(GAMES.length, 10);
  });

  for (const id of GAMES) {
    test(`${id}: goal, keys, touch, and things fit the contract`, async () => {
      const { default: game } = await import(`../../src/games/${id}/index.js`);
      const { howTo } = game;
      assert.ok(howTo, `${id} has no howTo`);
      short(howTo.goal, 140, `${id} goal`);
      for (const kind of ['keys', 'touch']) {
        assert.ok(howTo[kind].length > 0, `${id} has no ${kind} lines`);
        for (const [input, action] of howTo[kind]) {
          short(input, 24, `${id} ${kind} input`);
          short(action, 48, `${id} ${kind} action`);
        }
      }
      assert.ok(howTo.things.length > 0, `${id} lists nothing on the board`);
      for (const thing of howTo.things) {
        short(thing.name, 24, `${id} thing name`);
        short(thing.tip, 72, `${id} ${thing.name} tip`);
        assert.ok(thing.sprite || thing.swatch, `${id} ${thing.name} has no icon`);
        if (thing.swatch) assert.ok(PALETTE_KEYS.includes(thing.swatch), thing.swatch);
        if (thing.sprite) assert.ok(pickSprite(fakeTheme, thing.sprite), `${id} ${thing.name}`);
      }
    });
  }
});

describe('pickSprite', () => {
  test('picks benjo, and wraps an index the way the games do', () => {
    const { hazards, pickups } = fakeTheme.sprites;
    assert.equal(pickSprite(fakeTheme, { set: 'benjo' }), fakeTheme.sprites.benjo);
    assert.equal(pickSprite(fakeTheme, { set: 'hazards', index: 0 }), hazards[0]);
    assert.equal(
      pickSprite(fakeTheme, { set: 'pickups', index: pickups.length + 1 }),
      pickups[1 % pickups.length],
    );
  });

  test('returns null for an empty set', () => {
    const theme = { ...fakeTheme, sprites: { ...fakeTheme.sprites, hazards: [] } };
    assert.equal(pickSprite(theme, { set: 'hazards', index: 2 }), null);
  });
});
