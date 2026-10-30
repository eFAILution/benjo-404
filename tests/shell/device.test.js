import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { watchDevice } from '../../src/shell/device.js';

/** A window whose primary pointer is coarse or not, and whose listeners the test can fire. */
function fakeWindow(coarse) {
  const listeners = new Map();
  return {
    matchMedia: (query) => ({ matches: query === '(pointer: coarse)' && coarse }),
    addEventListener: (type, fn) => listeners.set(type, fn),
    fire: (type, event = {}) => listeners.get(type)?.(event),
  };
}

describe('watchDevice (#64)', () => {
  it('guesses from the primary pointer before any input', () => {
    const signal = new AbortController().signal;
    assert.equal(watchDevice(fakeWindow(true), signal).touch, true);
    assert.equal(watchDevice(fakeWindow(false), signal).touch, false);
  });

  it('then follows the last input', () => {
    const win = fakeWindow(false);
    const device = watchDevice(win, new AbortController().signal);
    win.fire('pointerdown', { pointerType: 'touch' });
    assert.equal(device.touch, true);
    win.fire('keydown');
    assert.equal(device.touch, false);
    win.fire('pointerdown', { pointerType: 'pen' });
    assert.equal(device.touch, true);
    win.fire('pointerdown', { pointerType: 'mouse' });
    assert.equal(device.touch, false);
  });
});
