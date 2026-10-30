// @ts-check
// Turns the host's InputState into the ship's intent for one step: which way to turn, whether to
// thrust, whether to fire, and where a held finger or mouse is. The world turns a held pointer
// into turning and thrust (world.js).
//
// Up and W raise both `up` and `primary`, so a press of `primary` that comes with `up` is thrust,
// not a shot. A pointer press fires on its down edge; the host's tap echo of it is dropped.

import { createPress, isTapEcho, pointerPressed, resetPress } from '../../shell/press.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('./world.js').Intent} Intent */
/**
 * `armed` is false while the press that started or resumed the run is still held, so holding it
 * does not fly or fire.
 * @typedef {import('../../shell/press.js').PressTracker & { armed: boolean }} PointerTracker
 */

/** @returns {PointerTracker} */
export const createTracker = () => ({ ...createPress(), armed: true });

/** @returns {Intent} */
export const createIntent = () => ({
  turn: 0,
  thrust: false,
  fire: false,
  firing: false,
  px: null,
  py: null,
});

/**
 * Forget pointer history, treating a pointer or fire key that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not act.
 * @param {PointerTracker} tracker
 * @param {InputState} input
 */
export function resetTracker(tracker, input) {
  resetPress(tracker, input);
  tracker.armed = !(tracker.pointerDown || input.isDown('primary'));
}

/**
 * Left and right turn; up thrusts; Space or Enter fires, and holding it keeps firing. A pointer
 * that went down during the run steers, and fires while it is held.
 * @param {InputState} input
 * @param {PointerTracker} tracker mutated
 * @param {number} now seconds on the run clock
 * @param {Intent} intent mutated and returned, so a step allocates nothing
 * @returns {Intent}
 */
export function readIntent(input, tracker, now, intent) {
  const { pointer } = input;
  const edge = pointerPressed(tracker, input, now);
  const echo = !edge && isTapEcho(tracker, now);
  const thrustKey = input.isDown('up');
  const keyFire = !echo && input.justPressed('primary') && !input.justPressed('up');
  const keyHeld = !echo && input.isDown('primary') && !thrustKey;
  const held = tracker.pointerDown || keyHeld;
  if (edge || keyFire || !held) tracker.armed = true;
  const steering = tracker.pointerDown && tracker.armed && pointer !== null;
  intent.turn = Number(input.isDown('right')) - Number(input.isDown('left'));
  intent.thrust = thrustKey;
  intent.fire = edge || keyFire;
  intent.firing = held && tracker.armed;
  intent.px = steering && pointer ? pointer.x : null;
  intent.py = steering && pointer ? pointer.y : null;
  return intent;
}
