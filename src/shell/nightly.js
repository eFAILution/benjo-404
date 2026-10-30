// @ts-check
// The nightly build (#22): one game and one seed per UTC day, the same for every visitor.

const DAY_MS = 86400000;

/**
 * A small seeded generator. The same seed always gives the same sequence.
 * @param {number} seed
 * @returns {() => number} values in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Days since 1970-01-01 in UTC, so the build turns over at the same moment everywhere.
 * @param {number} now ms
 */
export const dayNumber = (now) => Math.floor(now / DAY_MS);

/**
 * Today's game. The seed is salted so the pick does not follow the run's own first number.
 * @template {{ id: string }} T
 * @param {number} day
 * @param {T[]} games bundled games in config order
 * @returns {T | undefined}
 */
export function nightlyGame(day, games) {
  return games[Math.floor(mulberry32(day ^ 0x5bd1e995)() * games.length)];
}

/** @param {number} day */
export const nightlyRandom = (day) => mulberry32(day);

/**
 * The streak as it stands today: it holds while yesterday or today has a finished build.
 * @param {{ streak: number, nightlyDay: number }} state
 * @param {number} day
 */
export const liveStreak = (state, day) => (state.nightlyDay >= day - 1 ? state.streak : 0);

/**
 * Finish today's build. Returns the XP bonus, or 0 when today was already counted.
 * @param {{ streak: number, nightlyDay: number }} state changed in place
 * @param {number} day
 */
export function finishNightly(state, day) {
  if (state.nightlyDay === day) return 0;
  state.streak = state.nightlyDay === day - 1 ? state.streak + 1 : 1;
  state.nightlyDay = day;
  return 30 + 10 * Math.min(state.streak, 5);
}
