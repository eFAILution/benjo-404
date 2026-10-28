// @ts-check
// US holiday table and pure date math. Dates are plain {y, m, d} objects
// (month 1 to 12) so no Date arithmetic can drift across DST or time zones.
/** @typedef {import('../contracts').Holiday} Holiday */
/** @typedef {{ y: number, m: number, d: number }} CivilDate */

const JANUARY = 1;
const FEBRUARY = 2;
const MAY = 5;
const SEPTEMBER = 9;
const NOVEMBER = 11;
const MONDAY = 1;
const THURSDAY = 4;
const DAYS_PER_WEEK = 7;
/** 1970-01-01 was a Thursday. */
const EPOCH_WEEKDAY = THURSDAY;

/** @type {Holiday[]} */
export const HOLIDAYS = [
  {
    id: 'newyear',
    name: "New Year's Day",
    rule: { kind: 'fixed', month: 1, day: 1 },
    before: 6,
    after: 3,
  },
  {
    id: 'mlk',
    name: 'Martin Luther King Jr. Day',
    rule: { kind: 'nthWeekday', month: JANUARY, weekday: MONDAY, n: 3 },
    before: 2,
    after: 0,
  },
  {
    id: 'valentines',
    name: "Valentine's Day",
    rule: { kind: 'fixed', month: 2, day: 14 },
    before: 14,
    after: 1,
  },
  {
    id: 'presidents',
    name: "Presidents' Day",
    rule: { kind: 'nthWeekday', month: FEBRUARY, weekday: MONDAY, n: 3 },
    before: 2,
    after: 0,
  },
  {
    id: 'stpatricks',
    name: "St. Patrick's Day",
    rule: { kind: 'fixed', month: 3, day: 17 },
    before: 10,
    after: 1,
  },
  {
    id: 'easter',
    name: 'Easter',
    rule: { kind: 'easter', offsetDays: 0 },
    before: 14,
    after: 1,
  },
  {
    id: 'memorial',
    name: 'Memorial Day',
    rule: { kind: 'nthWeekday', month: MAY, weekday: MONDAY, n: -1 },
    before: 3,
    after: 0,
  },
  {
    id: 'juneteenth',
    name: 'Juneteenth',
    rule: { kind: 'fixed', month: 6, day: 19 },
    before: 3,
    after: 0,
  },
  {
    id: 'independence',
    name: 'Independence Day',
    rule: { kind: 'fixed', month: 7, day: 4 },
    before: 14,
    after: 1,
  },
  {
    id: 'labor',
    name: 'Labor Day',
    rule: { kind: 'nthWeekday', month: SEPTEMBER, weekday: MONDAY, n: 1 },
    before: 3,
    after: 0,
  },
  {
    id: 'halloween',
    name: 'Halloween',
    rule: { kind: 'fixed', month: 10, day: 31 },
    before: 21,
    after: 1,
  },
  {
    id: 'veterans',
    name: 'Veterans Day',
    rule: { kind: 'fixed', month: 11, day: 11 },
    before: 3,
    after: 0,
  },
  {
    id: 'thanksgiving',
    name: 'Thanksgiving',
    rule: { kind: 'nthWeekday', month: NOVEMBER, weekday: THURSDAY, n: 4 },
    before: 14,
    after: 1,
  },
  {
    id: 'christmas',
    name: 'Christmas',
    rule: { kind: 'fixed', month: 12, day: 25 },
    before: 24,
    after: 1,
  },
];

/**
 * Days since 1970-01-01 in the proleptic Gregorian calendar.
 * Integer math only (Hinnant's days_from_civil).
 * @param {CivilDate} date
 * @returns {number}
 */
export function dayNumber({ y, m, d }) {
  const year = m <= 2 ? y - 1 : y;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const shiftedMonth = m > 2 ? m - 3 : m + 9;
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + d - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/**
 * Inverse of dayNumber (Hinnant's civil_from_days).
 * @param {number} days
 * @returns {CivilDate}
 */
export function fromDayNumber(days) {
  const shifted = days + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const d = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const m = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  const y = yearOfEra + era * 400 + (m <= 2 ? 1 : 0);
  return { y, m, d };
}

/**
 * @param {CivilDate} a
 * @param {CivilDate} b
 * @returns {number} dayNumber(b) - dayNumber(a)
 */
export function daysBetween(a, b) {
  return dayNumber(b) - dayNumber(a);
}

/**
 * Weekday with Sunday 0, matching Date.getDay().
 * @param {CivilDate} date
 * @returns {number}
 */
export function weekdayOf(date) {
  const offset = (dayNumber(date) + EPOCH_WEEKDAY) % DAYS_PER_WEEK;
  return (offset + DAYS_PER_WEEK) % DAYS_PER_WEEK;
}

/**
 * @param {number} y
 * @param {number} m
 * @returns {number}
 */
function daysInMonth(y, m) {
  const next = m === 12 ? { y: y + 1, m: 1, d: 1 } : { y, m: m + 1, d: 1 };
  return daysBetween({ y, m, d: 1 }, next);
}

/**
 * The nth given weekday of a month; n = -1 is the last one.
 * @param {number} y
 * @param {number} m
 * @param {number} weekday Sunday 0
 * @param {number} n
 * @returns {CivilDate}
 */
function nthWeekdayDate(y, m, weekday, n) {
  if (n === -1) {
    const last = daysInMonth(y, m);
    const lastWeekday = weekdayOf({ y, m, d: last });
    const back = (lastWeekday - weekday + DAYS_PER_WEEK) % DAYS_PER_WEEK;
    return { y, m, d: last - back };
  }
  const firstWeekday = weekdayOf({ y, m, d: 1 });
  const ahead = (weekday - firstWeekday + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return { y, m, d: 1 + ahead + (n - 1) * DAYS_PER_WEEK };
}

/**
 * Western Easter Sunday, anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 * @param {number} year
 * @returns {CivilDate}
 */
export function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monthDay = h + l - 7 * m + 114;
  return { y: year, m: Math.floor(monthDay / 31), d: (monthDay % 31) + 1 };
}

/**
 * The holiday's date in a given year.
 * @param {Holiday} holiday
 * @param {number} year
 * @returns {CivilDate}
 */
export function holidayDate(holiday, year) {
  const { rule } = holiday;
  if (rule.kind === 'fixed') return { y: year, m: rule.month, d: rule.day };
  if (rule.kind === 'nthWeekday') {
    return nthWeekdayDate(year, rule.month, rule.weekday, rule.n);
  }
  return fromDayNumber(dayNumber(easterDate(year)) + rule.offsetDays);
}
