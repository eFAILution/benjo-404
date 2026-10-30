// @ts-check
// The Digital Twin's blink, which every game draws the same way (#22, ADR-0008: shared code
// lives in src/shell).

/**
 * Is Benjo drawn faint now? He blinks while `graceT` counts down, every `every` seconds, and
 * holds faint for the whole grace under reduced motion.
 * @param {number} graceT seconds of grace left, 0 when none
 * @param {number} every seconds per blink
 * @param {boolean} reducedMotion
 */
export const graceFaint = (graceT, every, reducedMotion) =>
  graceT > 0 && (reducedMotion || Math.floor(graceT / every) % 2 === 0);
