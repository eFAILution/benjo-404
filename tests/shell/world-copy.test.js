import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { graceFaint } from '../../src/shell/blink.js';
import { freezeWorld, thawWorld } from '../../src/shell/world-copy.js';

describe('freezeWorld and thawWorld', () => {
  const random = () => 0.5;
  const world = () => ({ score: 3, list: [1, { x: 2 }], cells: new Uint8Array([1, 2]), random });

  it('freezes a copy without the random source that shares nothing with the world', () => {
    const live = world();
    const frozen = freezeWorld(live);
    assert.equal('random' in frozen, false);
    live.list[1].x = 9;
    live.cells[0] = 7;
    assert.deepEqual(frozen, { score: 3, list: [1, { x: 2 }], cells: new Uint8Array([1, 2]) });
  });

  it('thaws a live world with the given random, and leaves the frozen copy as it was', () => {
    const frozen = freezeWorld(world());
    const other = () => 0.25;
    const live = thawWorld(frozen, other);
    assert.equal(live.random, other);
    live.list[1].x = 9;
    assert.equal(frozen.list[1].x, 2, 'the same copy can be thawed again');
    assert.equal(thawWorld(frozen, other).list[1].x, 2);
  });
});

describe('graceFaint', () => {
  it('is off without grace', () => {
    assert.equal(graceFaint(0, 0.1, false), false);
    assert.equal(graceFaint(0, 0.1, true), false);
  });

  it('blinks every `every` seconds, and holds faint under reduced motion', () => {
    assert.deepEqual(
      [0.05, 0.15, 0.25, 0.35].map((t) => graceFaint(t, 0.1, false)),
      [true, false, true, false],
    );
    assert.equal(graceFaint(0.15, 0.1, true), true);
  });
});
