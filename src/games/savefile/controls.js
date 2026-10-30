// @ts-check
// Turns the host's InputState into Benjo's intent for one step (#92).
//
// Keys: Left and Right walk, Up and Down climb, Space jumps. Up also raises `primary`, so a jump
// only counts when Up is not held. Touch: a held finger walks Benjo toward it, a swipe up or down
// at a ladder climbs all of it, and a tap jumps.

import { createPress, pointerPressed, resetPress } from '../../shell/press.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('../../shell/press.js').PressTracker} PointerTracker */
/** @typedef {import('./world.js').Intent} Intent */

/** @returns {PointerTracker} */
export const createTracker = createPress;

/** @returns {Intent} */
export const createIntent = () => ({ mx: 0, my: 0, jump: false, climb: 0, px: null, held: 0 });

/**
 * Forget pointer history, treating a pointer that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not walk.
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
  const fresh = pointerPressed(tracker, input, now);
  const { pointer } = input;
  const up = input.isDown('up');
  intent.mx = Number(input.isDown('right')) - Number(input.isDown('left'));
  intent.my = Number(input.isDown('down')) - Number(up);
  intent.jump = input.justPressed('primary') && !up;
  intent.climb = input.swipe === 'up' ? -1 : input.swipe === 'down' ? 1 : 0;
  // A finger held since before the run, or since a resume, never walks.
  const down = Boolean(pointer?.down) && (fresh || intent.px !== null);
  intent.px = down && pointer ? pointer.x : null;
  intent.held = down ? now - tracker.pointerAt : 0;
  return intent;
}
