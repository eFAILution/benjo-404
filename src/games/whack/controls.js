// @ts-check
// Turns the host's InputState into one intent for this step: which hole, if any, was whacked.
//
// Direction keys come first, because ArrowUp raises both `up` and `primary` in the same tick.
// A pointer press whacks on its down edge; the host's tap echo of that press is dropped.

import { createPress, isTapEcho, pointerPressed, resetPress } from '../../shell/press.js';
import { holeAt } from './world.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('../../contracts').Action} Action */
/** @typedef {import('./world.js').World} World */
/** @typedef {import('./world.js').Intent} Intent */
/** @typedef {import('../../shell/press.js').PressTracker & { intent: Intent }} PointerTracker */

/** Hole 1 to 4, in hole order. @type {Action[]} */
const DIRECTIONS = ['up', 'right', 'down', 'left'];

/** @returns {PointerTracker} */
export const createTracker = () => ({
  ...createPress(),
  intent: { hole: -1 },
});

/**
 * Forget pointer history, treating a pointer that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not whack.
 * @param {PointerTracker} tracker
 * @param {InputState} input
 */
export const resetTracker = resetPress;

/** @param {InputState} input @returns {number} */
function keyHole(input) {
  for (let i = 0; i < DIRECTIONS.length; i++) if (input.justPressed(DIRECTIONS[i])) return i + 1;
  return -1;
}

/**
 * @param {InputState} input
 * @param {PointerTracker} tracker mutated
 * @param {number} now seconds on the run clock
 * @param {World} w read only, for the hole layout
 * @returns {Intent} the tracker's own intent object, reused every step
 */
export function readWhack(input, tracker, now, w) {
  const { pointer } = input;
  const pointerEdge = pointerPressed(tracker, input, now);

  const primary = input.justPressed('primary');
  const echo = primary && !pointerEdge && isTapEcho(tracker, now);
  let hole = keyHole(input);
  if (hole < 0 && primary && !echo) hole = 0;
  if (hole < 0 && pointerEdge && pointer) hole = holeAt(w, pointer.x, pointer.y);
  tracker.intent.hole = hole;
  return tracker.intent;
}
