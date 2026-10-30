// @ts-check
// Wrap-around for anything that cycles: the game wheel, and the next games on the game over card.

/**
 * `a` wrapped into 0 .. n - 1, negative `a` included.
 * @param {number} a @param {number} n
 */
export const wrap = (a, n) => ((a % n) + n) % n;
