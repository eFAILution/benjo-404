import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { CUES, createAudio } from '../../src/shell/audio.js';
import { createStorage } from '../../src/shell/storage.js';
import { fakeAudio } from './fixtures/fake-audio.js';
import { memoryBacking } from './fixtures/fake-host-env.js';

const original = globalThis.AudioContext;

afterEach(() => {
  globalThis.AudioContext = original;
});

/** An unlocked engine on a fake context. `played` lists the wave of every tone started. */
function unlocked(options = {}, state = 'running') {
  const fake = fakeAudio(state);
  globalThis.AudioContext = fake.Context;
  const audio = createAudio({ storage: createStorage('audio', memoryBacking()), ...options });
  audio.unlock();
  return { audio, fake, played: () => fake.sources.map((source) => source.type) };
}

/** One tone a second long, so it is still sounding when the next cue plays. */
const long = (type = 'square') => [{ type, f: 440, d: 1 }];

describe('createAudio', () => {
  it('stays silent until the first input unlocks it', () => {
    const fake = fakeAudio();
    globalThis.AudioContext = fake.Context;
    const audio = createAudio({ storage: createStorage('audio', memoryBacking()) });
    audio.play('jump');
    assert.equal(fake.sources.length, 0);
    audio.unlock();
    audio.play('jump');
    assert.equal(fake.sources.length, CUES.jump.length);
  });

  it('wakes an engine that iOS Safari left interrupted', async () => {
    const { audio, played } = unlocked({}, 'interrupted');
    audio.unlock();
    await Promise.resolve();
    audio.play('jump');
    assert.equal(played().length, CUES.jump.length);
  });

  it('plays nothing while muted and remembers the choice', () => {
    const fake = fakeAudio();
    globalThis.AudioContext = fake.Context;
    const backing = memoryBacking();
    const audio = createAudio({ storage: createStorage('audio', backing) });
    audio.unlock();
    audio.setMuted(true);
    audio.play('hit');
    assert.equal(fake.sources.length, 0);
    assert.equal(createAudio({ storage: createStorage('audio', backing) }).muted, true);
  });

  it('fades the master out on mute and back in on unmute, so nothing keeps sounding', () => {
    const { audio } = unlocked();
    const { master } = audio.output();
    audio.setMuted(true);
    assert.equal(audio.output(), null, 'no output while muted');
    audio.setMuted(false);
    assert.equal(audio.output()?.master, master);
    assert.deepEqual(
      master.gain.events.map(([kind, value]) => [kind, value]),
      [
        ['target', 0],
        ['target', 0.18],
      ],
    );
  });

  it('lets a theme replace one cue and keeps the rest', () => {
    const cues = { pickup: [{ type: 'sine', f: 1568, d: 0.3 }] };
    const { audio, played } = unlocked({ cues });
    audio.play('pickup');
    audio.play('hit');
    assert.deepEqual(played(), ['sine', ...CUES.hit.map((tone) => tone.type)]);
  });

  it('does nothing in a browser without Web Audio', () => {
    globalThis.AudioContext = undefined;
    const audio = createAudio({ storage: createStorage('audio', memoryBacking()) });
    audio.unlock();
    assert.doesNotThrow(() => audio.play('jump'));
    assert.equal(audio.output(), null);
  });
});

describe('createAudio game cues', () => {
  it("plays a game's own cue by name", () => {
    const { audio, played } = unlocked();
    audio.play('flipper', { flipper: long('triangle') });
    assert.deepEqual(played(), ['triangle']);
  });

  it("lets a theme restyle a game's cue by the same name", () => {
    const { audio, played } = unlocked({ cues: { bumper: long('sine') } });
    audio.play('bumper', { bumper: long('sawtooth') });
    assert.deepEqual(played(), ['sine']);
  });

  it('prefers a game cue over the shared one of the same name', () => {
    const { audio, played } = unlocked();
    audio.play('jump', { jump: long('sine') });
    assert.deepEqual(played(), ['sine']);
  });

  it('plays nothing for an unknown name, even one every object has', () => {
    const { audio, played } = unlocked();
    for (const name of ['nope', 'constructor', 'toString', '__proto__']) {
      assert.doesNotThrow(() => audio.play(name, { flipper: long() }));
    }
    assert.deepEqual(played(), []);
  });
});

describe('createAudio voice limit', () => {
  const sixCues = Object.fromEntries('abcdefg'.split('').map((name) => [name, long()]));

  it('skips a cue that would make a seventh tone sound at once', () => {
    const { audio, fake } = unlocked();
    for (const name of 'abcdefg') audio.play(name, sixCues);
    assert.equal(fake.sources.length, 6);
    fake.contexts[0].currentTime = 1.5;
    audio.play('g', sixCues);
    assert.equal(fake.sources.length, 7, 'plays again once the others stop');
  });

  it('skips a cue whose tones would go over the limit together', () => {
    const { audio, fake } = unlocked();
    for (const name of 'abcde') audio.play(name, sixCues);
    audio.play('pair', { pair: [...long(), ...long()] });
    assert.equal(fake.sources.length, 5);
  });

  it('skips the same cue replayed within 40 ms', () => {
    const { audio, fake } = unlocked();
    const context = fake.contexts[0];
    audio.play('turn');
    context.currentTime = 0.03;
    audio.play('turn');
    assert.equal(fake.sources.length, 1);
    context.currentTime = 0.05;
    audio.play('turn');
    audio.play('land');
    assert.equal(fake.sources.length, 3, 'a different cue is not held back');
  });
});
