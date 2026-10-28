import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { benjo } from '../../src/assets/benjo.js';
import { SKINS, skinFor } from '../../src/shell/skins.js';

describe('skins', () => {
  it('has four looks in the logo viewBox', () => {
    assert.deepEqual(
      SKINS.map((skin) => skin.name),
      ['Hard Hat', 'Dark Mode', 'Support', 'Root Access'],
    );
    for (const skin of SKINS) assert.deepEqual(skin.viewBox, benjo.viewBox);
  });

  it('dresses only the theme Benjo, and only with a look picked', () => {
    assert.equal(skinFor(benjo, benjo, 0), null);
    assert.equal(skinFor(benjo, benjo, 2), SKINS[1]);
    assert.equal(skinFor(benjo, benjo, 9), null);
    const hazard = { viewBox: [0, 0, 96, 96], paths: [] };
    assert.equal(skinFor(hazard, benjo, 1), null);
  });

  it('leaves a theme Benjo with its own drawing alone', () => {
    const custom = { viewBox: [0, 0, 100, 100], paths: [] };
    assert.equal(skinFor(custom, custom, 1), null);
  });
});
