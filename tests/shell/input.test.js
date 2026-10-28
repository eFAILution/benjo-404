import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyKey, createInputState, gameOwnsKey } from '../../src/shell/input.js';

// Plain objects stand in for elements: the decision only compares identities and ids.
const body = { id: '' };
const html = { id: '' };
const pauseButton = { id: '', tagName: 'BUTTON' };
const link = { id: 'm-cta', tagName: 'A' };
const resume = { id: '', tagName: 'BUTTON' };
const gameRoot = { id: 'game-root' };
const page = { body, html, pauseButton };

const GAME_KEYS = ['Space', 'Enter', 'ArrowUp', 'ArrowLeft', 'KeyX', 'Escape', 'KeyP'];
const ACTIVATION_KEYS = ['Enter', 'Space', 'Tab'];

describe('gameOwnsKey', () => {
  it('takes every game key when the body, the page, or nothing is focused', () => {
    for (const active of [body, html, null, gameRoot]) {
      for (const code of GAME_KEYS) {
        assert.equal(gameOwnsKey(code, { ...page, active }), true, `${code} on ${active?.id}`);
      }
    }
  });

  it('never takes Enter, Space, or Tab from a focused link or button', () => {
    for (const active of [link, resume, pauseButton]) {
      for (const code of ACTIVATION_KEYS) {
        assert.equal(gameOwnsKey(code, { ...page, active }), false, `${code} on ${active.tagName}`);
      }
    }
  });

  it('still steers the game with arrows and pause keys while the pause button is focused', () => {
    for (const code of ['ArrowUp', 'ArrowLeft', 'KeyX', 'Escape', 'KeyP']) {
      assert.equal(gameOwnsKey(code, { ...page, active: pauseButton }), true, code);
    }
  });

  it('leaves keys that are not game controls alone', () => {
    for (const code of ['Tab', 'KeyQ', 'F5', 'constructor']) {
      assert.equal(gameOwnsKey(code, { ...page, active: body }), false, code);
    }
  });
});

describe('applyKey', () => {
  const down = (code, repeat = false) => ({ type: 'keydown', code, repeat });
  const up = (code) => ({ type: 'keyup', code, repeat: false });

  /** Run one host tick and report whether primary was a fresh press on it. */
  function tick(input) {
    input.tick();
    const fresh = input.justPressed('primary');
    input.endTick();
    return fresh;
  }

  it('ignores the auto-repeat of a Space that was down before the run began', () => {
    const input = createInputState();
    applyKey(input, down('Space', true));
    assert.equal(tick(input), false);
    assert.equal(input.isDown('primary'), false);
  });

  it('never counts a repeat of a held key as a new press', () => {
    const input = createInputState();
    applyKey(input, down('Space'));
    assert.equal(tick(input), true);
    applyKey(input, down('Space', true));
    applyKey(input, down('Space', true));
    assert.equal(tick(input), false);
    assert.equal(input.isDown('primary'), true);
    applyKey(input, up('Space'));
    assert.equal(input.isDown('primary'), false);
    applyKey(input, down('Space'));
    assert.equal(tick(input), true);
  });

  it('asks to pause only on a fresh pause keydown', () => {
    const input = createInputState();
    assert.equal(applyKey(input, down('Escape')), true);
    assert.equal(applyKey(input, down('Escape', true)), false);
    assert.equal(applyKey(input, up('Escape')), false);
    assert.equal(applyKey(input, down('Space')), false);
  });
});
