// @ts-check
// Turns the host's InputState into one turn request for this step: a direction, or -1.
//
// Keys ask on their press, and the world keeps the request until that way opens. A pointer
// press is held until it ends, because a swipe also starts with a press: a swipe wins, and
// otherwise Benjo turns toward the spot that was pressed, along the longer axis (as in crossing).

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {{ pointerDown: boolean, pressed: boolean, pressX: number, pressY: number }} PointerTracker */

/** Directions in world order: right, down, left, up. */
const DIRS = /** @type {const} */ (['right', 'down', 'left', 'up']);

/** @returns {PointerTracker} */
export const createTracker = () => ({ pointerDown: false, pressed: false, pressX: 0, pressY: 0 });

/**
 * Forget pointer history, treating a pointer that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not turn.
 * @param {PointerTracker} tracker
 * @param {InputState} input
 */
export function resetTracker(tracker, input) {
  tracker.pointerDown = Boolean(input.pointer?.down);
  tracker.pressed = false;
}

/**
 * The direction along the longer axis from Benjo to a point; up when they overlap.
 * @param {number} dx @param {number} dy screen y grows downward
 */
export function towards(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 0 : 2;
  return dy > 0 ? 1 : 3;
}

/**
 * @param {InputState} input
 * @param {PointerTracker} tracker mutated
 * @param {number} benjoX Benjo's center in canvas px
 * @param {number} benjoY
 * @returns {number} 0..3, or -1 for no new request
 */
export function readTurn(input, tracker, benjoX, benjoY) {
  const pointerDown = Boolean(input.pointer?.down);
  const pointerEdge = pointerDown && !tracker.pointerDown;
  const released = !pointerDown && tracker.pointerDown;
  tracker.pointerDown = pointerDown;
  if (pointerEdge && input.pointer) {
    tracker.pressed = true;
    tracker.pressX = input.pointer.x;
    tracker.pressY = input.pointer.y;
  }
  if (input.swipe) {
    tracker.pressed = false;
    return DIRS.indexOf(input.swipe);
  }
  if (released && tracker.pressed) {
    tracker.pressed = false;
    return towards(tracker.pressX - benjoX, tracker.pressY - benjoY);
  }
  for (let d = 0; d < DIRS.length; d++) if (input.justPressed(DIRS[d])) return d;
  return -1;
}
