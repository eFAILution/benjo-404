// @ts-check
// esbuild -> dist/404.html, dist/csp.txt, dist/embed/, dist/sizes.json (plan section 11).
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import * as esbuild from 'esbuild';

import { benjo } from '../src/assets/benjo.js';
import { entrySource, planBundle, validateConfig } from './entry.js';
import { faviconDataUrl } from './favicon.js';
import { EMBED_CSP, extractInline, fillFontsCss, fillTemplate, singleFileCsp } from './inline.js';

const REPO_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
// fonts.css is filled separately and goes first in the <style> through {{FONTS_CSS}}.
const CSS_ORDER = ['tokens.css', 'base.css', 'layout.css', 'states.css'];
const FONTS = { FONT_SANS: 'b404-sans-400.woff2', FONT_MONO: 'b404-mono-400.woff2' };
const ESBUILD_JS = /** @type {const} */ ({
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2020'],
  write: false,
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'silent',
});

/**
 * @typedef {object} BuildOptions
 * @property {string} [root] repo root
 * @property {string} [themesDir] defaults to src/themes; tests point it at fixtures
 * @property {string} [gamesDir] defaults to src/games
 * @property {string} [outDir] defaults to dist
 * @property {string} [cacheDir] defaults to .cache
 * @property {unknown} [config] defaults to benjo.config.json
 * @property {{ warn(message: string): void }} [log]
 */

/** @param {string | Buffer} content */
function measure(content) {
  const buffer = Buffer.from(content);
  return { raw: buffer.length, gzip: gzipSync(buffer, { level: 9 }).length };
}

/**
 * @param {import('esbuild').BuildOptions} options
 * @returns {Promise<string>}
 */
async function bundle(options) {
  const result = await esbuild.build({ ...ESBUILD_JS, ...options });
  const output = result.outputFiles?.[0];
  if (!output) throw new Error('esbuild produced no output');
  return output.text.trimEnd();
}

/** Measure a game or theme on its own: shared shell and asset modules are left out. */
const sharedExternal = {
  name: 'shared-external',
  /** @param {import('esbuild').PluginBuild} build */
  setup(build) {
    build.onResolve({ filter: /(^|\/)(shell|assets)\/[^/]+\.js$/ }, (args) =>
      args.kind === 'entry-point' ? undefined : { path: args.path, external: true },
    );
  },
};

/**
 * @param {string} root
 * @param {(message: string) => void} warn
 */
async function readFonts(root, warn) {
  const cssFile = join(root, 'src', 'shell', 'styles', 'fonts.css');
  if (!existsSync(cssFile)) {
    warn('no src/shell/styles/fonts.css yet; using the fallback font stack');
    return { single: '', embed: '', files: [], bytes: Buffer.alloc(0) };
  }
  const css = await readFile(cssFile, 'utf8');
  /** @type {Record<string, string | null>} */
  const dataUrls = {};
  /** @type {Record<string, string | null>} */
  const fileUrls = {};
  const files = [];
  const buffers = [];
  for (const [token, name] of Object.entries(FONTS)) {
    const file = join(root, 'assets', 'fonts', name);
    const present = existsSync(file);
    const bytes = present ? await readFile(file) : null;
    dataUrls[token] = bytes ? `data:font/woff2;base64,${bytes.toString('base64')}` : null;
    fileUrls[token] = present ? `./${name}` : null;
    if (bytes) {
      files.push(file);
      buffers.push(bytes);
    }
  }
  const single = fillFontsCss(css, dataUrls);
  if (single.dropped.length > 0) {
    warn(`missing font files for ${single.dropped.join(', ')}; dropped those @font-face rules`);
  }
  return {
    single: single.css,
    embed: fillFontsCss(css, fileUrls).css,
    files,
    bytes: Buffer.concat(buffers),
  };
}

/** @param {string} root */
async function buildCss(root) {
  const parts = await Promise.all(
    CSS_ORDER.map((name) => readFile(join(root, 'src', 'shell', 'styles', name), 'utf8')),
  );
  const result = await esbuild.transform(parts.join('\n'), {
    loader: 'css',
    minify: true,
    target: ['safari14', 'chrome90', 'firefox90'],
  });
  return result.code.trimEnd();
}

/**
 * @param {string} root
 * @param {string} id
 */
async function loadMessage(root, id) {
  const messages = await import(pathToFileURL(join(root, 'src', 'messages', 'index.js')).href);
  const message = messages[id];
  if (!message || message.id !== id)
    throw new Error(`message "${id}" is not in src/messages/index.js`);
  return message;
}

/**
 * @param {BuildOptions} [options]
 */
export async function build(options = {}) {
  const root = options.root ?? REPO_ROOT;
  const srcDir = join(root, 'src');
  const outDir = options.outDir ?? join(root, 'dist');
  const cacheDir = options.cacheDir ?? join(root, '.cache');
  const warn = (/** @type {string} */ message) =>
    (options.log ?? console).warn(`[build] ${message}`);
  const config = validateConfig(
    options.config ?? JSON.parse(await readFile(join(root, 'benjo.config.json'), 'utf8')),
  );
  const plan = planBundle(config, {
    srcDir,
    gamesDir: options.gamesDir ?? join(srcDir, 'games'),
    themesDir: options.themesDir ?? join(srcDir, 'themes'),
  });
  for (const warning of plan.warnings) warn(warning);

  await mkdir(cacheDir, { recursive: true });
  const entryFile = join(cacheDir, 'entry.js');
  await writeFile(entryFile, entrySource(plan, config, { srcDir }));
  const shellEntry = join(cacheDir, 'entry-shell.js');
  await writeFile(shellEntry, entrySource(plan, config, { srcDir, includeModules: false }));

  const script = await bundle({ entryPoints: [entryFile] });
  const fonts = await readFonts(root, warn);
  const style = await buildCss(root);
  const message = await loadMessage(root, config.message);
  const template = await readFile(join(srcDir, 'template.html'), 'utf8');
  const text = {
    THEME_PIN: config.theme,
    TITLE: message.title ?? `${message.code} · ${message.kicker}`,
    KICKER: message.kicker,
    CODE: message.code,
    BODY: message.body,
    CTA_HREF: message.cta.href,
    CTA_LABEL: message.cta.label,
    FAVICON: faviconDataUrl(benjo),
  };
  const html = fillTemplate(template, {
    text,
    raw: { FONTS_CSS: fonts.single, STYLE: style, SCRIPT: script },
  });
  const csp = singleFileCsp(extractInline(html));

  const embedDir = join(outDir, 'embed');
  await rm(outDir, { recursive: true, force: true });
  await mkdir(embedDir, { recursive: true });
  const embedHtml = fillTemplate(template, { text, raw: { FONTS_CSS: '', STYLE: '', SCRIPT: '' } });
  const body = embedHtml.slice(embedHtml.indexOf('<div id="page">'), embedHtml.indexOf('<script'));
  await Promise.all([
    writeFile(join(outDir, '404.html'), html),
    writeFile(join(outDir, 'csp.txt'), `${csp}\n`),
    writeFile(join(embedDir, '404-body.html'), `${body.trimEnd()}\n`),
    writeFile(join(embedDir, 'benjo-404.js'), `${script}\n`),
    writeFile(join(embedDir, 'benjo-404.css'), `${fonts.embed}${style}\n`),
    writeFile(join(embedDir, 'csp.txt'), `${EMBED_CSP}\n`),
    ...fonts.files.map((file) => copyFile(file, join(embedDir, file.split(/[\\/]/).pop() ?? ''))),
  ]);

  const part = async (/** @type {string} */ file) =>
    measure(await bundle({ entryPoints: [file], plugins: [sharedExternal] }));
  const sizes = {
    shell: measure(`${await bundle({ entryPoints: [shellEntry] })}${style}`),
    fonts: measure(fonts.single),
    games: Object.fromEntries(
      await Promise.all(plan.games.map(async ({ id, file }) => [id, await part(file)])),
    ),
    themes: Object.fromEntries(
      await Promise.all(plan.themes.map(async ({ id, file }) => [id, await part(file)])),
    ),
    total: measure(html),
  };
  await writeFile(join(outDir, 'sizes.json'), `${JSON.stringify(sizes, null, 2)}\n`);
  return { html, csp, sizes, plan, outDir };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  build()
    .then(({ outDir, sizes }) => {
      console.log(
        `[build] wrote ${outDir}/404.html (${sizes.total.raw} bytes, ${sizes.total.gzip} gzipped)`,
      );
    })
    .catch((error) => {
      console.error(`[build] failed: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    });
}
