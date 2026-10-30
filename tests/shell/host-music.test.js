import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createHost } from '../../src/shell/host.js';
import { fakeGame, fakeHostOptions } from './fixtures/fake-host-env.js';

/** A music player that records every call the host makes. */
function fakeMusic() {
  const calls = [];
  return {
    calls,
    play: (track) => calls.push(['play', track]),
    stop: () => calls.push(['stop']),
    hold: (on) => calls.push(['hold', on]),
    tick: () => calls.push(['tick']),
  };
}

function setup(gameFields = {}, behavior = {}) {
  const game = Object.assign(fakeGame(behavior), gameFields);
  const music = fakeMusic();
  const cues = [];
  const audio = { play: (cue, gameCues) => cues.push([cue, gameCues]) };
  const env = fakeHostOptions(game, { music, audio });
  const host = createHost(env.options);
  /** The calls since the last look, so each step checks only its own. */
  const since = () => music.calls.splice(0);
  return { game, host, music, cues, since, frames: env.options.frames };
}

describe('createHost music', () => {
  it('ticks the music once per frame while a run plays', () => {
    const { host, frames, since } = setup();
    host.play();
    frames.run(0);
    frames.run(16);
    assert.deepEqual(since(), [['tick'], ['tick']]);
  });

  it('holds the music on pause and lets it go on resume', () => {
    const { host, frames, since } = setup();
    host.play();
    host.pause();
    frames.run(0);
    assert.deepEqual(since(), [['hold', true]], 'no tick while paused');
    host.resume();
    frames.run(16);
    assert.deepEqual(since(), [['hold', false], ['tick']]);
  });

  it('stops the music when the run ends, quits, or restarts', () => {
    const { game, host, since } = setup();
    host.play();
    game.host.end({ score: 1 });
    assert.deepEqual(since(), [['stop']]);
    host.play();
    host.quit();
    assert.deepEqual(since(), [['stop']]);
    host.play();
    host.pause();
    host.restart();
    assert.deepEqual(since(), [['hold', true], ['stop']]);
  });

  it('stops the music when the game throws', () => {
    const { host, frames, since } = setup(
      {},
      {
        update: () => {
          throw new Error('boom');
        },
      },
    );
    host.play();
    frames.run(0);
    assert.deepEqual(since(), [['tick'], ['stop']]);
    assert.equal(host.state, 'idle');
  });

  it("passes the game's music calls through until the run ends", () => {
    const { game, host, since } = setup();
    const track = { bpm: 120, channels: [] };
    host.play();
    const stale = game.host;
    stale.music.play(track);
    stale.music.stop();
    assert.deepEqual(since(), [['play', track], ['stop']]);
    host.quit();
    since();
    stale.music.play(track);
    stale.music.stop();
    assert.deepEqual(since(), []);
  });

  it("plays the game's cues with the game's own cue table", () => {
    const table = { flipper: [{ f: 440, d: 0.05 }] };
    const { game, host, cues } = setup({ cues: table });
    host.play();
    game.host.audio.play('flipper');
    game.host.end({ score: 0 });
    assert.deepEqual(cues, [
      ['flipper', table],
      ['over', table],
    ]);
  });
});
