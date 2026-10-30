import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { encodePoint, SAMPLE_TICKS, saveGhost } from '../../src/shell/ghost.js';
import { createHost } from '../../src/shell/host.js';
import { createStorage } from '../../src/shell/storage.js';
import { fakeHostOptions, memoryBacking } from './fixtures/fake-host-env.js';

const FRAME_MS = 1000 / 60;

/**
 * A game that scores one point every update and moves Benjo one px right, with Rollback hooks.
 * Its snapshot notes what the HUD showed then, and `restored` keeps the snapshot it went back to.
 */
function rollbackGame(hud) {
  const shown = () => hud.events.filter(([name]) => name === 'score').at(-1)?.[1] ?? 0;
  const game = {
    id: 'fake',
    name: 'Fake',
    controls: { keyboard: 'SPACE', touch: 'TAP' },
    bestKey: 'best',
    powers: ['rollback'],
    host: null,
    score: 0,
    restored: null,
    create(host) {
      game.host = host;
      game.score = 0;
      return {
        start() {},
        update() {
          game.score += 1;
          host.setScore(game.score);
          host.track(game.score, 10);
        },
        render() {},
        pause() {},
        resume() {},
        destroy() {},
        snapshot: () => ({ score: game.score, shown: shown() }),
        restore(snap) {
          game.restored = snap;
          game.score = snap.score;
          host.setScore(game.score);
        },
      };
    },
  };
  return game;
}

/**
 * A host whose power drops go: Cache Hit, then (15 s later) Rollback.
 * @param {object} [overrides]
 */
function setup(overrides = {}) {
  const picks = [0, 0, 0.9, 0];
  const events = [];
  const env = fakeHostOptions(null, {
    powerRandom: () => picks.shift() ?? 0,
    onEvent: (event) => events.push(event),
    ...overrides,
  });
  const game = rollbackGame(env.options.hud);
  env.options.game = game;
  const host = createHost(env.options);
  let now = 0;
  const advance = (seconds) => {
    const stop = now + seconds * 1000 - 1e-6;
    while (now < stop) {
      now += FRAME_MS;
      env.options.frames.run(now);
    }
  };
  return { ...env, game, host, events, advance, hud: env.options.hud };
}

describe('Rollback', () => {
  it('puts the score and the Cache Hit bonus back to the snapshot', () => {
    const { game, host, hud, events, advance, options } = setup();
    host.play();
    options.frames.run(0);
    advance(10.1);
    assert.equal(events.at(-1).id, 'cache', 'Cache Hit dropped');
    advance(5);
    host.firePower();
    // Cache Hit runs to about 25 s; Rollback drops on the first score after that.
    advance(10.5);
    assert.equal(events.at(-1).id, 'rollback', 'Rollback dropped');
    advance(1);
    const before = hud.events.length;
    game.host.end({ score: game.score });
    assert.ok(
      events.some((event) => event.type === 'rollback'),
      'the death was rewound',
    );
    const saved = hud.events
      .slice(before)
      .filter(([name]) => name === 'score')
      .at(-1)?.[1];
    assert.ok(game.restored, 'the game was restored');
    assert.equal(saved, game.restored.shown, 'the HUD shows what it showed at the snapshot');
    assert.equal(host.state, 'playing');
    game.host.end({ score: game.score });
    const end = events.at(-1);
    assert.equal(end.type, 'end');
    assert.equal(end.score, saved, 'no bonus kept from the rewound seconds');
  });

  it('rewinds the ghost with the run, so it stays in step', () => {
    const storage = createStorage('fake', memoryBacking());
    // A saved ghost that walks right one sample at a time: x tells how far into a run it is.
    const text = Array.from({ length: 200 }, (_, i) => encodePoint(i / 200, 0.5)).join('');
    assert.ok(saveGhost(storage, text));
    const drawn = [];
    const { game, host, advance, options } = setup({
      storage,
      drawSprite: (_ctx, _sprite, x, _y, _h, opts) => drawn.push([x, opts?.alpha]),
    });
    host.play();
    options.frames.run(0);
    advance(15.1);
    host.firePower();
    advance(11.5);
    const ghostX = () => drawn.filter(([, alpha]) => alpha === 0.25).at(-1)?.[0];
    const late = ghostX();
    game.host.end({ score: game.score });
    advance(FRAME_MS / 1000);
    const after = ghostX();
    assert.ok(after < late, 'the ghost went back with the run');
    // Back to within one sample of where it was at the snapshot, at least 3 s earlier.
    const perSample = options.size.width / 200;
    const back = ((late - after) / perSample) * SAMPLE_TICKS;
    assert.ok(back >= 180 - SAMPLE_TICKS && back <= 240 + SAMPLE_TICKS, `${back} ticks`);
  });
});
