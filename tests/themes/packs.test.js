import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { gzipSync } from 'node:zlib';

import { benjo } from '../../src/assets/benjo.js';
import { HOLIDAYS } from '../../src/holidays/calendar.js';
import { resolveTheme } from '../../src/holidays/resolve.js';
import christmasPack from '../../src/themes/christmas/index.js';
import defaultPack from '../../src/themes/default/index.js';
import halloweenPack from '../../src/themes/halloween/index.js';

const THEMES_DIR = new URL('../../src/themes/', import.meta.url);
/** Every folder under src/themes/ is a pack, the same way the build finds them. */
const themes = Object.fromEntries(
  await Promise.all(
    readdirSync(THEMES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map(async ({ name }) => [
        name,
        (await import(new URL(`${name}/index.js`, THEMES_DIR).href)).default,
      ]),
  ),
);

const PALETTE_KEYS = ['bg', 'accent', 'accentSoft', 'glow', 'ink', 'muted', 'hazard', 'pickup'];
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const SAFE_ID = /^[a-z0-9-]{1,32}$/;
/** Path data only: commands, numbers, separators. No url(), no text. */
const PATH_DATA = /^M[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]*$/;
const MAX_D_LENGTH = 1200;
const MAX_PATHS = 6;
const MIN_VIEWBOX = 64;
const MAX_VIEWBOX = 128;
const MAX_ASPECT = 4 / 3;
const MAX_GZIP_BYTES = 4000;
const DRIFTS = ['none', 'up', 'down', 'left', 'right'];

const packEntries = Object.entries(themes);

/** Benjo's base paths come verbatim from the logo asset (A-8.2). */
const isBaseBenjoPath = (path) => benjo.paths.includes(path);

const allSprites = (pack) => [
  ['benjo', pack.sprites.benjo],
  ...pack.sprites.hazards.map((sprite, i) => [`hazards[${i}]`, sprite]),
  ...pack.sprites.pickups.map((sprite, i) => [`pickups[${i}]`, sprite]),
  ...(pack.sprites.props ?? []).map((sprite, i) => [`props[${i}]`, sprite]),
];

describe('theme folders', () => {
  test('ship default, halloween, and christmas', () => {
    assert.deepEqual(Object.keys(themes).sort(), ['christmas', 'default', 'halloween']);
  });

  test('folder names match pack ids', () => {
    assert.equal(themes.default, defaultPack);
    assert.equal(themes.halloween, halloweenPack);
    assert.equal(themes.christmas, christmasPack);
    for (const [key, pack] of packEntries) assert.equal(pack.id, key);
  });

});

for (const [key, pack] of packEntries) {
  describe(`theme pack ${key}`, () => {
    test('has a safe id, a name, and a known holiday', () => {
      assert.match(pack.id, SAFE_ID);
      assert.ok(pack.name.length > 0);
      const holidayIds = HOLIDAYS.map((holiday) => holiday.id);
      assert.ok(
        pack.holiday === 'default' || holidayIds.includes(pack.holiday),
        `unknown holiday ${pack.holiday}`,
      );
    });

    test('palette has every key as a valid hex color', () => {
      assert.deepEqual(Object.keys(pack.palette).sort(), [...PALETTE_KEYS].sort());
      for (const name of PALETTE_KEYS) {
        assert.match(pack.palette[name], HEX, `palette.${name}`);
      }
    });

    test('particle settings are in range', () => {
      const { count, color, size, speed, drift, twinkle } = pack.particles;
      assert.ok(Number.isInteger(count) && count > 0 && count <= 400);
      assert.match(color, HEX);
      for (const [min, max] of [size, speed]) {
        assert.ok(min > 0 && min <= max);
      }
      assert.ok(DRIFTS.includes(drift));
      assert.equal(typeof twinkle, 'boolean');
    });

    test('tagline is at most 32 characters', () => {
      if (pack.tagline !== undefined) assert.ok(pack.tagline.length <= 32);
    });

    test('has Benjo and at least one hazard and one pickup', () => {
      assert.ok(pack.sprites.benjo);
      assert.ok(pack.sprites.hazards.length >= 1);
      assert.ok(pack.sprites.pickups.length >= 1);
    });

    test('Benjo starts with the logo paths, in the logo viewBox', () => {
      const { benjo: packBenjo } = pack.sprites;
      assert.deepEqual(packBenjo.viewBox, benjo.viewBox);
      benjo.paths.forEach((path, i) => {
        assert.equal(packBenjo.paths[i], path);
      });
    });

    test('every sprite follows the sprite rules', () => {
      for (const [name, sprite] of allSprites(pack)) {
        const [, , width, height] = sprite.viewBox;
        assert.ok(sprite.paths.length >= 1, `${name} has no paths`);
        assert.ok(sprite.paths.length <= MAX_PATHS, `${name} paths`);
        if (name !== 'benjo') {
          assert.ok(width >= MIN_VIEWBOX && width <= MAX_VIEWBOX, `${name} w`);
          assert.ok(height >= MIN_VIEWBOX && height <= MAX_VIEWBOX, `${name} h`);
        }
        const aspect = Math.max(width / height, height / width);
        assert.ok(aspect <= MAX_ASPECT, `${name} is not near square`);
        for (const path of sprite.paths) {
          assert.match(path.d, PATH_DATA, `${name} path data`);
          if (!isBaseBenjoPath(path)) {
            assert.ok(path.d.length < MAX_D_LENGTH, `${name} d too long`);
          }
          for (const color of [path.fill, path.stroke]) {
            if (color === undefined) continue;
            assert.ok(HEX.test(color) || PALETTE_KEYS.includes(color), `${name} color ${color}`);
          }
        }
      }
    });

    test('is under 4 KB gzipped', () => {
      const file = new URL(`../../src/themes/${key}/index.js`, import.meta.url);
      const size = gzipSync(readFileSync(file), { level: 9 }).length;
      assert.ok(size < MAX_GZIP_BYTES, `${key} is ${size} bytes gzipped`);
    });
  });
}

describe('bundled packs with the real calendar', () => {
  const on = (y, m, d) => resolveTheme({ y, m, d }, HOLIDAYS, themes).id;

  test('Oct 24 2026 resolves halloween', () => {
    assert.equal(on(2026, 10, 24), 'halloween');
  });

  test('Jul 20 2026 resolves default', () => {
    assert.equal(on(2026, 7, 20), 'default');
  });

  test('December resolves christmas, early November resolves default', () => {
    assert.equal(on(2026, 12, 1), 'christmas');
    assert.equal(on(2026, 12, 26), 'christmas');
    assert.equal(on(2026, 11, 30), 'default');
    assert.equal(on(2026, 11, 26), 'default');
  });

  test('without a newyear pack, late December falls back to default', () => {
    assert.equal(on(2026, 12, 28), 'default');
    assert.equal(on(2027, 1, 1), 'default');
  });
});
