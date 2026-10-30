// @ts-check
// Turns the host's InputState into the way Benjo walks this step (#100).
//
// Keys: hold an arrow or WASD to walk; the newest one held wins, and letting go stops him. Touch:
// hold a finger and he walks toward it along whichever axis it is farther off; lift it to stop.

import { createPress, pointerPressed, resetPress } from '../../shell/press.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('./world.js').Intent} Intent */
/**
 * `last` is the newest arrow pressed, so it wins over older ones still held. `live` is false while
 * the finger that started or resumed the run is still down.
 * @typedef {import('../../shell/press.js').PressTracker & { last: number, live: boolean }} PointerTracker
 */

/** The InputState action for each way: up, right, down, left. */
const ACTIONS = /** @type {const} */ (['up', 'right', 'down', 'left']);
/** A finger this close to Benjo, in px, doesn't move him. */
const DEADZONE = 8;

/** @returns {PointerTracker} */
export const createTracker = () => ({ ...createPress(), last: -1, live: true });

/** @returns {Intent} */
export const createIntent = () => ({ dir: -1 });

/**
 * Forget input history; a finger already down stays dead until it lifts.
 * @param {PointerTracker} tracker
 * @param {InputState} input
 */
export function resetTracker(tracker, input) {
  resetPress(tracker, input);
  tracker.last = -1;
  tracker.live = !tracker.pointerDown;
}

/**
 * @param {InputState} input
 * @param {PointerTracker} tracker mutated
 * @param {number} now seconds on the run clock
 * @param {number} x Benjo's screen x
 * @param {number} y Benjo's screen y
 * @param {Intent} intent mutated and returned, so a step allocates nothing
 * @returns {Intent}
 */
export function readIntent(input, tracker, now, x, y, intent) {
  if (pointerPressed(tracker, input, now)) tracker.live = true;
  ACTIONS.forEach((action, d) => {
    if (input.justPressed(action)) tracker.last = d;
  });
  if (tracker.last >= 0 && !input.isDown(ACTIONS[tracker.last])) tracker.last = -1;
  const held = ACTIONS.findIndex((action) => input.isDown(action));
  intent.dir = tracker.last >= 0 ? tracker.last : held;
  const { pointer } = input;
  if (intent.dir < 0 && pointer?.down && tracker.live) {
    const dx = pointer.x - x;
    const dy = pointer.y - y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > DEADZONE) {
      intent.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    }
  }
  return intent;
}
