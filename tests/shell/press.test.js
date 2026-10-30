import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createPress,
  isTapEcho,
  pointerPressed,
  resetPress,
  TAP_ECHO,
} from '../../src/shell/press.js';
import { wrap } from '../../src/shell/wrap.js';

const input = (down) => ({ pointer: down === null ? null : { x: 0, y: 0, down } });

describe('press', () => {
  it('reports the down edge once and records when it happened', () => {
    const tracker = createPress();
    assert.equal(pointerPressed(tracker, input(true), 1), true);
    assert.equal(tracker.pointerAt, 1);
    assert.equal(pointerPressed(tracker, input(true), 1.1), false, 'still held is not a new press');
    assert.equal(pointerPressed(tracker, input(false), 1.2), false);
    assert.equal(pointerPressed(tracker, input(null), 1.3), false, 'no pointer at all');
    assert.equal(tracker.pointerAt, 1);
  });

  it('treats a host tap soon after the press as its echo', () => {
    const tracker = createPress();
    assert.equal(isTapEcho(tracker, 0), false, 'no press yet');
    pointerPressed(tracker, input(true), 2);
    assert.equal(isTapEcho(tracker, 2 + TAP_ECHO / 2), true);
    assert.equal(isTapEcho(tracker, 2 + TAP_ECHO + 0.01), false);
  });

  it('reset treats a pointer that is already down as used', () => {
    const tracker = createPress();
    pointerPressed(tracker, input(true), 3);
    resetPress(tracker, input(true));
    assert.equal(tracker.pointerAt, Number.NEGATIVE_INFINITY);
    assert.equal(pointerPressed(tracker, input(true), 4), false, 'the held press does not act');
  });
});

describe('wrap', () => {
  it('wraps both ways into 0 .. n - 1', () => {
    assert.equal(wrap(0, 9), 0);
    assert.equal(wrap(9, 9), 0);
    assert.equal(wrap(10, 9), 1);
    assert.equal(wrap(-1, 9), 8);
    assert.equal(wrap(-10, 9), 8);
  });
});
