// @ts-check
// Turns the host's InputState into Benjo's intent for one step: tap or not.
//
// Space, Up and W all raise `primary` (Up and W raise `up` too), so a fresh `primary` is the tap.
// A pointer press taps on its down edge; the host's tap echo of that press is dropped.

import { createPress, isTapEcho, pointerPressed, resetPress } from '../../shell/press.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('./world.js').Intent} Intent */
/** @typedef {import('../../shell/press.js').PressTracker} PointerTracker */

/** @returns {PointerTracker} */
export const createTracker = createPress;

/** @returns {Intent} */
export const createIntent = () => ({ press: false });

/**
 * Forget pointer history, treating a pointer that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not tap.
 * @param {PointerTracker} tracker
 * @param {InputState} input
 */
export const resetTracker = resetPress;

/**
 * @param {InputState} input
 * @param {PointerTracker} tracker mutated
 * @param {number} now seconds on the run clock
 * @param {Intent} intent mutated and returned, so a step allocates nothing
 * @returns {Intent}
 */
export function readIntent(input, tracker, now, intent) {
  const edge = pointerPressed(tracker, input, now);
  const key = input.justPressed('primary');
  const echo = key && !edge && isTapEcho(tracker, now);
  intent.press = edge || (key && !echo);
  return intent;
}
