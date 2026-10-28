// @ts-check
// Turns the host's InputState into one hop for this step: up, down, left, right, or none.
//
// Keys hop on their press. A pointer press is held until it ends, because a swipe also starts
// with a press: if the host reports a swipe, the swipe wins; otherwise Benjo hops toward the
// spot that was pressed. The host's tap echo of that press is dropped, as in flight.

import { TAP_ECHO } from './tuning.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('./world.js').Dir} Dir */
/**
 * @typedef {{ pointerDown: boolean, pointerAt: number, pressed: boolean, pressX: number,
 *   pressY: number }} PointerTracker
 */

/** @returns {PointerTracker} */
export const createTracker = () => ({
  pointerDown: false,
  pointerAt: Number.NEGATIVE_INFINITY,
  pressed: false,
  pressX: 0,
  pressY: 0,
});

/**
 * Forget pointer history, treating a pointer that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not hop.
 * @param {PointerTracker} tracker
 * @param {InputState} input
 */
export function resetTracker(tracker, input) {
  tracker.pointerDown = Boolean(input.pointer?.down);
  tracker.pointerAt = Number.NEGATIVE_INFINITY;
  tracker.pressed = false;
}

/** @type {Dir[]} */
const DIRS = ['up', 'down', 'left', 'right'];

/**
 * Direction along the dominant axis from Benjo to a point; straight up when they overlap.
 * @param {number} dx @param {number} dy screen y grows downward
 * @returns {Dir}
 */
export function towards(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/**
 * @param {InputState} input
 * @param {PointerTracker} tracker mutated
 * @param {number} now seconds on the run clock
 * @param {number} benjoX Benjo's center in canvas px
 * @param {number} benjoY
 * @returns {Dir | null}
 */
export function readHop(input, tracker, now, benjoX, benjoY) {
  const pointerDown = Boolean(input.pointer?.down);
  const pointerEdge = pointerDown && !tracker.pointerDown;
  const released = !pointerDown && tracker.pointerDown;
  tracker.pointerDown = pointerDown;
  if (pointerEdge && input.pointer) {
    tracker.pointerAt = now;
    tracker.pressed = true;
    tracker.pressX = input.pointer.x;
    tracker.pressY = input.pointer.y;
  }
  if (input.swipe) {
    tracker.pressed = false;
    return input.swipe;
  }
  if (released && tracker.pressed) {
    tracker.pressed = false;
    return towards(tracker.pressX - benjoX, tracker.pressY - benjoY);
  }
  for (const dir of DIRS) if (input.justPressed(dir)) return dir;
  const primary = input.justPressed('primary');
  const echo = now - tracker.pointerAt < TAP_ECHO;
  return primary && !echo ? 'up' : null;
}
