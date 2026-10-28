// @ts-check
// Turns the host's InputState into one yes or no for this step: did the player flap?
//
// A pointer press flaps on its down edge, so a tap feels instant. The host also reports a tap
// as `primary` when the pointer comes back up; that echo of a press we already used is dropped.

import { TAP_ECHO } from './tuning.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {{ pointerDown: boolean, pointerAt: number }} PointerTracker */

/** @returns {PointerTracker} */
export const createTracker = () => ({ pointerDown: false, pointerAt: Number.NEGATIVE_INFINITY });

/**
 * Forget pointer history, treating a pointer that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not flap.
 * @param {PointerTracker} tracker
 * @param {InputState} input
 */
export function resetTracker(tracker, input) {
  tracker.pointerDown = Boolean(input.pointer?.down);
  tracker.pointerAt = Number.NEGATIVE_INFINITY;
}

/**
 * @param {InputState} input
 * @param {PointerTracker} tracker mutated
 * @param {number} now seconds on the run clock
 * @returns {boolean}
 */
export function readFlap(input, tracker, now) {
  const pointerDown = Boolean(input.pointer?.down);
  const pointerEdge = pointerDown && !tracker.pointerDown;
  tracker.pointerDown = pointerDown;
  if (pointerEdge) tracker.pointerAt = now;

  const primary = input.justPressed('primary');
  const echo = primary && !pointerEdge && now - tracker.pointerAt < TAP_ECHO;
  return pointerEdge || (primary && !echo) || input.justPressed('up');
}
