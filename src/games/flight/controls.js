// @ts-check
// Turns the host's InputState into one yes or no for this step: did the player flap?
//
// A pointer press flaps on its down edge, so a tap feels instant. The host also reports a tap
// as `primary` when the pointer comes back up; that echo of a press we already used is dropped.

import { createPress, isTapEcho, pointerPressed, resetPress } from '../../shell/press.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('../../shell/press.js').PressTracker} PointerTracker */

/** @returns {PointerTracker} */
export const createTracker = createPress;

/**
 * Forget pointer history, treating a pointer that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not flap.
 * @param {PointerTracker} tracker
 * @param {InputState} input
 */
export const resetTracker = resetPress;

/**
 * @param {InputState} input
 * @param {PointerTracker} tracker mutated
 * @param {number} now seconds on the run clock
 * @returns {boolean}
 */
export function readFlap(input, tracker, now) {
  const pointerEdge = pointerPressed(tracker, input, now);

  const primary = input.justPressed('primary');
  const echo = primary && !pointerEdge && isTapEcho(tracker, now);
  return pointerEdge || (primary && !echo) || input.justPressed('up');
}
