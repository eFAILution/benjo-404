import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createHost } from '../../src/shell/host.js';
import { createPowers, POWERS, powerPool } from '../../src/shell/power.js';
import { fakeGame, fakeHostOptions, fakeHud } from './fixtures/fake-host-env.js';

const FRAME_MS = 1000 / 60;

function slot({ pool = ['cache', 'breakpoint'], random = () => 0 } = {}) {
  const events = [];
  const views = [];
  let cues = 0;
  const powers = createPowers({
    pool: () => pool,
    random,
    emit: (event) => events.push(event),
    show: (view) => views.push(view),
    cue: () => {
      cues += 1;
    },
  });
  return { powers, events, views, cues: () => cues };
}

/** A fake game whose instance also carries `extra` hooks (collect, snapshot, restore). */
function powerGame({ powers, extra = {}, behavior } = {}) {
  const game = fakeGame(behavior);
  const create = game.create;
  game.powers = powers;
  game.create = (host) => Object.assign(create(host), extra);
  return game;
}

function setup({ powers, extra, behavior, overrides } = {}) {
  const game = powerGame({ powers, extra, behavior });
  const hud = fakeHud();
  const views = [];
  hud.setPower = (view) => views.push(view);
  const events = [];
  const env = fakeHostOptions(game, {
    hud,
    powerRandom: () => 0,
    onEvent: (event) => events.push(event),
    ...overrides,
  });
  const host = createHost(env.options);
  let now = 0;
  /** Run whole 1/60 s frames for `seconds` of wall time. */
  const advance = (seconds) => {
    const stop = now + seconds * 1000 - 1e-6;
    while (now < stop) {
      now += FRAME_MS;
      env.options.frames.run(now);
    }
  };
  return { game, host, hud, views, events, advance, frames: env.options.frames, ...env };
}

/** Play, start the clock, run past the first drop, then score once so it lands. */
function withDrop(options) {
  const env = setup(options);
  env.host.play();
  env.frames.run(0);
  env.advance(10.1);
  env.game.host.setScore(1);
  return env;
}

describe('power table', () => {
  it('names every power with a 3-letter-or-less label and its seconds', () => {
    assert.deepEqual(Object.keys(POWERS).sort(), [
      'breakpoint',
      'cache',
      'gc',
      'magnet',
      'rollback',
      'twin',
    ]);
    for (const [label, name, seconds] of Object.values(POWERS)) {
      assert.ok(label.length <= 3 && name.length > 0 && seconds >= 0);
    }
    assert.equal(POWERS.cache[2], 10);
    assert.equal(POWERS.breakpoint[2], 5);
  });
});

describe('powerPool', () => {
  it('always has cache and breakpoint, and adds only listed powers the instance can carry', () => {
    const bare = {};
    assert.deepEqual(powerPool(undefined, bare), ['cache', 'breakpoint']);
    assert.deepEqual(powerPool(['twin', 'gc', 'rollback', 'magnet'], bare), [
      'cache',
      'breakpoint',
      'twin',
      'magnet',
    ]);
    const hooked = { collect: () => 0, snapshot: () => ({}), restore: () => {} };
    assert.deepEqual(powerPool(['gc', 'rollback', 'gc'], hooked), [
      'cache',
      'breakpoint',
      'gc',
      'rollback',
    ]);
    assert.deepEqual(powerPool(['rollback'], { snapshot: () => ({}) }), ['cache', 'breakpoint']);
  });
});

describe('createPowers slot', () => {
  it('drops nothing before 10 s, then on the next score, then waits 15-25 s', () => {
    const { powers, events, cues } = slot({ random: () => 0 });
    powers.tick(9.9);
    powers.scored();
    assert.deepEqual(events, []);
    powers.tick(0.2);
    powers.scored();
    assert.deepEqual(events, [{ type: 'drop', id: 'cache' }]);
    assert.equal(cues(), 1);
    powers.fire();
    powers.tick(10.1);
    powers.scored();
    assert.equal(events.length, 2, 'cache ran out but the next drop is not due yet');
    powers.tick(5);
    powers.scored();
    assert.deepEqual(events.at(-1), { type: 'drop', id: 'cache' });
  });

  it('holds one power at a time and drops nothing while full', () => {
    const { powers, events } = slot();
    powers.tick(60);
    powers.scored();
    powers.tick(60);
    powers.scored();
    assert.equal(events.filter((event) => event.type === 'drop').length, 1);
  });

  it('shows held, then active with left draining in steps, then empty', () => {
    const { powers, views } = slot({ pool: ['breakpoint'] });
    powers.tick(10);
    powers.scored();
    assert.deepEqual(views[0], {
      id: 'breakpoint',
      label: 'BRK',
      name: 'Breakpoint',
      state: 'held',
      left: 1,
    });
    powers.fire();
    assert.equal(views.at(-1).state, 'active');
    for (let i = 0; i < 605; i++) powers.tick(1 / 120);
    assert.equal(views.at(-1), null);
    const lefts = views.filter(Boolean).map((view) => view.left);
    assert.ok(lefts.length <= 52, `throttled to ${lefts.length} calls`);
    assert.ok(lefts.every((left, i) => i === 0 || left <= lefts[i - 1]));
    assert.equal(powers.isActive('breakpoint'), false);
  });

  it('lets twin absorb exactly one hit', () => {
    const { powers, events } = slot({ pool: ['twin'] });
    assert.equal(powers.absorb(), false);
    powers.tick(10);
    powers.scored();
    powers.fire();
    assert.equal(powers.absorb(), true);
    assert.equal(powers.absorb(), false);
    assert.deepEqual(events.at(-1), { type: 'absorb' });
  });

  it('ends twin after 12 s when nothing hits it', () => {
    const { powers } = slot({ pool: ['twin'] });
    powers.tick(10);
    powers.scored();
    powers.fire();
    powers.tick(11.9);
    assert.equal(powers.isActive('twin'), true);
    powers.tick(0.2);
    assert.equal(powers.absorb(), false);
  });

  it('will not fire rollback by hand, and take() uses it up', () => {
    const { powers, views } = slot({ pool: ['rollback'] });
    powers.tick(10);
    powers.scored();
    assert.equal(powers.fire(), null);
    assert.equal(powers.holds('rollback'), true);
    assert.equal(powers.take('rollback'), true);
    assert.equal(powers.holds('rollback'), false);
    assert.equal(views.at(-1), null);
  });

  it('clear always tells the HUD the slot is empty', () => {
    const { powers, views } = slot();
    powers.clear();
    assert.deepEqual(views, [null]);
  });
});

describe('host power-ups', () => {
  it('drops on a score after 10 s of play, plays the pickup cue, and shows it held', () => {
    const cues = [];
    const { events, views } = withDrop({ overrides: { audio: { play: (cue) => cues.push(cue) } } });
    assert.deepEqual(events.at(-1), { type: 'drop', id: 'cache' });
    assert.ok(cues.includes('pickup'));
    assert.equal(views.at(-1).state, 'held');
  });

  it('does not use the run random for drops', () => {
    let calls = 0;
    const env = withDrop({
      overrides: {
        random: () => {
          calls += 1;
          return 0.5;
        },
      },
    });
    assert.equal(env.events.at(-1).type, 'drop');
    assert.equal(calls, 0);
  });

  it('keeps power timers still while paused', () => {
    const { host, game, events, advance, frames } = setup();
    host.play();
    frames.run(0);
    advance(5);
    host.pause();
    host.resume();
    frames.run(1e6);
    game.host.setScore(1);
    assert.equal(events.filter((event) => event.type === 'drop').length, 0);
  });

  it('cache doubles the points scored while it runs, on the HUD and the final score', () => {
    const { host, game, hud, advance } = withDrop();
    host.firePower();
    game.host.setScore(5);
    advance(10.1);
    game.host.setScore(8);
    const scores = hud.events.filter(([name]) => name === 'score').map(([, value]) => value);
    assert.deepEqual(scores.slice(-3), [1, 9, 12]);
    game.host.end({ score: 8 });
    const over = hud.events.find(([name]) => name === 'over');
    assert.equal(over[1].score, 12);
  });

  it('breakpoint runs half the updates over the same wall time', () => {
    const { host, game, advance, events } = withDrop({ overrides: { powerRandom: () => 0.5 } });
    assert.deepEqual(events.at(-1), { type: 'drop', id: 'breakpoint' });
    host.firePower();
    assert.deepEqual(events.at(-1), { type: 'power', id: 'breakpoint' });
    game.log.length = 0;
    advance(4);
    const slow = game.log.filter((entry) => entry === 'update').length;
    advance(1.1);
    game.log.length = 0;
    advance(4);
    const fast = game.log.filter((entry) => entry === 'update').length;
    assert.ok(Math.abs(slow - 120) <= 2, `slow ${slow}`);
    assert.ok(Math.abs(fast - 240) <= 2, `fast ${fast}`);
  });

  it('magnet is active for its 10 s through the game port', () => {
    const { host, game, advance } = withDrop({
      powers: ['magnet'],
      overrides: { powerRandom: () => 0.99 },
    });
    assert.equal(game.host.power.active('magnet'), false);
    host.firePower();
    assert.equal(game.host.power.active('magnet'), true);
    advance(10.1);
    assert.equal(game.host.power.active('magnet'), false);
  });

  it('twin absorbs once through the game port', () => {
    const { host, game, events } = withDrop({
      powers: ['twin'],
      overrides: { powerRandom: () => 0.99 },
    });
    host.firePower();
    assert.equal(game.host.power.active('twin'), true);
    assert.equal(game.host.power.absorb(), true);
    assert.equal(game.host.power.absorb(), false);
    assert.equal(events.filter((event) => event.type === 'absorb').length, 1);
  });

  it('gc calls collect and reports the count', () => {
    let collected = 0;
    const { host, events } = withDrop({
      powers: ['gc'],
      extra: {
        collect: () => {
          collected += 1;
          return 3;
        },
      },
      overrides: { powerRandom: () => 0.99 },
    });
    host.firePower();
    assert.equal(collected, 1);
    assert.deepEqual(events.slice(-2), [
      { type: 'power', id: 'gc' },
      { type: 'collect', count: 3 },
    ]);
    assert.equal(host.state, 'playing');
  });

  it('firePower does nothing while paused', () => {
    const { host, events } = withDrop();
    host.pause();
    host.firePower();
    assert.equal(events.at(-1).type, 'drop');
  });

  it('quit empties the slot and ends the active power', () => {
    const { host, game, views } = withDrop();
    host.firePower();
    const port = game.host.power;
    host.quit();
    assert.equal(views.at(-1), null);
    assert.equal(port.active('cache'), false);
  });
});

describe('host rollback', () => {
  function rollbackGame(overrides = {}) {
    const restored = [];
    let tick = 0;
    const env = withDrop({
      powers: ['rollback'],
      behavior: {
        update: () => {
          tick += 1;
        },
      },
      extra: {
        snapshot: () => ({ tick }),
        restore: (snap) => {
          restored.push(snap);
          tick = snap.tick;
        },
        ...overrides,
      },
      overrides: { powerRandom: () => 0.99 },
    });
    return { ...env, restored };
  }

  it('restores a snapshot at least 3 s old instead of ending, and only once', () => {
    const { host, game, events, restored, hud } = rollbackGame();
    assert.deepEqual(events.at(-1), { type: 'drop', id: 'rollback' });
    host.firePower();
    assert.equal(events.at(-1).type, 'drop', 'rollback cannot be fired by hand');
    game.host.end({ score: 1 });
    assert.equal(host.state, 'playing');
    assert.equal(restored.length, 1);
    assert.ok(restored[0].tick <= 607 - 180, `rewound to ${restored[0].tick}`);
    assert.ok(restored[0].tick >= 607 - 240, `rewound to ${restored[0].tick}`);
    assert.deepEqual(events.at(-1), { type: 'rollback' });
    game.host.end({ score: 1 });
    assert.equal(host.state, 'over');
    assert.equal(hud.events.filter(([name]) => name === 'over').length, 1);
  });

  it('a throwing snapshot fails the run like any game error', () => {
    let explode = false;
    const { host, errors, advance } = rollbackGame({
      snapshot: () => {
        if (explode) throw new Error('snapshot');
        return {};
      },
    });
    assert.equal(host.state, 'playing');
    explode = true;
    advance(1);
    assert.equal(host.state, 'idle');
    assert.equal(errors.length, 1);
  });

  it('a throwing restore fails the run', () => {
    const { host, game, errors } = rollbackGame({
      restore: () => {
        throw new Error('restore');
      },
    });
    game.host.end({ score: 1 });
    assert.equal(host.state, 'idle');
    assert.equal(errors.length, 1);
  });
});
