import assert from 'node:assert/strict';
import { test } from 'node:test';

import { benjo } from '../../src/assets/benjo.js';

test('benjo has the head and ring paths', () => {
  assert.equal(benjo.paths.length, 2);
  for (const { d } of benjo.paths) {
    assert.match(d, /^M/);
  }
});

test('benjo viewBox is positive and covers the mark', () => {
  const [x, y, width, height] = benjo.viewBox;
  assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0);
  assert.ok(x + width >= 709 && y + height >= 707);
});
