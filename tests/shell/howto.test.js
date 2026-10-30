import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { cardPowers, howToBody } from '../../src/shell/howto.js';
import { fakeTheme } from './fixtures/theme.js';

/** Just enough of document for dom.el(): elements keep their attributes and children. */
function fakeDocument() {
  return {
    createElement(tag) {
      const attrs = new Map();
      return {
        tag,
        attrs,
        children: [],
        getContext: () => null,
        setAttribute: (name, value) => attrs.set(name, value),
        appendChild(child) {
          this.children.push(child);
        },
      };
    },
    createTextNode: (text) => ({ text }),
  };
}

/** @param {any} node */
const textOf = (node) =>
  node === null ? '' : 'text' in node ? node.text : node.children.map(textOf).join(' ');

/** @param {any[]} nodes @param {string} cls */
function byClass(nodes, cls) {
  const found = [];
  const walk = (node) => {
    if (!node || 'text' in node) return;
    if ((node.attrs.get('class') ?? '').split(' ').includes(cls)) found.push(node);
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return found;
}

const HOW_TO = {
  goal: 'Dodge the bugs.',
  keys: [['Space', 'Jump']],
  touch: [['Tap', 'Jump']],
  things: [{ swatch: 'ink', name: 'Bug', tip: 'Avoid it' }],
  powers: { gc: 'Clears every bug on screen' },
};

describe('howToBody (#64)', () => {
  let saved;
  beforeEach(() => {
    saved = globalThis.document;
    globalThis.document = fakeDocument();
  });
  afterEach(() => {
    globalThis.document = saved;
  });

  it('shows only the touch controls on a touch device', () => {
    const body = howToBody(HOW_TO, fakeTheme, { touch: true, powers: [] });
    const labels = byClass(body, 'howto-label').map(textOf);
    assert.deepEqual(labels, ['Touch']);
    assert.deepEqual(byClass(body, 'howto-input').map(textOf), ['Tap']);
  });

  it('shows only the keys otherwise', () => {
    const body = howToBody(HOW_TO, fakeTheme, { touch: false, powers: [] });
    assert.deepEqual(byClass(body, 'howto-label').map(textOf), ['Keys']);
    assert.deepEqual(byClass(body, 'howto-input').map(textOf), ['Space']);
  });

  it('falls back to the other kind when a game has no lines for this device', () => {
    const body = howToBody({ ...HOW_TO, touch: [] }, fakeTheme, { touch: true, powers: [] });
    assert.deepEqual(byClass(body, 'howto-label').map(textOf), ['Keys']);
  });

  it("lists each power-up with its badge, the game's tip, or the shell's", () => {
    const body = howToBody(HOW_TO, fakeTheme, { touch: false, powers: ['cache', 'gc'] });
    assert.deepEqual(byClass(body, 'howto-badge').map(textOf), ['2X', 'GC']);
    const names = byClass(body, 'howto-thing-name').map(textOf);
    assert.deepEqual(names, ['Bug', 'Cache Hit, 10 s', 'Garbage Collector']);
    const tips = byClass(body, 'howto-tip').map(textOf);
    assert.ok(tips.includes('Every point counts double'));
    assert.ok(tips.includes('Clears every bug on screen'));
  });

  it('says power-ups start as they drop, with nothing to press (#74)', () => {
    for (const touch of [false, true]) {
      const section = byClass(
        howToBody(HOW_TO, fakeTheme, { touch, powers: ['cache'] }),
        'howto-fire',
      ).map(textOf);
      assert.equal(section.length, 1);
      assert.match(section[0], /start at once/);
      assert.doesNotMatch(section[0], /Press E|Tap the slot/);
    }
  });

  it('leaves the section out when the game drops no power-ups', () => {
    const body = howToBody(HOW_TO, fakeTheme, { touch: false, powers: [] });
    assert.deepEqual(byClass(body, 'howto-badge'), []);
  });
});

describe('cardPowers', () => {
  it('puts the two host powers first, then the game list, once each', () => {
    assert.deepEqual(cardPowers(['twin', 'cache', 'magnet']), [
      'cache',
      'breakpoint',
      'twin',
      'magnet',
    ]);
  });

  it('skips ids it does not know, and handles a game with no list', () => {
    assert.deepEqual(cardPowers(['laser']), ['cache', 'breakpoint']);
    assert.deepEqual(cardPowers(undefined), ['cache', 'breakpoint']);
  });
});
