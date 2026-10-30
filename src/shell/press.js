// @ts-check
// Pointer bookkeeping that every game's controls share (ADR-0008: shared code lives in src/shell).
//
// A press must act on the step it happens, so games act on the pointer's down edge. The host
// also reports a finished tap as `primary` when the pointer comes back up; a game that already
// acted on the press drops that echo.

/** @typedef {import('../contracts').InputState} InputState */
/** @typedef {{ pointerDown: boolean, pointerAt: number }} PressTracker */

/** A host tap this soon after a pointer press is that same press, in seconds. */
export const TAP_ECHO = 0.4;

/** @returns {PressTracker} */
export const createPress = () => ({ pointerDown: false, pointerAt: Number.NEGATIVE_INFINITY });

/**
 * Forget pointer history, treating a pointer that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not act.
 * @param {PressTracker} tracker
 * @param {InputState} input
 */
export function resetPress(tracker, input) {
  tracker.pointerDown = Boolean(input.pointer?.down);
  tracker.pointerAt = Number.NEGATIVE_INFINITY;
}

/**
 * Fold this step's pointer into the tracker.
 * @param {PressTracker} tracker mutated
 * @param {InputState} input
 * @param {number} now seconds on the run clock
 * @returns {boolean} true on the step the pointer went down
 */
export function pointerPressed(tracker, input, now) {
  const down = Boolean(input.pointer?.down);
  const edge = down && !tracker.pointerDown;
  tracker.pointerDown = down;
  if (edge) tracker.pointerAt = now;
  return edge;
}

/**
 * Is a host tap now the echo of the last pointer press?
 * @param {PressTracker} tracker
 * @param {number} now
 */
export const isTapEcho = (tracker, now) => now - tracker.pointerAt < TAP_ECHO;
