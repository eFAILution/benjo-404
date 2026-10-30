import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { gzipSync } from 'node:zlib';

import { benjo } from '../../src/assets/benjo.js';
import { BRAND_RED, BRAND_RED_SOFT } from '../../src/assets/brand.js';
import { HOLIDAYS } from '../../src/holidays/calendar.js';
import { resolveTheme } from '../../src/holidays/resolve.js';
import { CUES } from '../../src/shell/audio.js';
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
const CUE_NAMES = Object.keys(CUES);

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
  test('ship default and eight holiday packs (#12)', () => {
    assert.deepEqual(Object.keys(themes).sort(), [
      'christmas',
      'default',
      'easter',
      'halloween',
      'independence',
      'newyear',
      'stpatricks',
      'thanksgiving',
      'valentines',
    ]);
  });

  test('benjo.config.json bundles every pack, so auto can pick each one', () => {
    const config = JSON.parse(
      readFileSync(new URL('../../benjo.config.json', import.meta.url), 'utf8'),
    );
    assert.deepEqual([...config.themes].sort(), Object.keys(themes).sort());
  });

  test('remembrance days have no pack (A-8.3)', () => {
    const holidays = new Set(packEntries.map(([, pack]) => pack.holiday));
    for (const id of ['mlk', 'memorial', 'juneteenth', 'veterans'])
      assert.ok(!holidays.has(id), id);
  });

  test('folder names match pack ids', () => {
    assert.equal(themes.default, defaultPack);
    assert.equal(themes.halloween, halloweenPack);
    assert.equal(themes.christmas, christmasPack);
    for (const [key, pack] of packEntries) assert.equal(pack.id, key);
  });

  test('tokens.css repeats the brand red from src/assets/brand.js', () => {
    const css = readFileSync(new URL('../../src/shell/styles/tokens.css', import.meta.url), 'utf8');
    const token = (name) => css.match(new RegExp(`${name}:\\s*(#[0-9a-f]+);`, 'i'))?.[1];
    assert.equal(token('--brand'), BRAND_RED);
    assert.equal(token('--accent'), defaultPack.palette.accent);
    assert.equal(token('--accent-soft'), BRAND_RED_SOFT);
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

    test('sound cues use known names and sane tones', () => {
      for (const [name, tones] of Object.entries(pack.cues ?? {})) {
        assert.ok(CUE_NAMES.includes(name), `unknown cue ${name}`);
        assert.ok(tones.length > 0 && tones.length <= 6, `${name} has 1 to 6 tones`);
        for (const tone of tones) {
          assert.ok(tone.f >= 40 && tone.f <= 8000, `${name} frequency in range`);
          assert.ok(tone.d > 0 && tone.d <= 1, `${name} lasts at most a second`);
          assert.ok((tone.at ?? 0) + tone.d <= 1.5, `${name} ends within 1.5 s`);
          assert.ok(tone.g === undefined || (tone.g > 0 && tone.g <= 1), `${name} gain in 0..1`);
        }
      }
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

  test('December resolves christmas, and the days between holidays resolve default', () => {
    assert.equal(on(2026, 12, 1), 'christmas');
    assert.equal(on(2026, 12, 26), 'christmas');
    assert.equal(on(2026, 11, 30), 'default');
    assert.equal(on(2026, 11, 5), 'default');
  });

  // Each new pack across its window: the first day, the day itself, the last day, and the day
  // after (#12).
  const WINDOWS = [
    ['newyear', [2026, 12, 27], [2027, 1, 1], [2027, 1, 4], [2027, 1, 5]],
    ['valentines', [2027, 1, 31], [2027, 2, 14], [2027, 2, 15], [2027, 2, 16]],
    ['stpatricks', [2027, 3, 7], [2027, 3, 17], [2027, 3, 18], [2027, 3, 19]],
    ['easter', [2026, 3, 22], [2026, 4, 5], [2026, 4, 6], [2026, 4, 7]],
    ['independence', [2026, 6, 20], [2026, 7, 4], [2026, 7, 5], [2026, 7, 6]],
    ['thanksgiving', [2026, 11, 12], [2026, 11, 26], [2026, 11, 27], [2026, 11, 28]],
  ];
  for (const [id, first, day, last, after] of WINDOWS) {
    test(`${id} covers its window and ends after it`, () => {
      assert.equal(on(...first), id, 'first day');
      assert.equal(on(...day), id, 'the day itself');
      assert.equal(on(...last), id, 'last day');
      assert.notEqual(on(...after), id, 'the day after');
    });
  }

  test('Christmas keeps Boxing Day; New Year takes over the day after', () => {
    assert.equal(on(2026, 12, 26), 'christmas');
    assert.equal(on(2026, 12, 27), 'newyear');
  });

  test('Juneteenth and Veterans Day stay on the brand theme', () => {
    assert.equal(on(2026, 6, 19), 'default');
    assert.equal(on(2026, 11, 11), 'default');
  });
});
