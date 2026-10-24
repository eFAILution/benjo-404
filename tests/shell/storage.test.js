import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createStorage } from '../../src/shell/storage.js';
import { memoryBacking } from './fixtures/fake-host-env.js';

describe('createStorage', () => {
  it('namespaces keys to the game id', () => {
    const backing = memoryBacking();
    const storage = createStorage('runner', backing);
    assert.equal(storage.set('best', '12'), true);
    assert.equal(backing.data.get('benjo404:runner:best'), '12');
    assert.equal(storage.get('best'), '12');
    assert.equal(storage.get('missing'), null);
  });

  it('round-trips numbers', () => {
    const storage = createStorage('runner', memoryBacking());
    assert.equal(storage.setNumber('best', 420), true);
    assert.equal(storage.getNumber('best', 0), 420);
    assert.equal(storage.getNumber('other', 7), 7);
  });

  it('falls back to memory when setItem throws (quota)', () => {
    const backing = memoryBacking();
    backing.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const storage = createStorage('runner', backing);
    assert.equal(storage.set('best', '5'), false);
    assert.equal(storage.dead, true);
    assert.equal(storage.get('best'), '5');
    assert.equal(storage.setNumber('best', 9), false);
    assert.equal(storage.getNumber('best', 0), 9);
  });

  it('falls back to memory when getItem throws', () => {
    const backing = memoryBacking();
    backing.getItem = () => {
      throw new Error('SecurityError');
    };
    const storage = createStorage('runner', backing);
    assert.equal(storage.get('best'), null);
    assert.equal(storage.dead, true);
  });

  it('works with no storage at all', () => {
    const storage = createStorage('runner', null);
    assert.equal(storage.set('a', 'b'), false);
    assert.equal(storage.get('a'), 'b');
  });

  it('returns the fallback for bad numbers', () => {
    const backing = memoryBacking();
    const storage = createStorage('runner', backing);
    for (const bad of ['abc', '', '  ', '-1', '1e10', 'NaN', 'Infinity']) {
      backing.data.set('benjo404:runner:best', bad);
      assert.equal(storage.getNumber('best', 3), 3, `value ${JSON.stringify(bad)}`);
    }
    assert.equal(storage.setNumber('best', Number.NaN), false);
  });

  it('rejects values over 256 characters', () => {
    const storage = createStorage('runner', memoryBacking());
    assert.equal(storage.set('k', 'x'.repeat(257)), false);
    assert.equal(storage.get('k'), null);
    assert.equal(storage.set('k', 'x'.repeat(256)), true);
  });
});
