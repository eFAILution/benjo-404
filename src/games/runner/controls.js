// @ts-check
// Turns the host's InputState into the runner's own intent for one step.
//
// A press must jump on the frame it happens, so a pointer press jumps on its down edge and
// holding it keeps the jump high. The host also reports a tap as `primary` when the pointer
// comes back up; that echo of a press we already used is dropped. Swipe down ducks.

import { createPress, isTapEcho, pointerPressed, resetPress } from '../../shell/press.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('./world.js').RunnerInput} RunnerInput */
/** @typedef {import('../../shell/press.js').PressTracker} PointerTracker */

/** @returns {RunnerInput} */
export const createIntent = () => ({
  jumpPressed: false,
  jumpHeld: false,
  duckHeld: false,
  duckTap: false,
});

/** @returns {PointerTracker} */
export const createTracker = createPress;

/**
 * Forget pointer history, treating a pointer that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not jump.
 * @param {PointerTracker} tracker
 * @param {InputState} input
 */
export const resetTracker = resetPress;

/**
 * Fill `intent` from the host input for this step. Mutates `intent` and `tracker` only.
 * @param {InputState} input
 * @param {RunnerInput} intent
 * @param {PointerTracker} tracker
 * @param {number} now seconds on the run clock
 * @returns {RunnerInput}
 */
export function readIntent(input, intent, tracker, now) {
  const pointerEdge = pointerPressed(tracker, input, now);
  const pointerDown = tracker.pointerDown;

  const primary = input.justPressed('primary');
  const echo = primary && !pointerEdge && isTapEcho(tracker, now);
  intent.jumpPressed = pointerEdge || (primary && !echo);
  intent.jumpHeld = pointerDown || input.isDown('primary');
  intent.duckHeld = input.isDown('down');
  intent.duckTap = input.swipe === 'down';
  return intent;
}
