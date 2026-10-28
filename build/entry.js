// @ts-check
// Turns benjo.config.json into the list of bundled modules and the generated .cache/entry.js.
import { existsSync, readdirSync } from 'node:fs';
import { basename, join, relative, resolve as resolvePath, sep } from 'node:path';

const ID = /^[a-z0-9-]{1,32}$/;

/**
 * @typedef {object} BuildConfig
 * @property {string} message
 * @property {string[]} games
 * @property {string} theme
 * @property {string[]} themes
 */
/**
 * @typedef {object} BundlePlan
 * @property {Array<{ id: string, file: string }>} messages
 * @property {Array<{ id: string, file: string }>} games
 * @property {Array<{ id: string, file: string }>} themes
 * @property {{ resolve: string, calendar: string } | null} holidays
 * @property {string[]} warnings
 */

/**
 * @param {unknown} config
 * @returns {BuildConfig}
 */
export function validateConfig(config) {
  const value = /** @type {Record<string, unknown>} */ (config);
  const isIdList = (/** @type {unknown} */ list) =>
    Array.isArray(list) && list.every((id) => typeof id === 'string' && ID.test(id));
  const problems = [
    typeof value?.message === 'string' && ID.test(value.message) ? '' : 'message must be a safe id',
    isIdList(value?.games) ? '' : 'games must be a list of safe ids',
    value?.theme === 'auto' || (typeof value?.theme === 'string' && ID.test(value.theme))
      ? ''
      : "theme must be 'auto' or a safe id",
    isIdList(value?.themes) ? '' : 'themes must be a list of safe ids',
  ].filter(Boolean);
  if (problems.length > 0) throw new Error(`benjo.config.json: ${problems.join('; ')}`);
  return /** @type {BuildConfig} */ (value);
}

/**
 * Every `<id>.js` in the messages folder is a message module, so adding one is adding a file.
 * All of them are bundled, because `?message=` can pick any of them and each is a few hundred
 * bytes.
 * @param {string} messagesDir
 * @returns {Array<{ id: string, file: string }>}
 */
export function listMessages(messagesDir) {
  return readdirSync(messagesDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ id: basename(name, '.js'), file: join(messagesDir, name) }))
    .filter(({ id }) => ID.test(id))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Decide what gets bundled. Missing pieces that other work packages add are warnings; a typo
 * in an id whose folder family exists is an error.
 * @param {BuildConfig} config
 * @param {{ srcDir: string, gamesDir: string, themesDir: string, messagesDir?: string }} dirs
 * @returns {BundlePlan}
 */
export function planBundle(config, { srcDir, gamesDir, themesDir, messagesDir }) {
  /** @type {string[]} */
  const warnings = [];
  const unique = (/** @type {string[]} */ ids) => [...new Set(ids)];

  const messages = listMessages(messagesDir ?? join(srcDir, 'messages'));
  if (!messages.some(({ id }) => id === config.message)) {
    throw new Error(
      `message "${config.message}" is configured but src/messages/${config.message}.js does not exist`,
    );
  }

  const defaultTheme = join(themesDir, 'default', 'index.js');
  if (!existsSync(defaultTheme)) {
    throw new Error(
      `no default theme: ${relative(process.cwd(), defaultTheme)} is missing. ` +
        'Every build needs the default pack (WP2 adds src/themes/default/).',
    );
  }
  const themeIds = unique([
    'default',
    ...(config.theme === 'auto' ? config.themes : [config.theme]),
  ]);
  const themes = themeIds.map((id) => {
    const file = join(themesDir, id, 'index.js');
    if (!existsSync(file))
      throw new Error(`theme "${id}" is configured but ${file} does not exist`);
    return { id, file };
  });

  /** @type {Array<{ id: string, file: string }>} */
  let games = [];
  if (existsSync(gamesDir)) {
    games = unique(config.games).map((id) => {
      const file = join(gamesDir, id, 'index.js');
      if (!existsSync(file))
        throw new Error(`game "${id}" is configured but ${file} does not exist`);
      return { id, file };
    });
  } else if (config.games.length > 0) {
    warnings.push(`no ${gamesDir} yet; building with no games (idle page, no play prompt)`);
  }

  const resolve = join(srcDir, 'holidays', 'resolve.js');
  const calendar = join(srcDir, 'holidays', 'calendar.js');
  let holidays = null;
  if (config.theme === 'auto' && existsSync(resolve) && existsSync(calendar)) {
    holidays = { resolve, calendar };
  } else if (config.theme === 'auto') {
    warnings.push('no src/holidays/ yet; theme "auto" always resolves to default');
  }
  return { messages, games, themes, holidays, warnings };
}

/**
 * Absolute specifiers keep the entry valid wherever the cache directory lives (tests use a
 * temp dir, and /tmp is a symlink on macOS). esbuild never prints them into the bundle.
 * @param {string} file
 */
function importPath(file) {
  return JSON.stringify(resolvePath(file).split(sep).join('/'));
}

/**
 * Source for .cache/entry.js. Only configured games and themes are imported, so esbuild
 * never sees the others. Messages are part of the shell and are always imported.
 * @param {BundlePlan} plan
 * @param {BuildConfig} config
 * @param {{ srcDir: string, includeModules?: boolean }} options
 */
export function entrySource(plan, config, { srcDir, includeModules = true }) {
  const from = importPath;
  const games = includeModules ? plan.games : [];
  const themes = includeModules ? plan.themes : [];
  const name = (/** @type {string} */ kind, /** @type {string} */ id) =>
    `${kind}_${id.replace(/-/g, '_')}`;
  const lines = [
    '// Generated by build/build.js. Do not edit.',
    `import { boot } from ${from(join(srcDir, 'shell', 'main.js'))};`,
    ...plan.messages.map(({ id, file }) => `import ${name('message', id)} from ${from(file)};`),
    ...games.map(({ id, file }) => `import ${name('game', id)} from ${from(file)};`),
    ...themes.map(({ id, file }) => `import ${name('theme', id)} from ${from(file)};`),
  ];
  if (plan.holidays) {
    lines.push(`import { resolveTheme } from ${from(plan.holidays.resolve)};`);
    lines.push(`import { HOLIDAYS } from ${from(plan.holidays.calendar)};`);
  }
  const table = (/** @type {string} */ kind, /** @type {Array<{ id: string }>} */ list) =>
    `{ ${list.map(({ id }) => `${JSON.stringify(id)}: ${name(kind, id)}`).join(', ')} }`;
  const holidays = plan.holidays ? '{ resolveTheme, calendar: HOLIDAYS }' : 'null';
  lines.push(
    `const config = ${JSON.stringify(config)};`,
    `boot({ messages: ${table('message', plan.messages)}, games: ${table('game', games)}, themes: ${table('theme', themes)} }, config, ${holidays});`,
    '',
  );
  return lines.join('\n');
}
