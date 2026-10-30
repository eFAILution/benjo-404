import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dayNumber } from '../../src/shell/nightly.js';
import { createPipeline, xpNote } from '../../src/shell/pipeline.js';
import { levelCost } from '../../src/shell/progress.js';
import { decodeSave, encodeSave } from '../../src/shell/save-code.js';
import { createStorage } from '../../src/shell/storage.js';
import { hasTrophy } from '../../src/shell/trophies.js';
import { memoryBacking } from './fixtures/fake-host-env.js';

const GAMES = [
  { id: 'runner', name: 'Runner' },
  { id: 'flight', name: 'Flight' },
];
const DAY_MS = 86400000;
const START = Date.UTC(2026, 9, 28, 12);

/** A pipeline over fake storage and a clock the test moves by hand. */
function setup({ backing = memoryBacking(), bests = {}, clock = { now: START } } = {}) {
  const pipeline = createPipeline({
    storage: createStorage('meta', backing),
    games: GAMES,
    bestOf: (id) => bests[id] ?? 0,
    setBest: (id, value) => {
      bests[id] = value;
    },
    now: () => clock.now,
  });
  return { pipeline, backing, bests, clock };
}

const end = (fields = {}) => ({
  type: 'end',
  game: 'runner',
  score: 2,
  previous: 9,
  seconds: 8,
  nightly: false,
  ghost: false,
  ...fields,
});

describe('createPipeline', () => {
  it('deals three tickets numbered from BENJO-100', () => {
    const { pipeline } = setup();
    assert.deepEqual(
      pipeline.tickets.map((t) => t.seq),
      [0, 1, 2],
    );
    assert.equal(pipeline.state.seq, 3);
  });

  it('pays run XP plus the first-run trophy and reports the version change', () => {
    const { pipeline } = setup();
    const notices = pipeline.onEvent(end());
    assert.ok(notices.includes('Trophy: Hello, World'));
    assert.equal(pipeline.state.runs, 1);
    assert.ok(pipeline.state.xp >= 7 + 25);
    assert.equal(pipeline.lastRun?.from, 'v0.0.0');
    assert.equal(pipeline.lastRun?.gained, pipeline.state.xp);
  });

  it('never pays a trophy twice', () => {
    const { pipeline } = setup();
    pipeline.onEvent(end());
    const xp = pipeline.state.xp;
    const notices = pipeline.onEvent({ type: 'start', game: 'runner', nightly: false });
    assert.deepEqual(notices, []);
    assert.equal(pipeline.state.xp, xp);
  });

  it('closes a ticket, pays it, and deals the next number', () => {
    const { pipeline } = setup();
    const before = pipeline.tickets.map((t) => t.seq);
    let closed = [];
    for (let i = 0; i < 6 && closed.length === 0; i += 1) {
      for (const game of ['runner', 'flight']) {
        closed = [...closed, ...pipeline.onEvent(end({ game, seconds: 50 }))];
        closed = [...closed, ...pipeline.onEvent({ type: 'power', id: 'cache' })];
      }
      closed = closed.filter((notice) => notice.startsWith('BENJO-'));
    }
    assert.ok(closed.length > 0);
    assert.match(closed[0], /^BENJO-10\d closed\. \+\d\d XP$/);
    assert.ok(pipeline.state.closed > 0);
    assert.equal(pipeline.tickets.length, 3);
    assert.ok(pipeline.tickets.some((t) => !before.includes(t.seq)));
  });

  it('gives Full Stack once every bundled game is played', () => {
    const { pipeline } = setup();
    pipeline.onEvent(end());
    assert.ok(pipeline.onEvent(end({ game: 'flight' })).includes('Trophy: Full Stack'));
  });

  it('gives Hotfix for a best right after a run that missed it', () => {
    const { pipeline } = setup();
    pipeline.onEvent(end({ score: 3, previous: 9 }));
    assert.ok(pipeline.onEvent(end({ score: 10, previous: 9 })).includes('Trophy: Hotfix'));
    const fresh = setup().pipeline;
    assert.ok(!fresh.onEvent(end({ score: 10, previous: 9 })).includes('Trophy: Hotfix'));
  });

  it('gives Kernel Panic for three run ends inside a minute', () => {
    const { pipeline, clock } = setup();
    pipeline.onEvent(end());
    clock.now += 70000;
    pipeline.onEvent(end());
    clock.now += 20000;
    assert.ok(!hasTrophy(pipeline.state.trophies, 'panic'));
    pipeline.onEvent(end());
    clock.now += 20000;
    assert.ok(pipeline.onEvent(end()).includes('Trophy: Kernel Panic'));
  });

  it('tracks power-ups used, rollback included, for Feature Complete', () => {
    const { pipeline } = setup();
    for (const id of ['twin', 'cache', 'gc', 'breakpoint', 'magnet']) {
      pipeline.onEvent({ type: 'power', id });
    }
    assert.ok(!hasTrophy(pipeline.state.trophies, 'feature'));
    const notices = pipeline.onEvent({ type: 'rollback' });
    assert.ok(notices.includes('Trophy: git revert'));
    assert.ok(notices.includes('Trophy: Feature Complete'));
  });

  it('pays the nightly bonus once a day and builds the streak', () => {
    const { pipeline, clock } = setup();
    assert.ok(pipeline.onEvent(end({ nightly: true })).includes('Nightly build shipped. +40 XP'));
    assert.ok(!pipeline.onEvent(end({ nightly: true })).some((n) => n.startsWith('Nightly')));
    clock.now += DAY_MS;
    pipeline.onEvent(end({ nightly: true }));
    clock.now += DAY_MS;
    const notices = pipeline.onEvent(end({ nightly: true }));
    assert.ok(notices.includes('Nightly build shipped. +60 XP'));
    assert.ok(notices.includes('Trophy: Three Nines'));
    assert.equal(pipeline.state.streak, 3);
  });

  it('gives Legacy Code on a visit on another day', () => {
    const backing = memoryBacking();
    const clock = { now: START };
    assert.deepEqual(setup({ backing, clock }).pipeline.visit(), []);
    assert.deepEqual(setup({ backing, clock }).pipeline.visit(), []);
    clock.now += DAY_MS;
    assert.ok(setup({ backing, clock }).pipeline.visit().includes('Trophy: Legacy Code'));
  });

  it('announces a version bump and a major release with its look', () => {
    const { pipeline } = setup();
    const bump = pipeline.onEvent(end({ seconds: 60 }));
    assert.ok(bump.some((n) => n.startsWith('Build bumped to v0.')));
    const toMajor = [0, 1, 2, 3, 4].reduce((sum, level) => sum + levelCost(level), 0);
    const code = encodeSave({ ...pipeline.state, xp: toMajor - 1, bests: [] });
    const notices = pipeline.restore(code) ?? [];
    assert.ok(notices.includes('v1.0.0 shipped. New look: Hard Hat'));
    assert.ok(notices.includes('Trophy: Ship It'));
  });

  it('unlocks the secret teapot once, outside any run', () => {
    const { pipeline } = setup();
    assert.deepEqual(pipeline.unlock('teapot'), ["Trophy: 418 I'm a Teapot"]);
    assert.equal(pipeline.state.xp, 25);
    assert.deepEqual(pipeline.unlock('teapot'), []);
    assert.equal(pipeline.state.xp, 25);
  });

  it('only lets the player wear an unlocked look', () => {
    const { pipeline } = setup();
    pipeline.setLook(3);
    assert.equal(pipeline.state.look, 0);
  });

  it('survives a reload with the same state and tickets', () => {
    const backing = memoryBacking();
    const first = setup({ backing }).pipeline;
    first.onEvent(end());
    first.onEvent({ type: 'power', id: 'gc' });
    const second = setup({ backing }).pipeline;
    assert.deepEqual(second.state, first.state);
    assert.deepEqual(second.tickets, first.tickets);
  });

  it('starts fresh over corrupt saved data', () => {
    const backing = memoryBacking();
    backing.data.set('benjo404:meta:p', '1,2,3,nope');
    backing.data.set('benjo404:meta:t', '}}}');
    const { pipeline } = setup({ backing });
    assert.equal(pipeline.state.xp, 0);
    assert.equal(pipeline.tickets.length, 3);
  });
});

describe('save code restore', () => {
  it('round-trips progress and bests into another browser', () => {
    const one = setup({ bests: { runner: 40, flight: 3 } }).pipeline;
    one.onEvent(end({ nightly: true }));
    const code = one.code();
    const two = setup({ bests: { runner: 12 } });
    const notices = two.pipeline.restore(code);
    assert.ok(notices?.includes('Trophy: Backup Restored'));
    assert.deepEqual(two.bests, { runner: 40, flight: 3 });
    assert.equal(two.pipeline.state.runs, 1);
    assert.equal(two.pipeline.state.nightlyDay, dayNumber(START));
    assert.ok(hasTrophy(two.pipeline.state.trophies, 'nightly'));
  });

  it('never lowers anything', () => {
    const rich = setup({ bests: { runner: 99 } });
    for (let i = 0; i < 5; i += 1) rich.pipeline.onEvent(end({ seconds: 60 }));
    const before = { ...rich.pipeline.state };
    rich.pipeline.restore(setup().pipeline.code());
    assert.ok(rich.pipeline.state.xp >= before.xp);
    assert.equal(rich.pipeline.state.runs, before.runs);
    assert.equal(rich.bests.runner, 99);
  });

  it('refuses a tampered code and changes nothing', () => {
    const { pipeline, backing } = setup();
    const code = setup().pipeline.code();
    const broken = code.replace(/[0-9a-z]$/, (char) => (char === 'z' ? 'y' : 'z'));
    const saved = new Map(backing.data);
    assert.equal(pipeline.restore(broken), null);
    assert.equal(pipeline.restore('not a code'), null);
    assert.deepEqual(backing.data, saved);
  });

  it('packs every bundled best into the code', () => {
    const { pipeline } = setup({ bests: { runner: 7, flight: 8 } });
    assert.deepEqual(decodeSave(pipeline.code())?.bests.slice(0, 2), [7, 8]);
  });
});

describe('xpNote', () => {
  it('shows the XP and the version change for the game over card', () => {
    assert.equal(
      xpNote({ gained: 23, from: 'v0.3.7', to: 'v0.3.9' }),
      '+23 XP \u00b7 v0.3.7 to v0.3.9',
    );
    assert.equal(xpNote({ gained: 2, from: 'v0.3.7', to: 'v0.3.7' }), '+2 XP \u00b7 v0.3.7');
    assert.equal(xpNote(null), '');
  });
});
