import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { wheelOffset, wheelStep } from '../../src/shell/wheel.js';

describe('wheelOffset', () => {
  it('puts the chosen game at zero and its neighbors at plus and minus one', () => {
    assert.equal(wheelOffset(4, 4, 9), 0);
    assert.equal(wheelOffset(3, 4, 9), -1);
    assert.equal(wheelOffset(5, 4, 9), 1);
  });

  it('wraps the short way around, so the last game sits left of the first', () => {
    assert.equal(wheelOffset(8, 0, 9), -1);
    assert.equal(wheelOffset(0, 8, 9), 1);
    assert.equal(wheelOffset(7, 0, 9), -2);
  });

  it('gives every game a distinct offset within half the wheel', () => {
    for (const count of [2, 3, 8, 9]) {
      const offsets = Array.from({ length: count }, (_, index) => wheelOffset(index, 1, count));
      assert.equal(new Set(offsets).size, count);
      assert.ok(offsets.every((offset) => Math.abs(offset) <= Math.floor(count / 2)));
    }
  });
});

describe('wheelStep', () => {
  it('steps forward and back, wrapping at both ends', () => {
    assert.equal(wheelStep(3, 1, 9), 4);
    assert.equal(wheelStep(8, 1, 9), 0);
    assert.equal(wheelStep(0, -1, 9), 8);
  });
});
