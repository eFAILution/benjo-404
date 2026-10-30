import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  avatarSize,
  createTrail,
  decodeGhost,
  encodePoint,
  ghostAt,
  loadGhost,
  MAX_SAMPLES,
  SAMPLE_TICKS,
  saveGhost,
} from '../../src/shell/ghost.js';
import { createHost } from '../../src/shell/host.js';
import { createStorage } from '../../src/shell/storage.js';
import { fakeGame, fakeHostOptions, memoryBacking } from './fixtures/fake-host-env.js';

const FRAME_MS = 1000 / 60;
const encode = (points) => points.map(([x, y]) => encodePoint(x, y)).join('');
const line = (n) => encode(Array.from({ length: n }, (_, i) => [i / (n - 1), 1 - i / (n - 1)]));

describe('ghost encoding', () => {
  it('round-trips points within one 6-bit step', () => {
    const points = [
      [0, 1],
      [0.5, 0.25],
      [0.123, 0.987],
      [1, 0],
      [0.3, 0.3],
      [0.7, 0.1],
      [0.9, 0.9],
      [0.01, 0.99],
    ];
    const decoded = decodeGhost(encode(points));
    assert.equal(decoded.length, points.length * 2);
    points.flat().forEach((value, i) => {
      assert.ok(Math.abs(decoded[i] - value) <= 0.5 / 63, `${value} -> ${decoded[i]}`);
    });
  });

  it('clamps off-canvas and non-finite points into the alphabet', () => {
    assert.equal(encodePoint(-3, 9), 'A_');
    assert.equal(encodePoint(Number.NaN, Number.POSITIVE_INFINITY), 'A_');
  });

  it('reads corrupt or wrong-sized text as no ghost', () => {
    for (const bad of [
      null,
      42,
      '',
      'A',
      `${line(8)}A`,
      'A!'.repeat(8),
      line(7),
      'A'.repeat(2050),
    ]) {
      assert.equal(decodeGhost(bad), null, String(bad).slice(0, 12));
    }
  });
});

describe('ghost storage', () => {
  const storage = () => createStorage('fake', memoryBacking());

  it('saves the longest ghost across 8 keys of 256 chars and loads it back', () => {
    const store = storage();
    const text = line(MAX_SAMPLES);
    assert.equal(saveGhost(store, text), true);
    for (let i = 0; i < 8; i++) assert.equal(store.get(`ghost${i}`).length, 256);
    assert.equal(store.get('ghostn'), '1024');
    assert.deepEqual(loadGhost(store), decodeGhost(text));
  });

  it('refuses a ghost that is too short or too long', () => {
    const store = storage();
    assert.equal(saveGhost(store, line(7)), false);
    assert.equal(saveGhost(store, line(MAX_SAMPLES + 1)), false);
    assert.equal(loadGhost(store), null);
  });

  it('a shorter ghost replaces a longer one', () => {
    const store = storage();
    saveGhost(store, line(500));
    saveGhost(store, line(10));
    assert.equal(loadGhost(store).length, 20);
  });

  it('loads corrupt storage as no ghost and never throws', () => {
    const cases = [
      { ghostn: 'nope' },
      { ghostn: '9999' },
      { ghostn: '3.5' },
      { ghostn: '20', ghost0: line(10) },
      { ghostn: '8', ghost0: '%%%%%%%%%%%%%%%%' },
      { ghostn: '200' },
    ];
    for (const values of cases) {
      const store = storage();
      for (const [key, value] of Object.entries(values)) store.set(key, value);
      assert.equal(loadGhost(store), null, JSON.stringify(values).slice(0, 40));
    }
  });
});

describe('ghostAt', () => {
  it('interpolates between samples and stops when the ghost runs out', () => {
    const points = [0, 0, 1, 0.5, 1, 1];
    assert.deepEqual(ghostAt(points, 0), [0, 0]);
    assert.deepEqual(ghostAt(points, 0.5), [0.5, 0.25]);
    assert.deepEqual(ghostAt(points, 1.5), [1, 0.75]);
    assert.equal(ghostAt(points, 2), null);
    assert.equal(ghostAt(points, -1), null);
  });
});

describe('avatarSize', () => {
  it('is 8% of the short side, clamped to 24-48 px', () => {
    assert.equal(avatarSize({ width: 400, height: 500 }), 32);
    assert.equal(avatarSize({ width: 100, height: 100 }), 24);
    assert.equal(avatarSize({ width: 2000, height: 1000 }), 48);
  });
});

describe('createTrail', () => {
  it('records one sample every 15 updates, normalized to the canvas', () => {
    const store = createStorage('fake', memoryBacking());
    const trail = createTrail(store, { width: 100, height: 200, dpr: 1 });
    for (let tick = 0; tick < SAMPLE_TICKS * 8; tick++) {
      trail.track(tick, 200);
      trail.step(tick);
    }
    assert.equal(trail.racing, false);
    assert.equal(trail.save(), true);
    const ghost = loadGhost(store);
    assert.equal(ghost.length, 16);
    assert.deepEqual(ghost.slice(0, 4), [0, 1, Math.round(0.15 * 63) / 63, 1]);
  });

  it('does not save fewer than 8 samples', () => {
    const store = createStorage('fake', memoryBacking());
    const trail = createTrail(store, { width: 100, height: 100, dpr: 1 });
    trail.track(1, 1);
    trail.step(0);
    assert.equal(trail.save(), false);
  });

  it('draws the twin 15 updates behind', () => {
    const store = createStorage('fake', memoryBacking());
    const trail = createTrail(store, { width: 100, height: 100, dpr: 1 });
    for (let tick = 0; tick < 40; tick++) {
      trail.track(tick, 5);
      trail.step(tick);
    }
    const drawn = [];
    trail.draw(40, true, (x, y, alpha) => drawn.push([x, y, alpha]));
    assert.deepEqual(drawn, [[24, 5, 0.45]]);
  });
});

describe('host ghost race', () => {
  function setup(behavior, overrides = {}) {
    const game = fakeGame(behavior);
    const events = [];
    const sprites = [];
    const env = fakeHostOptions(game, {
      onEvent: (event) => events.push(event),
      drawSprite: (_ctx, sprite, x, y, h, opts) => sprites.push({ sprite, x, y, h, ...opts }),
      ...overrides,
    });
    const host = createHost(env.options);
    let now = 0;
    const advance = (seconds) => {
      const stop = now + seconds * 1000 - 1e-6;
      while (now < stop) {
        now += FRAME_MS;
        env.options.frames.run(now);
      }
    };
    return { game, host, events, sprites, advance, ...env };
  }

  it('saves a best run as the ghost and races it next run at 0.25 alpha', () => {
    let x = 0;
    const { game, host, events, sprites, advance, options } = setup({
      update: () => {
        x += 1;
        game.host.track(x % 300, 75);
      },
    });
    host.play();
    advance(3);
    game.host.end({ score: 10 });
    assert.equal(events.at(-1).ghost, false);
    assert.ok(options.storage.getNumber('ghostn', 0) >= 8);

    host.play();
    sprites.length = 0;
    advance(1);
    const ghosts = sprites.filter((sprite) => sprite.alpha === 0.25);
    assert.ok(ghosts.length > 0);
    assert.equal(ghosts[0].sprite, options.theme.sprites.benjo);
    assert.equal(ghosts[0].h, 24);
    game.host.end({ score: 3 });
    assert.equal(events.at(-1).ghost, true);
  });

  it('keeps the old ghost when the run does not beat the best', () => {
    let at = 10;
    const { game, host, advance, options } = setup({
      update: () => game.host.track(at, 10),
    });
    host.play();
    advance(3);
    game.host.end({ score: 10 });
    const saved = options.storage.get('ghost0');
    at = 200;
    host.play();
    advance(3);
    game.host.end({ score: 5 });
    assert.equal(options.storage.get('ghost0'), saved);
  });

  it('stops drawing the ghost when it runs out', () => {
    const { game, host, sprites, advance } = setup({
      update: () => game.host.track(10, 10),
    });
    host.play();
    advance(2.1);
    game.host.end({ score: 10 });
    host.play();
    advance(3);
    sprites.length = 0;
    advance(1);
    assert.equal(sprites.length, 0);
  });
});
