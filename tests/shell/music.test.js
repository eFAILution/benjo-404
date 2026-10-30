import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { createAudio } from '../../src/shell/audio.js';
import { createMusic, midiOf } from '../../src/shell/music.js';
import { createStorage } from '../../src/shell/storage.js';
import { fakeAudio } from './fixtures/fake-audio.js';
import { memoryBacking } from './fixtures/fake-host-env.js';

const original = globalThis.AudioContext;

afterEach(() => {
  globalThis.AudioContext = original;
});

/** 150 bpm makes one step a tenth of a second, so 0.2 s of lookahead holds two steps. */
const BPM = 150;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual}`);

/** Music on an unlocked engine. `at(t)` moves the clock; `notes()` lists started sources. */
function setup({ unlock = true } = {}) {
  const fake = fakeAudio();
  globalThis.AudioContext = fake.Context;
  const audio = createAudio({ storage: createStorage('audio', memoryBacking()) });
  if (unlock) audio.unlock();
  const music = createMusic(audio);
  const at = (t) => {
    fake.contexts[0].currentTime = t;
  };
  const notes = () => fake.sources;
  /** The gain every note of the current stretch feeds: the source's gain node's output. */
  const busOf = (source) => source.connected.at(-1).connected[0];
  return { audio, music, fake, at, notes, busOf };
}

const tune = (notes, type = 'square') => ({ bpm: BPM, channels: [{ type, g: 0.5, notes }] });

describe('midiOf', () => {
  it("reads 'A'..'Z' as MIDI 36..61 and 'a'..'z' as 62..87", () => {
    assert.deepEqual(['A', 'Z', 'a', 'z'].map(midiOf), [36, 61, 62, 87]);
    assert.deepEqual(['.', '-', ' ', '0'].map(midiOf), [-1, -1, -1, -1]);
  });
});

describe('createMusic', () => {
  it('stays silent before the first input makes the audio context', () => {
    const { music, fake } = setup({ unlock: false });
    music.play(tune('ABCD'));
    music.tick();
    assert.equal(fake.contexts.length, 0);
  });

  it('schedules the notes within the lookahead on each tick, and loops', () => {
    const { music, at, notes } = setup();
    music.play(tune('AC.'));
    music.tick();
    assert.deepEqual(
      notes().map((note) => note.frequency.value),
      [hz(36), hz(38)],
    );
    close(notes()[0].at, 0.005);
    close(notes()[1].at, 0.105);
    at(0.15);
    music.tick();
    assert.equal(notes().length, 3, 'the rest plays nothing, then the loop starts again');
    assert.equal(notes()[2].frequency.value, hz(36));
    close(notes()[2].at, 0.305);
  });

  it("holds a note through each '-' after it", () => {
    const { music, notes } = setup();
    music.play(tune('A-.'));
    music.tick();
    assert.equal(notes().length, 1);
    close(notes()[0].end - notes()[0].at, 0.2);
  });

  it('plays a noise channel as a short high-passed hit', () => {
    const { music, notes } = setup();
    music.play(tune('a---', 'noise'));
    music.tick();
    const [hit] = notes();
    assert.equal(hit.type, 'noise');
    assert.ok(hit.buffer, 'shares a noise buffer');
    const filter = hit.connected[0];
    assert.equal(filter.type, 'highpass');
    assert.equal(filter.frequency.value, hz(62));
    assert.ok(hit.end - hit.at <= 0.12, 'a drum hit stays short');
  });

  it('carries on when the same track is played again', () => {
    const { music, at, notes, busOf } = setup();
    const track = tune('ABCD');
    music.play(track);
    music.tick();
    const bus = busOf(notes()[0]);
    at(0.1);
    music.play(track);
    music.tick();
    assert.deepEqual(
      notes().map((note) => note.frequency.value),
      [hz(36), hz(37), hz(38)],
    );
    assert.equal(bus.gain.events.length, 0, 'no fade, no restart');
  });

  it('switches to another track at once, fading what the old one scheduled', () => {
    const { music, at, notes, busOf } = setup();
    music.play(tune('ABCD'));
    music.tick();
    const old = busOf(notes()[0]);
    at(0.05);
    music.play(tune('zz'));
    assert.equal(old.gain.value, 0);
    music.tick();
    assert.equal(notes().at(-1).frequency.value, hz(87));
    assert.notEqual(busOf(notes().at(-1)), old);
  });

  it('schedules nothing after stop, and fades what was scheduled', () => {
    const { music, at, notes, busOf } = setup();
    music.play(tune('ABCD'));
    music.tick();
    music.stop();
    assert.equal(busOf(notes()[0]).gain.value, 0);
    at(1);
    music.tick();
    assert.equal(notes().length, 2);
  });

  it('holds its place while held and picks up from there', () => {
    const { music, at, notes } = setup();
    music.play(tune('ABCDEFGH'));
    music.tick();
    music.hold(true);
    at(1);
    music.tick();
    assert.equal(notes().length, 2);
    music.hold(false);
    music.tick();
    assert.equal(notes()[2].frequency.value, hz(38), 'the third step, not the first again');
    close(notes()[2].at, 1.005);
  });

  it('goes quiet at once on mute and carries on after unmute', () => {
    const { audio, music, at, notes, busOf } = setup();
    music.play(tune('ABCD'));
    music.tick();
    const master = audio.output().master;
    audio.setMuted(true);
    assert.equal(master.gain.value, 0, 'the master fades at once');
    music.tick();
    assert.equal(busOf(notes()[0]).gain.value, 0);
    at(0.5);
    music.tick();
    assert.equal(notes().length, 2);
    audio.setMuted(false);
    music.tick();
    assert.equal(notes().length, 4);
  });

  it('plays nothing for a tempo that would never move the clock on or would flood it', () => {
    const { music, notes } = setup();
    for (const bpm of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1e9]) {
      music.play({ bpm, channels: [{ type: 'square', g: 0.5, notes: 'A' }] });
      music.tick();
    }
    assert.equal(notes().length, 0);
  });
});
