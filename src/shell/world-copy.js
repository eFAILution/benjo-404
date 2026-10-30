// @ts-check
// Rollback copies (#22): a game world copied so it shares nothing with the live one. The world's
// random source is the host's and a function, so it stays out of the copy and goes back on after.

/**
 * @template {{ random: () => number }} W
 * @param {W} world
 * @returns {Omit<W, 'random'>}
 */
export function freezeWorld(world) {
  const { random: _random, ...rest } = world;
  return structuredClone(rest);
}

/**
 * A live world from a frozen copy. The copy stays untouched, so it can be thawed again.
 * @template {object} F
 * @param {F} frozen
 * @param {() => number} random
 * @returns {F & { random: () => number }}
 */
export const thawWorld = (frozen, random) => ({ ...structuredClone(frozen), random });
