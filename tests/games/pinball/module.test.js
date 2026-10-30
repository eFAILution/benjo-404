import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import pinball from '../../../src/games/pinball/index.js';
import { BRIDGE_TRACK, CUES, HULL_TRACK, TWIN_TRACK } from '../../../src/games/pinball/sounds.js';
import { DT, fakeHost } from '../runner/fake-host.js';

/** A host that logs cues, music, and absorbs. */
function loggingHost({ twins = 0 } = {}) {
  const host = fakeHost();
  const log = { cues: [], tracks: [], stops: 0, absorbs: 0 };
  let left = twins;
  host.audio = { play: (cue) => log.cues.push(cue) };
  host.music = { play: (track) => log.tracks.push(track), stop: () => (log.stops += 1) };
  host.power = {
    active: () => false,
    absorb() {
      log.absorbs += 1;
      if (left <= 0) return false;
      left -= 1;
      return true;
    },
  };
  return { host, log };
}

/** Run the instance like the host loop. */
function play(host, game, seconds, beforeTick = () => {}) {
  for (let i = 0; i < seconds / DT && host.log.ends.length === 0; i++) {
    beforeTick(i * DT, host.input);
    game.update(DT);
    game.render(0.5);
    host.input.tick();
  }
}

describe('pinball module', () => {
  test('is a full GameModule with its own cues and the power-ups it supports', () => {
    assert.equal(pinball.id, 'pinball');
    assert.ok(pinball.howTo);
    assert.deepEqual(pinball.powers, ['twin', 'rollback', 'gc']);
    for (const tones of Object.values(pinball.cues)) assert.ok(tones.length > 0);
  });

  test('every cue the game plays is one it brings or a shared one', () => {
    const { host, log } = loggingHost();
    const game = pinball.create(host);
    game.start();
    play(host, game, 30, (t, input) => {
      if (t > 0.2 && t < 1) input.held.add('primary');
      else input.held.delete('primary');
      if (Math.floor(t * 3) % 2) input.held.add('left');
      else input.held.delete('left');
    });
    assert.ok(log.cues.includes('launch'));
    assert.ok(log.cues.includes('flip'));
    for (const cue of log.cues) assert.ok(cue in CUES, cue);
  });

  test('plays the hull track during play and only known tracks', () => {
    const { host, log } = loggingHost();
    const game = pinball.create(host);
    game.start();
    play(host, game, 1);
    assert.equal(log.tracks[0], HULL_TRACK);
    for (const track of log.tracks)
      assert.ok([HULL_TRACK, BRIDGE_TRACK, TWIN_TRACK].includes(track));
  });

  test('a game with no flipping ends, reports its score, and stops the music', () => {
    const { host, log } = loggingHost();
    const game = pinball.create(host);
    game.start();
    play(host, game, 400, (t, input) => {
      if (Math.floor(t * 2) % 4 === 0) input.held.add('primary');
      else input.held.delete('primary');
    });
    assert.equal(host.log.ends.length, 1);
    const [end] = host.log.ends;
    assert.equal(end.scoreLabel, 'SCORE');
    assert.ok(end.reason.length <= 48);
    assert.ok(log.stops > 0);
    assert.ok(log.absorbs >= 3, 'asked the Digital Twin at every lost ball');
  });

  test('a Digital Twin saves the last ball', () => {
    const plain = loggingHost();
    const twin = loggingHost({ twins: 5 });
    for (const { host } of [plain, twin]) {
      const game = pinball.create(host);
      game.start();
      play(host, game, 120, (t, input) => {
        if (Math.floor(t * 2) % 4 === 0) input.held.add('primary');
        else input.held.delete('primary');
      });
    }
    assert.ok(twin.host.log.statuses.includes('DIGITAL TWIN'));
    assert.ok(plain.host.log.ends.length >= twin.host.log.ends.length);
  });

  test('Rollback restores the table, score included', () => {
    const { host } = loggingHost();
    const game = pinball.create(host);
    game.start();
    play(host, game, 3, (t, input) =>
      t < 1 ? input.held.add('primary') : input.held.delete('primary'),
    );
    const snap = game.snapshot();
    const scoreAt = host.log.scores.at(-1);
    play(host, game, 5);
    game.restore(snap);
    assert.equal(host.log.scores.at(-1), scoreAt);
    assert.doesNotThrow(() => game.restore(snap));
  });

  test('Garbage Collector squashes the bugs and counts them', () => {
    const { host } = loggingHost();
    const game = pinball.create(host);
    game.start();
    assert.equal(game.collect(), 0);
    const snap = game.snapshot();
    snap.world.bugs = [
      { x: 100, y: 200, a: 0, t: 0 },
      { x: 120, y: 220, a: 0, t: 0 },
    ];
    game.restore(snap);
    assert.equal(game.collect(), 2);
  });

  test('pause holds the table still', () => {
    const { host } = loggingHost();
    const game = pinball.create(host);
    game.start();
    game.pause();
    const before = JSON.stringify(game.snapshot());
    play(host, game, 1);
    assert.equal(JSON.stringify(game.snapshot()), before);
    game.resume();
    game.destroy();
    assert.doesNotThrow(() => game.render(0));
  });
});
