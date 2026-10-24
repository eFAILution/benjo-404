import assert from 'node:assert/strict';
import { test } from 'node:test';

import { benjo } from '../../../src/assets/benjo.js';
import {
  contentAspect,
  pathBounds,
  spriteBounds,
} from '../../../src/games/runner/sprite-bounds.js';

function near(actual, expected) {
  for (const [i, v] of actual.entries()) {
    assert.ok(Math.abs(v - expected[i]) < 0.01, `${actual} vs ${expected}`);
  }
}

test('reads absolute and relative lines', () => {
  near(pathBounds('M10 20H50V60H10Z'), [10, 20, 50, 60]);
  near(pathBounds('m10 20l40 0 0 40z'), [10, 20, 50, 60]);
});

test('a circle drawn as two relative arcs covers its whole ellipse', () => {
  near(pathBounds('M2 48a46 46 0 1 1 92 0a46 46 0 1 1 -92 0Z'), [2, 2, 94, 94]);
});

test('sprite bounds are fractions of the viewBox', () => {
  const sprite = { viewBox: [0, 0, 100, 50], paths: [{ d: 'M25 10H75V50H25Z' }] };
  near(spriteBounds(sprite), [0.25, 0.2, 0.75, 1]);
  assert.equal(contentAspect(sprite), 50 / 40);
});

test('unreadable paths fall back to the whole box', () => {
  const sprite = { viewBox: [0, 0, 10, 10], paths: [{ d: 'M0 0 X 5' }] };
  assert.deepEqual(spriteBounds(sprite), [0, 0, 1, 1]);
});

test('the Benjo mark fills its viewBox', () => {
  near(spriteBounds(benjo), [0, 0, 1, 1]);
});
