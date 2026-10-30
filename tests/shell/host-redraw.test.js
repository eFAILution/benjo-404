import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createHost } from '../../src/shell/host.js';
import { fakeGame, fakeHostOptions } from './fixtures/fake-host-env.js';

function setup(behavior) {
  const game = fakeGame(behavior);
  const env = fakeHostOptions(game);
  const host = createHost(env.options);
  return { game, host, ...env, frames: env.options.frames };
}

describe('createHost redraw after a resize', () => {
  it('renders one frame of the paused game', () => {
    const { game, host, frames } = setup();
    host.play();
    frames.run(0);
    host.pause();
    game.log.length = 0;
    assert.equal(host.redraw(), true);
    assert.deepEqual(game.log, ['render']);
    assert.equal(frames.pending, 0, 'the loop stays stopped');
    assert.equal(host.state, 'paused');
  });

  it('leaves a playing game to its own loop', () => {
    const { game, host, frames } = setup();
    host.play();
    frames.run(0);
    game.log.length = 0;
    assert.equal(host.redraw(), true);
    assert.deepEqual(game.log, []);
  });

  it('asks for the attract backdrop when no instance is alive', () => {
    const { game, host } = setup();
    assert.equal(host.redraw(), false, 'idle');
    host.play();
    game.host.end({ score: 3 });
    game.log.length = 0;
    assert.equal(host.redraw(), false, 'over');
    assert.deepEqual(game.log, [], 'never renders a destroyed instance');
  });

  it('isolates a render that throws while paused', () => {
    let explode = false;
    const { host, frames, errors } = setup({
      render: () => {
        if (explode) throw new Error('render');
      },
    });
    host.play();
    frames.run(0);
    host.pause();
    explode = true;
    assert.equal(host.redraw(), false);
    assert.equal(host.state, 'idle');
    assert.equal(errors.length, 1);
  });

  it('paints the Digital Twin over the paused game', () => {
    const sprites = [];
    const game = fakeGame({ update: () => game.host.track(40, 60) });
    game.powers = ['twin'];
    const env = fakeHostOptions(game, {
      powerRandom: () => 0.99,
      drawSprite: (_ctx, _sprite, x, y, _h, opts) => sprites.push([x, y, opts.alpha]),
    });
    const host = createHost(env.options);
    host.play();
    for (let t = 0; t <= 10.2 * 1000; t += 1000 / 60) env.options.frames.run(t);
    game.host.setScore(1);
    host.pause();
    sprites.length = 0;
    assert.equal(host.redraw(), true);
    assert.deepEqual(sprites, [[40, 60, 0.45]]);
  });
});
