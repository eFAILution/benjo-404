// End-to-end build with the fixture theme and game (the real packs arrive with WP1 and WP2).
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { build } from '../../build/build.js';
import { entrySource, listMessages, planBundle, validateConfig } from '../../build/entry.js';
import { faviconDataUrl } from '../../build/favicon.js';
import { extractInline, singleFileCsp } from '../../build/inline.js';
import { benjo } from '../../src/assets/benjo.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
const CONFIG = { message: 'default', games: ['fake'], theme: 'auto', themes: ['default'] };
/** The SVG namespace is an identifier for createElementNS, never fetched. */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const quiet = { warn: () => {} };

describe('build with fixtures', () => {
  let dir;
  let result;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'benjo-404-build-'));
    result = await build({
      themesDir: join(FIXTURES, 'themes'),
      gamesDir: join(FIXTURES, 'games'),
      outDir: join(dir, 'dist'),
      cacheDir: join(dir, 'cache'),
      config: CONFIG,
      log: quiet,
    });
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes 404.html with the static message and no template tokens', async () => {
    const html = await readFile(join(dir, 'dist', '404.html'), 'utf8');
    assert.ok(html.includes('<h1 class="code" id="m-code">404</h1>'));
    assert.ok(html.includes('<a class="btn btn-primary" id="m-cta" href="/">Return Home</a>'));
    assert.ok(html.includes('We&#39;re sorry'));
    assert.ok(!html.includes('{{'));
  });

  it('titles the page like the live site', async () => {
    const html = await readFile(join(dir, 'dist', '404.html'), 'utf8');
    assert.ok(html.includes('<title>Page Not Found | Beast Code</title>'));
  });

  it('links the generated Benjo favicon so the browser never asks for /favicon.ico', async () => {
    const html = await readFile(join(dir, 'dist', '404.html'), 'utf8');
    assert.ok(html.includes(`<link rel="icon" href="${faviconDataUrl(benjo)}">`));
  });

  it('has no external URLs', async () => {
    const html = await readFile(join(dir, 'dist', '404.html'), 'utf8');
    const urls = (html.match(/(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'<>)]*/gi) ?? []).filter(
      (url) => url !== SVG_NAMESPACE,
    );
    assert.deepEqual(urls, []);
    const icon = /<link rel="icon" href="data:image\/svg\+xml,[^"]*">/;
    assert.ok(!/<link|<img|<iframe|\ssrc=/i.test(html.replace(icon, '')));
  });

  it('writes a csp.txt whose hashes match the inline script and style', async () => {
    const html = await readFile(join(dir, 'dist', '404.html'), 'utf8');
    const csp = (await readFile(join(dir, 'dist', 'csp.txt'), 'utf8')).trim();
    assert.equal(csp, singleFileCsp(extractInline(html)));
    assert.ok(!csp.includes('unsafe-inline'));
    assert.ok(csp.includes('; img-src data:; '));
  });

  it('writes the embed outputs', async () => {
    const body = await readFile(join(dir, 'dist', 'embed', '404-body.html'), 'utf8');
    assert.match(body, /^<div id="page">/);
    assert.ok(!body.includes('<script'));
    const css = await readFile(join(dir, 'dist', 'embed', 'benjo-404.css'), 'utf8');
    assert.ok(css.includes('--accent'));
    const csp = await readFile(join(dir, 'dist', 'embed', 'csp.txt'), 'utf8');
    assert.ok(csp.includes("script-src 'self'"));
    assert.ok(csp.includes('; img-src data:; '));
  });

  it('styles no class that Webflow puts on its own body tag (#68)', async () => {
    const css = await readFile(join(dir, 'dist', 'embed', 'benjo-404.css'), 'utf8');
    // Webflow names the body tag's class "body" once it is styled, so `.is-playing .body` hid the page.
    assert.doesNotMatch(css, /\.body(?![\w-])/);
  });

  it('writes sizes.json with every part', async () => {
    const sizes = JSON.parse(await readFile(join(dir, 'dist', 'sizes.json'), 'utf8'));
    for (const part of [
      sizes.shell,
      sizes.fonts,
      sizes.total,
      sizes.games.fake,
      sizes.themes.default,
    ]) {
      assert.equal(typeof part.raw, 'number');
      assert.equal(typeof part.gzip, 'number');
    }
    assert.ok(sizes.total.raw > sizes.shell.gzip);
  });

  it('bundles the fixture game and theme', () => {
    const { script } = extractInline(result.html);
    assert.ok(script.includes('SPACE TO WIN'));
    assert.ok(script.includes('FIXTURE'));
  });
});

describe('build failures', () => {
  it('fails loudly when there is no default theme', async () => {
    await assert.rejects(
      build({ themesDir: join(FIXTURES, 'nowhere'), config: CONFIG, log: quiet }),
      /no default theme/,
    );
  });

  it('fails on a configured game id with no folder', () => {
    const dirs = {
      srcDir: SRC,
      gamesDir: join(FIXTURES, 'games'),
      themesDir: join(FIXTURES, 'themes'),
    };
    assert.throws(() => planBundle({ ...CONFIG, games: ['ghost'] }, dirs), /game "ghost"/);
  });

  it('builds with no games when src/games does not exist yet', () => {
    const dirs = {
      srcDir: SRC,
      gamesDir: join(FIXTURES, 'nowhere'),
      themesDir: join(FIXTURES, 'themes'),
    };
    const plan = planBundle(CONFIG, dirs);
    assert.deepEqual(plan.games, []);
    assert.equal(plan.warnings.length > 0, true);
  });

  it('fails on a configured message with no file', () => {
    const dirs = {
      srcDir: SRC,
      gamesDir: join(FIXTURES, 'games'),
      themesDir: join(FIXTURES, 'themes'),
    };
    assert.throws(() => planBundle({ ...CONFIG, message: 'ghost' }, dirs), /message "ghost"/);
  });

  it('rejects a bad startGame or gamePicker', () => {
    assert.throws(() => validateConfig({ ...CONFIG, startGame: 'last' }), /startGame/);
    assert.throws(() => validateConfig({ ...CONFIG, gamePicker: 'yes' }), /gamePicker/);
    assert.equal(
      validateConfig({ ...CONFIG, startGame: 'first', gamePicker: false }).startGame,
      'first',
    );
  });

  it('rejects an unsafe config id', async () => {
    await assert.rejects(build({ config: { ...CONFIG, games: ['../x'] }, log: quiet }), /games/);
  });
});

describe('entrySource', () => {
  it('imports only configured modules and the pinned theme', () => {
    const dirs = {
      srcDir: SRC,
      gamesDir: join(FIXTURES, 'games'),
      themesDir: join(FIXTURES, 'themes'),
    };
    const config = { ...CONFIG, theme: 'default', themes: ['default', 'halloween'] };
    const plan = planBundle(config, dirs);
    const source = entrySource(plan, config, { srcDir: SRC });
    assert.equal(plan.holidays, null);
    assert.match(source, /import game_fake from ".*\/fixtures\/games\/fake\/index\.js";/);
    assert.match(source, /themes: \{ "default": theme_default \}/);
    assert.ok(!source.includes('halloween/index.js'));
  });
});

describe('messages', () => {
  it('finds every message by file name, with no registry to edit', () => {
    const ids = listMessages(join(FIXTURES, 'messages')).map(({ id }) => id);
    assert.deepEqual(ids, ['default', 'extra']);
  });

  it('bundles every message so ?message= can pick any of them', () => {
    const dirs = {
      srcDir: SRC,
      gamesDir: join(FIXTURES, 'games'),
      themesDir: join(FIXTURES, 'themes'),
      messagesDir: join(FIXTURES, 'messages'),
    };
    const plan = planBundle(CONFIG, dirs);
    const source = entrySource(plan, CONFIG, { srcDir: SRC, includeModules: false });
    assert.match(source, /import message_extra from ".*\/fixtures\/messages\/extra\.js";/);
    assert.match(source, /messages: \{ "default": message_default, "extra": message_extra \}/);
  });
});
