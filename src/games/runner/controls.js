// @ts-check
// Turns the host's InputState into the runner's own intent for one step.
//
// A press must jump on the frame it happens, so a pointer press jumps on its down edge and
// holding it keeps the jump high. The host also reports a tap as `primary` when the pointer
// comes back up; that echo of a press we already used is dropped. Swipe down ducks.

import { TAP_ECHO } from './tuning.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('./world.js').RunnerInput} RunnerInput */
/** @typedef {{ pointerDown: boolean, pointerAt: number }} PointerTracker */

/** @returns {RunnerInput} */
export const createIntent = () => ({
  jumpPressed: false,
  jumpHeld: false,
  duckHeld: false,
  duckTap: false,
});

/** @returns {PointerTracker} */
export const createTracker = () => ({ pointerDown: false, pointerAt: Number.NEGATIVE_INFINITY });

/**
 * Forget pointer history, treating a pointer that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not jump.
 * @param {PointerTracker} tracker
 * @param {InputState} input
 */
export function resetTracker(tracker, input) {
  tracker.pointerDown = Boolean(input.pointer?.down);
  tracker.pointerAt = Number.NEGATIVE_INFINITY;
}

/**
 * Fill `intent` from the host input for this step. Mutates `intent` and `tracker` only.
 * @param {InputState} input
 * @param {RunnerInput} intent
 * @param {PointerTracker} tracker
 * @param {number} now seconds on the run clock
 * @returns {RunnerInput}
 */
export function readIntent(input, intent, tracker, now) {
  const pointerDown = Boolean(input.pointer?.down);
  const pointerEdge = pointerDown && !tracker.pointerDown;
  tracker.pointerDown = pointerDown;
  if (pointerEdge) tracker.pointerAt = now;

  const primary = input.justPressed('primary');
  const echo = primary && !pointerEdge && now - tracker.pointerAt < TAP_ECHO;
  intent.jumpPressed = pointerEdge || (primary && !echo);
  intent.jumpHeld = pointerDown || input.isDown('primary');
  intent.duckHeld = input.isDown('down');
  intent.duckTap = input.swipe === 'down';
  return intent;
}
