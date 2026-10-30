// @ts-check
// The 18 trophies (#22). Their order is the bit order in the saved mask and the save code, so
// new trophies append and none is ever removed.
/** @typedef {import('./host.js').RunEvent} RunEvent */

/** [id, name, how to earn it]. The teapot's how stays '???' until it is found. */
export const TROPHIES = /** @type {const} */ ([
  ['hello', 'Hello, World', 'Finish your first run'],
  ['fullstack', 'Full Stack', 'Play every game'],
  ['uptime', 'Zero Downtime', 'Survive 60 s in one run'],
  ['offbyone', 'Off by One', 'End one point under your best'],
  ['hotfix', 'Hotfix', 'Beat your best right after a miss'],
  ['works', 'Works on My Machine', 'Your Digital Twin takes a hit'],
  ['revert', 'git revert', 'A Rollback saves a run'],
  ['gcday', 'Garbage Day', 'Clear 5+ with one Garbage Collector'],
  ['feature', 'Feature Complete', 'Use all six power-ups'],
  ['legacy', 'Legacy Code', 'Come back on another day'],
  ['velocity', 'Velocity', 'Close 5 sprint tickets'],
  ['nightly', 'Nightly Build', 'Finish a nightly build'],
  ['threenines', 'Three Nines', 'Keep a 3-day nightly streak'],
  ['shipit', 'Ship It', 'Reach v1.0.0'],
  ['regression', 'Regression Test', 'Beat your best while racing your ghost'],
  ['panic', 'Kernel Panic', 'Crash 3 times in 60 s'],
  ['backup', 'Backup Restored', 'Load a save code'],
  ['teapot', "418 I'm a Teapot", 'Tap the big 404 four times, fast'],
]);

export const TROPHY_COUNT = TROPHIES.length;
export const ALL_TROPHIES = 2 ** TROPHY_COUNT - 1;
export const ALL_POWERS = 63;

/** @param {string} id */
export const trophyBit = (id) => 2 ** TROPHIES.findIndex(([key]) => key === id);

/**
 * @param {number} mask
 * @param {string} id
 */
export const hasTrophy = (mask, id) => (mask & trophyBit(id)) !== 0;

/** @param {number} mask */
export function countTrophies(mask) {
  return TROPHIES.filter(([id]) => hasTrophy(mask, id)).length;
}

/**
 * What the engine knows around a run's end, beyond the event itself.
 * @typedef {{ allPlayed: boolean, missedLast: boolean, recentEnds: number }} EndFacts
 */

/**
 * Trophies one run event earns. Repeats are fine; the caller keeps only new ones.
 * @param {RunEvent} event
 * @param {EndFacts} facts
 * @returns {string[]}
 */
export function trophiesFor(event, facts) {
  if (event.type === 'absorb') return ['works'];
  if (event.type === 'rollback') return ['revert'];
  if (event.type === 'collect') return event.count >= 5 ? ['gcday'] : [];
  if (event.type !== 'end') return [];
  const { score, previous, seconds } = event;
  const beat = score > previous && previous > 0;
  /** @type {Array<[boolean, string]>} */
  const rules = [
    [true, 'hello'],
    [facts.allPlayed, 'fullstack'],
    [seconds >= 60, 'uptime'],
    [previous > 1 && score === previous - 1, 'offbyone'],
    [beat && facts.missedLast, 'hotfix'],
    [event.nightly, 'nightly'],
    [beat && event.ghost, 'regression'],
    [facts.recentEnds >= 3, 'panic'],
  ];
  return rules.filter(([earned]) => earned).map(([, id]) => id);
}

/**
 * Trophies that follow from totals, checked after every change.
 * @param {{ powers: number, closed: number, streak: number }} state
 * @param {number} level
 * @returns {string[]}
 */
export function trophiesFromTotals(state, level) {
  /** @type {Array<[boolean, string]>} */
  const rules = [
    [(state.powers & ALL_POWERS) === ALL_POWERS, 'feature'],
    [state.closed >= 5, 'velocity'],
    [state.streak >= 3, 'threenines'],
    [level >= 5, 'shipit'],
  ];
  return rules.filter(([earned]) => earned).map(([, id]) => id);
}
