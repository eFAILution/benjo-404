import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import defaultMessage from '../../src/messages/default.js';
import short from '../../src/messages/short.js';
import { nextGames, OVER_SWITCH_MAX, parseDay, pickGame, resolve } from '../../src/shell/boot.js';
import { readQuery } from '../../src/shell/dom.js';
import { fakeHalloween, fakeTheme } from './fixtures/theme.js';

const runner = { id: 'runner' };
const defense = { id: 'defense' };
const messages = { default: defaultMessage, short };
const registry = {
  messages,
  games: { runner, defense },
  themes: { default: fakeTheme, halloween: fakeHalloween },
};
const config = { message: 'default', games: ['runner', 'defense'], theme: 'auto', themes: [] };
const NOW = new Date(2026, 6, 20, 12, 0, 0);

const run = (query = {}, overrides = {}) =>
  resolve(
    overrides.registry ?? registry,
    overrides.config ?? config,
    query,
    overrides.now ?? NOW,
    overrides.rm ?? false,
    overrides.pick ?? null,
    overrides.random,
  );

describe('resolve: message', () => {
  it('uses config.message by default', () => {
    assert.equal(run().message.id, 'default');
  });
  it('takes a bundled ?message', () => {
    assert.equal(run({ message: 'short' }).message.id, 'short');
  });
  it('ignores unknown or unsafe ?message', () => {
    assert.equal(run({ message: 'nope' }).message.id, 'default');
    assert.equal(run({ message: '__proto__' }).message.id, 'default');
    assert.equal(run({ message: 'Short' }).message.id, 'default');
  });
});

describe('resolve: game', () => {
  it('defaults to the first configured game', () => {
    assert.equal(run().game, runner);
  });
  it('takes a bundled ?game', () => {
    assert.equal(run({ game: 'defense' }).game, defense);
  });
  it('?game=none gives null', () => {
    assert.equal(run({ game: 'none' }).game, null);
  });
  it('rejects ?game=../x and falls back to the default', () => {
    assert.equal(run({ game: '../x' }).game, runner);
    assert.equal(run({ game: 'toString' }).game, runner);
  });
  it('is null when no games are bundled', () => {
    const empty = { ...registry, games: {} };
    assert.equal(run({}, { registry: empty }).game, null);
  });
});

describe('resolve: game selection (ADR-0014)', () => {
  it('starts on a random bundled game by default', () => {
    assert.equal(run({}, { random: () => 0 }).game, runner);
    assert.equal(run({}, { random: () => 0.99 }).game, defense);
  });
  it('starts on the first configured game with startGame first', () => {
    const first = { ...config, startGame: 'first' };
    assert.equal(run({}, { config: first, random: () => 0.99 }).game, runner);
  });
  it('?game= still pins a game whatever the random draw', () => {
    assert.equal(run({ game: 'runner' }, { random: () => 0.99 }).game, runner);
  });
  it('lists bundled, configured games once each, in config order', () => {
    const listed = { ...config, games: ['defense', 'ghost', 'runner', 'defense'] };
    assert.deepEqual(run({}, { config: listed }).games, [defense, runner]);
  });
  it('offers the picker only with two or more games and gamePicker not false', () => {
    assert.equal(run().picker, true);
    assert.equal(run({}, { config: { ...config, gamePicker: false } }).picker, false);
    assert.equal(run({}, { config: { ...config, games: ['runner'] } }).picker, false);
    assert.equal(run({ game: 'none' }).picker, false);
  });
  it('pickGame never leaves the list, even for a random() of exactly 1', () => {
    assert.equal(
      pickGame([runner, defense], config, {}, () => 1),
      defense,
    );
    assert.equal(
      pickGame([runner, defense], config, {}, () => -1),
      runner,
    );
    assert.equal(
      pickGame([], config, {}, () => 0),
      null,
    );
  });
});

describe('nextGames: the game over card switches (A-20.1)', () => {
  const nine = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => ({ id }));
  const ids = (list) => list.map((game) => game.id);

  it('caps at two, the next games in config order', () => {
    assert.equal(OVER_SWITCH_MAX, 2);
    assert.deepEqual(ids(nextGames(nine, nine[0])), ['b', 'c']);
    assert.deepEqual(ids(nextGames(nine, nine[4])), ['f', 'g']);
  });
  it('wraps past the end of the list', () => {
    assert.deepEqual(ids(nextGames(nine, nine[7])), ['i', 'a']);
    assert.deepEqual(ids(nextGames(nine, nine[8])), ['a', 'b']);
  });
  it('never offers the current game, even with fewer games than the cap', () => {
    assert.deepEqual(ids(nextGames(nine.slice(0, 2), nine[1])), ['a']);
    assert.deepEqual(nextGames(nine.slice(0, 1), nine[0]), []);
    assert.deepEqual(nextGames([], null), []);
  });
});

describe('resolve: date', () => {
  it('uses ?date when valid', () => {
    assert.deepEqual(run({ date: '2026-10-24' }).date, { y: 2026, m: 10, d: 24 });
  });
  it('rejects ?date=2026-13-40 and uses the local date', () => {
    assert.deepEqual(run({ date: '2026-13-40' }).date, { y: 2026, m: 7, d: 20 });
    assert.deepEqual(run({ date: '2026-02-30' }).date, { y: 2026, m: 7, d: 20 });
    assert.deepEqual(run({ date: '26-1-1' }).date, { y: 2026, m: 7, d: 20 });
  });
  it('parses leap days correctly', () => {
    assert.deepEqual(parseDay('2028-02-29'), { y: 2028, m: 2, d: 29 });
    assert.equal(parseDay('2027-02-29'), null);
  });
});

describe('resolve: theme', () => {
  const alwaysHalloween = (_date, themes) => themes.halloween;

  it('?theme=none gives the default theme', () => {
    assert.equal(run({ theme: 'none' }, { pick: alwaysHalloween }).theme, fakeTheme);
  });
  it('takes a bundled ?theme', () => {
    assert.equal(run({ theme: 'halloween' }).theme, fakeHalloween);
  });
  it('rejects ?theme=HALLOWEEN', () => {
    assert.equal(run({ theme: 'HALLOWEEN' }).theme, fakeTheme);
  });
  it('honors a config pin', () => {
    const pinned = { ...config, theme: 'halloween' };
    assert.equal(run({}, { config: pinned, pick: () => fakeTheme }).theme, fakeHalloween);
  });
  it('falls back to default when the pin is not bundled', () => {
    assert.equal(run({}, { config: { ...config, theme: 'christmas' } }).theme, fakeTheme);
  });
  it('auto asks the holiday resolver with the resolved date', () => {
    const seen = [];
    const pick = (date, themes) => {
      seen.push(date);
      return themes.halloween;
    };
    assert.equal(run({ date: '2026-10-24' }, { pick }).theme, fakeHalloween);
    assert.deepEqual(seen, [{ y: 2026, m: 10, d: 24 }]);
  });
  it('auto without a resolver, or a resolver that returns nothing, gives default', () => {
    assert.equal(run().theme, fakeTheme);
    assert.equal(run({}, { pick: () => null }).theme, fakeTheme);
  });
  it('throws when there is no default theme', () => {
    const noDefault = { ...registry, themes: { halloween: fakeHalloween } };
    assert.throws(() => run({}, { registry: noDefault }), /no default theme/);
  });
});

describe('resolve: flags', () => {
  it('reducedMotion from ?rm=1 or the media query', () => {
    assert.equal(run().reducedMotion, false);
    assert.equal(run({ rm: '1' }).reducedMotion, true);
    assert.equal(run({}, { rm: true }).reducedMotion, true);
  });
  it('debug only for ?debug=1', () => {
    assert.equal(run({ debug: '1' }).debug, true);
    assert.equal(run({ debug: 'true' }).debug, false);
  });
});

describe('readQuery', () => {
  it('keeps known keys with safe values only', () => {
    const query = readQuery(
      '?game=runner&theme=HALLOWEEN&date=2026-10-24&message=../x&debug=1&evil=1&rm=%3Cb%3E',
    );
    assert.deepEqual(query, { game: 'runner', date: '2026-10-24', debug: '1' });
  });
  it('rejects ids over 32 characters', () => {
    assert.deepEqual(readQuery(`?game=${'a'.repeat(33)}`), {});
  });
});
