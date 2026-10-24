// @ts-check
// Picks the theme pack for a date: the closest holiday whose window holds
// the date and that has a bundled pack. Falls back to themes.default.
import { daysBetween, holidayDate } from './calendar.js';

/** @typedef {import('../contracts').Holiday} Holiday */
/** @typedef {import('../contracts').ThemePack} ThemePack */
/** @typedef {{ y: number, m: number, d: number }} CivilDate */
/** @typedef {{ pack: ThemePack, delta: number, order: number }} Candidate */

/** Years checked around today, so late December can see next New Year. */
const YEAR_OFFSETS = [-1, 0, 1];

/**
 * True when a beats b: nearer first, then upcoming over past, then the
 * earlier calendar position.
 * @param {Candidate} a
 * @param {Candidate | null} b
 * @returns {boolean}
 */
function isBetter(a, b) {
  if (!b) return true;
  const distanceA = Math.abs(a.delta);
  const distanceB = Math.abs(b.delta);
  if (distanceA !== distanceB) return distanceA < distanceB;
  const upcomingA = a.delta >= 0;
  const upcomingB = b.delta >= 0;
  if (upcomingA !== upcomingB) return upcomingA;
  return a.order < b.order;
}

/**
 * @param {Record<string, ThemePack>} themes
 * @returns {Map<string, ThemePack>} holiday id -> first pack for it
 */
function packsByHoliday(themes) {
  const byHoliday = new Map();
  for (const pack of Object.values(themes)) {
    if (pack.holiday !== 'default' && !byHoliday.has(pack.holiday)) {
      byHoliday.set(pack.holiday, pack);
    }
  }
  return byHoliday;
}

/**
 * @param {CivilDate} today local calendar date
 * @param {Holiday[]} calendar
 * @param {Record<string, ThemePack>} themes bundled packs
 * @returns {ThemePack} themes.default when nothing matches
 */
export function resolveTheme(today, calendar, themes) {
  const byHoliday = packsByHoliday(themes);
  /** @type {Candidate | null} */
  let best = null;
  for (const [order, holiday] of calendar.entries()) {
    const pack = byHoliday.get(holiday.id);
    if (!pack) continue;
    for (const offset of YEAR_OFFSETS) {
      const delta = daysBetween(today, holidayDate(holiday, today.y + offset));
      const inWindow = delta >= -holiday.after && delta <= holiday.before;
      const candidate = { pack, delta, order };
      if (inWindow && isBetter(candidate, best)) best = candidate;
    }
  }
  return best ? best.pack : themes.default;
}
