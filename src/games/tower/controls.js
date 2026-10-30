// @ts-check
// Turns the host's InputState into Benjo's intent for one step (#95).
//
// Keys: Left and Right run, Space, Up, or W jump. Touch: a press jumps at once, and Benjo runs
// toward the finger while it is held. The host's tap echo of that same press is dropped.

import { createPress, isTapEcho, pointerPressed, resetPress } from '../../shell/press.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('../../shell/press.js').PressTracker} PointerTracker */
/** @typedef {import('./world.js').Intent} Intent */

/** @returns {PointerTracker} */
export const createTracker = createPress;

/** @returns {Intent} */
export const createIntent = () => ({ mx: 0, jump: false, px: null });

/**
 * Forget pointer history, treating a pointer that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not jump.
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
  const held = tracker.pointerDown;
  const edge = pointerPressed(tracker, input, now);
  const echo = !edge && isTapEcho(tracker, now);
  const { pointer } = input;
  intent.mx = Number(input.isDown('right')) - Number(input.isDown('left'));
  intent.jump = edge || input.justPressed('up') || (!echo && input.justPressed('primary'));
  // A finger held since before the run, or since a resume, never runs Benjo.
  const down = Boolean(pointer?.down) && (edge || (held && intent.px !== null));
  intent.px = down && pointer ? pointer.x : null;
  return intent;
}
