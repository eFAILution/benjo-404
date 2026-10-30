// @ts-check
// Turns the host's InputState into the ship's intent for one step: which way the keys steer,
// and where a held finger or mouse is. The world turns a drag into movement (world.js).

import { createPress, pointerPressed, resetPress } from '../../shell/press.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('../../shell/press.js').PressTracker} PointerTracker */
/** @typedef {import('./world.js').Intent} Intent */

/** @returns {PointerTracker} */
export const createTracker = createPress;

/** @returns {Intent} */
export const createIntent = () => ({ mx: 0, my: 0, px: null, py: null, grab: false });

/**
 * Forget pointer history, treating a pointer that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not grab.
 * @param {PointerTracker} tracker
 * @param {InputState} input
 */
export const resetTracker = resetPress;

/**
 * Arrows or WASD steer; up is +1. A pointer that went down during the run drags. A pointer still
 * held from the press that started the run does not, until it lifts and goes down again.
 * @param {InputState} input
 * @param {PointerTracker} tracker mutated
 * @param {number} now seconds on the run clock
 * @param {Intent} intent mutated and returned, so a step allocates nothing
 * @returns {Intent}
 */
export function readIntent(input, tracker, now, intent) {
  const held = tracker.pointerDown;
  const grab = pointerPressed(tracker, input, now);
  const { pointer } = input;
  const dragging = Boolean(pointer?.down) && (grab || (held && intent.px !== null));
  intent.mx = Number(input.isDown('right')) - Number(input.isDown('left'));
  intent.my = Number(input.isDown('up')) - Number(input.isDown('down'));
  intent.px = dragging && pointer ? pointer.x : null;
  intent.py = dragging && pointer ? pointer.y : null;
  intent.grab = grab;
  return intent;
}
