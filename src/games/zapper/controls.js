// @ts-check
// Turns the host's InputState into Benjo's intent for one step: where to move, and whether
// to breathe fire.
//
// A pointer press fires on its down edge, so a tap feels instant. The host also reports a tap
// as `primary` when the pointer comes back up; that echo of a press we already used is dropped.

import { createPress, isTapEcho, pointerPressed, resetPress } from '../../shell/press.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('./world.js').Intent} Intent */
/**
 * `armed` is false while the press that started or resumed the run is still held, so holding
 * it does not start auto fire.
 * @typedef {import('../../shell/press.js').PressTracker & { armed: boolean }} PointerTracker
 */

/** @returns {PointerTracker} */
export const createTracker = () => ({
  ...createPress(),
  armed: true,
});

/** @returns {Intent} */
export const createIntent = () => ({ move: 0, targetX: null, fire: false, firing: false });

/**
 * Forget pointer history, treating a pointer that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not fire.
 * @param {PointerTracker} tracker
 * @param {InputState} input
 */
export function resetTracker(tracker, input) {
  resetPress(tracker, input);
  tracker.armed = !(tracker.pointerDown || input.isDown('primary') || input.isDown('up'));
}

/**
 * Left and right keys move and override the pointer; a held pointer drags. Space, Enter, Up,
 * and W fire (Up and W raise both `primary` and `up`, which is one shot). Down does nothing.
 * @param {InputState} input
 * @param {PointerTracker} tracker mutated
 * @param {number} now seconds on the run clock
 * @param {Intent} intent mutated and returned, so a step allocates nothing
 * @returns {Intent}
 */
export function readIntent(input, tracker, now, intent) {
  const { pointer } = input;
  const pointerEdge = pointerPressed(tracker, input, now);
  const pointerDown = tracker.pointerDown;
  const echo = !pointerEdge && isTapEcho(tracker, now);

  intent.move = Number(input.isDown('right')) - Number(input.isDown('left'));
  intent.targetX = pointer && pointerDown ? pointer.x : null;
  intent.fire = pointerEdge || input.justPressed('up') || (!echo && input.justPressed('primary'));
  const held = pointerDown || input.isDown('up') || (!echo && input.isDown('primary'));
  if (intent.fire || !held) tracker.armed = true;
  intent.firing = held && tracker.armed;
  return intent;
}
