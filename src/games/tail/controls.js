// @ts-check
// Turns the host's InputState into one turn for this step: RIGHT, DOWN, LEFT, UP, or NONE.
//
// Arrow and WASD keys come first, then a swipe, then a tap. A tap turns toward the side of the
// head it landed on, when the host reports it as `primary` on release; turning on the down edge
// would also turn every swipe toward where the finger first touched. A `primary` with no pointer
// press just before it is Space or Enter, which do nothing here.

import { createPress, isTapEcho, pointerPressed, resetPress } from '../../shell/press.js';
import { DOWN, LEFT, NONE, RIGHT, UP } from './tuning.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('../../shell/press.js').PressTracker} PointerTracker */

/** @type {Record<string, number>} */
const SWIPES = { right: RIGHT, down: DOWN, left: LEFT, up: UP };

/** @returns {PointerTracker} */
export const createTracker = createPress;

/**
 * Forget pointer history, treating a pointer that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not turn.
 * @param {PointerTracker} tracker
 * @param {InputState} input
 */
export const resetTracker = resetPress;

/** @param {InputState} input */
function readKeys(input) {
  if (input.justPressed('up')) return UP;
  if (input.justPressed('down')) return DOWN;
  if (input.justPressed('left')) return LEFT;
  if (input.justPressed('right')) return RIGHT;
  return input.swipe ? SWIPES[input.swipe] : NONE;
}

/**
 * @param {InputState} input
 * @param {PointerTracker} tracker mutated
 * @param {number} now seconds on the run clock
 * @param {number} headX screen x of the head cell's center
 * @param {number} headY screen y of the head cell's center
 * @returns {number} RIGHT, DOWN, LEFT, UP, or NONE
 */
export function readTurn(input, tracker, now, headX, headY) {
  const { pointer } = input;
  pointerPressed(tracker, input, now);

  const key = readKeys(input);
  const tap = input.justPressed('primary') && isTapEcho(tracker, now);
  if (key !== NONE || !tap || !pointer) return key;
  const dx = pointer.x - headX;
  const dy = pointer.y - headY;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? RIGHT : LEFT;
  return dy > 0 ? DOWN : UP;
}
