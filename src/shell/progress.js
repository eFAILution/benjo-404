// @ts-check
// The build version (#22): XP, levels, and the saved progress. Everything lives in the visitor's
// browser under the 'meta' storage, split across short keys so no value passes 256 chars.
/** @typedef {import('../contracts').GameStorage} GameStorage */
/** @typedef {import('./save-code.js').SaveData} SaveData */

import { SAVE_FIELDS } from './save-code.js';

export const TROPHY_XP = 25;
export const MAJOR_LOOKS = 4;
const LEVELS_PER_MAJOR = 5;
const MAX_XP = 1e9;

/** @param {number} level */
export const levelCost = (level) => 40 + 10 * level;

/**
 * @param {number} xp
 * @returns {{ level: number, into: number, cost: number }}
 */
export function levelOf(xp) {
  let level = 0;
  let left = Math.min(MAX_XP, Math.max(0, xp));
  while (left >= levelCost(level)) {
    left -= levelCost(level);
    level += 1;
  }
  return { level, into: left, cost: levelCost(level) };
}

/**
 * `v{major}.{minor}.{patch}`: five levels to a major release, patch is tenths of the level.
 * @param {number} xp
 */
export function version(xp) {
  const { level, into, cost } = levelOf(xp);
  const major = Math.floor(level / LEVELS_PER_MAJOR);
  return `v${major}.${level % LEVELS_PER_MAJOR}.${Math.floor((into * 10) / cost)}`;
}

/** Looks unlocked: one per major release, up to v4. @param {number} xp */
export const looksUnlocked = (xp) =>
  Math.min(MAJOR_LOOKS, Math.floor(levelOf(xp).level / LEVELS_PER_MAJOR));

/**
 * XP for one finished run: a base, a little per 4 s survived, and a bonus for a new best.
 * @param {{ score: number, previous: number, seconds: number }} run
 */
export function runXp({ score, previous, seconds }) {
  const time = Math.min(15, Math.floor(Math.max(0, seconds) / 4));
  return 5 + time + (score > previous && previous > 0 ? 10 : 0);
}

/**
 * The saved progress. `missed` marks games whose last run did not beat the best (Hotfix), and
 * `lastDay` is the last visit (Legacy Code). Both stay out of save codes.
 * @typedef {Omit<SaveData, 'bests'> & { missed: number, lastDay: number }} State
 */

const STATE_KEYS = /** @type {const} */ ([...SAVE_FIELDS, 'missed', 'lastDay']);
const STATE_KEY = 'p';
const STATE_VERSION = '1';

/** @returns {State} */
export const freshState = () =>
  /** @type {State} */ (Object.fromEntries(STATE_KEYS.map((key) => [key, 0])));

/**
 * Corrupt or missing data gives a fresh state; it never throws.
 * @param {GameStorage} storage
 * @returns {State}
 */
export function loadState(storage) {
  const [format, ...parts] = (storage.get(STATE_KEY) ?? '').split(',');
  const numbers = parts.map(Number);
  const valid =
    format === STATE_VERSION &&
    numbers.length === STATE_KEYS.length &&
    numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_XP);
  if (!valid) return freshState();
  return /** @type {State} */ (Object.fromEntries(STATE_KEYS.map((key, i) => [key, numbers[i]])));
}

/**
 * @param {GameStorage} storage
 * @param {State} state
 */
export function saveState(storage, state) {
  storage.set(STATE_KEY, [STATE_VERSION, ...STATE_KEYS.map((key) => state[key])].join(','));
}
