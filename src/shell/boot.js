// @ts-check
// Pure selection of message, game, and theme from config and the query string (ADR-0008 section 3).
/** @typedef {import('../contracts').Registry} Registry */
/** @typedef {import('../contracts').BenjoConfig} BenjoConfig */
/** @typedef {import('../contracts').Resolved} Resolved */
/** @typedef {import('../contracts').ThemePack} ThemePack */
/** @typedef {import('../contracts').GameModule} GameModule */
/** @typedef {{ y: number, m: number, d: number }} DayDate */
/** @typedef {(date: DayDate, themes: Record<string, ThemePack>) => ThemePack | null | undefined} PickTheme */

import { DATE_PATTERN, ID_PATTERN } from './dom.js';

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isSafeId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

/**
 * @param {Record<string, unknown>} table
 * @param {unknown} id
 * @returns {id is string}
 */
function has(table, id) {
  return isSafeId(id) && Object.keys(table).includes(id);
}

/**
 * Parse YYYY-MM-DD into a real calendar date, or null.
 * @param {unknown} value
 * @returns {DayDate | null}
 */
export function parseDay(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return null;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > daysInMonth) return null;
  return { y, m, d };
}

/**
 * Local calendar date, never UTC.
 * @param {Date} now
 * @returns {DayDate}
 */
export function localDay(now) {
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

/**
 * @param {DayDate} date
 * @returns {string}
 */
export function formatDay(date) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${date.y}-${pad(date.m)}-${pad(date.d)}`;
}

/**
 * @param {Registry} registry
 * @param {BenjoConfig} config
 * @param {Record<string, string | undefined>} query
 * @param {DayDate} date
 * @param {PickTheme | null} pickTheme
 * @returns {ThemePack}
 */
function resolveThemePack(registry, config, query, date, pickTheme) {
  const { themes } = registry;
  const fallback = themes.default;
  if (query.theme === 'none') return fallback;
  if (has(themes, query.theme)) return themes[query.theme];
  if (config.theme !== 'auto') return has(themes, config.theme) ? themes[config.theme] : fallback;
  return pickTheme?.(date, themes) ?? fallback;
}

/**
 * The game a visit starts on (ADR-0014). `?game=` pins a bundled game and `?game=none` turns
 * games off. Otherwise config.startGame picks a random bundled game or the first configured one.
 * @param {GameModule[]} games bundled, configured games in config order
 * @param {BenjoConfig} config
 * @param {Record<string, string | undefined>} query
 * @param {() => number} random in [0, 1)
 * @returns {GameModule | null}
 */
export function pickGame(games, config, query, random) {
  if (query.game === 'none' || games.length === 0) return null;
  const pinned = isSafeId(query.game) ? games.find((game) => game.id === query.game) : undefined;
  if (pinned) return pinned;
  if (config.startGame === 'first') return games[0];
  const index = Math.floor(random() * games.length);
  return games[Math.min(Math.max(index, 0), games.length - 1)];
}

/**
 * @param {Registry} registry
 * @param {BenjoConfig} config
 * @param {Record<string, string | undefined>} query raw values; each is validated here
 * @param {Date} now
 * @param {boolean} prefersReducedMotion
 * @param {PickTheme | null} [pickTheme] holiday resolver for theme 'auto'; null keeps default
 * @param {() => number} [random] picks the starting game; the default always picks the first
 * @returns {Resolved & { date: DayDate }}
 */
export function resolve(
  registry,
  config,
  query,
  now,
  prefersReducedMotion,
  pickTheme = null,
  random = () => 0,
) {
  if (!registry.themes || !has(registry.themes, 'default')) {
    throw new Error('benjo-404: no default theme in the registry');
  }
  const { messages, games } = registry;
  const messageId = has(messages, query.message) ? query.message : config.message;
  const message = messages[messageId];
  if (!message) throw new Error(`benjo-404: unknown message "${messageId}"`);

  const bundled = [...new Set(config.games)].filter((id) => has(games, id)).map((id) => games[id]);
  const game = pickGame(bundled, config, query, random);

  const date = parseDay(query.date) ?? localDay(now);
  const theme = resolveThemePack(registry, config, query, date, pickTheme);

  return {
    message,
    game,
    games: game ? bundled : [],
    picker: game !== null && config.gamePicker !== false && bundled.length > 1,
    theme,
    date,
    reducedMotion: query.rm === '1' || prefersReducedMotion === true,
    debug: query.debug === '1',
  };
}
