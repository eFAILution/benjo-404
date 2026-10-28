import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { CUES, createAudio } from '../../src/shell/audio.js';
import { createStorage } from '../../src/shell/storage.js';

/** A stand-in AudioContext that records every tone it is asked to play. */
function fakeContext(played, state = 'running') {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  return class {
    state = state;
    currentTime = 0;
    destination = {};
    createGain() {
      return { gain: param(), connect: (next) => next };
    }
    createOscillator() {
      const osc = { type: '', frequency: param(), connect: (next) => next, stop() {} };
      osc.start = () => played.push(osc.type);
      return osc;
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
  };
}

const memory = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};
const original = globalThis.AudioContext;

afterEach(() => {
  globalThis.AudioContext = original;
});

describe('createAudio', () => {
  it('stays silent until the first input unlocks it', () => {
    const played = [];
    globalThis.AudioContext = fakeContext(played);
    const audio = createAudio({ storage: createStorage('audio', memory()) });
    audio.play('jump');
    assert.equal(played.length, 0);
    audio.unlock();
    audio.play('jump');
    assert.equal(played.length, CUES.jump.length);
  });

  it('plays nothing while muted and remembers the choice', () => {
    const played = [];
    globalThis.AudioContext = fakeContext(played);
    const backing = memory();
    const audio = createAudio({ storage: createStorage('audio', backing) });
    audio.unlock();
    audio.setMuted(true);
    audio.play('hit');
    assert.equal(played.length, 0);
    assert.equal(createAudio({ storage: createStorage('audio', backing) }).muted, true);
  });

  it('lets a theme replace one cue and keeps the rest', () => {
    const played = [];
    globalThis.AudioContext = fakeContext(played);
    const cues = { pickup: [{ type: 'sine', f: 1568, d: 0.3 }] };
    const audio = createAudio({ storage: createStorage('audio', memory()), cues });
    audio.unlock();
    audio.play('pickup');
    audio.play('hit');
    assert.deepEqual(played, ['sine', ...CUES.hit.map((tone) => tone.type)]);
  });

  it('does nothing in a browser without Web Audio', () => {
    globalThis.AudioContext = undefined;
    const audio = createAudio({ storage: createStorage('audio', memory()) });
    audio.unlock();
    assert.doesNotThrow(() => audio.play('jump'));
  });
});
