// @ts-check
// Turns the host's InputState into this step's intent: which way the paddle goes, and serve.
//
// A pointer press serves on its down edge. The host also reports a tap as `primary` when the
// pointer comes back up; that echo of a press we already used is dropped. A pointer that moves
// sets a target the paddle slides toward; a held arrow key overrides it.

import { TAP_ECHO } from './tuning.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('./world.js').Intent} Intent */
/**
 * @typedef {{ pointerDown: boolean, pointerAt: number, pointerX: number | null,
 *   intent: Intent }} PointerTracker
 */

/** @returns {PointerTracker} */
export const createTracker = () => ({
  pointerDown: false,
  pointerAt: Number.NEGATIVE_INFINITY,
  pointerX: null,
  intent: { move: 0, targetX: null, serve: false },
});

/**
 * Forget pointer history, treating a pointer that is already down as used and one already
 * over the canvas as not moved. Called at start and resume.
 * @param {PointerTracker} tracker
 * @param {InputState} input
 */
export function resetTracker(tracker, input) {
  tracker.pointerDown = Boolean(input.pointer?.down);
  tracker.pointerAt = Number.NEGATIVE_INFINITY;
  tracker.pointerX = input.pointer ? input.pointer.x : null;
  tracker.intent.targetX = null;
}

/**
 * @param {InputState} input
 * @param {PointerTracker} tracker mutated
 * @param {number} now seconds on the run clock
 * @returns {boolean} the player served this step
 */
export function readServe(input, tracker, now) {
  const pointerDown = Boolean(input.pointer?.down);
  const pointerEdge = pointerDown && !tracker.pointerDown;
  tracker.pointerDown = pointerDown;
  if (pointerEdge) tracker.pointerAt = now;

  const primary = input.justPressed('primary');
  const echo = primary && !pointerEdge && now - tracker.pointerAt < TAP_ECHO;
  return pointerEdge || (primary && !echo) || input.justPressed('up');
}

/**
 * Read one step of input. The returned intent is the tracker's own object, reused every step.
 * @param {InputState} input
 * @param {PointerTracker} tracker mutated
 * @param {number} now
 * @returns {Intent}
 */
export function readIntent(input, tracker, now) {
  const { intent } = tracker;
  intent.serve = readServe(input, tracker, now);
  intent.move = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
  const x = input.pointer ? input.pointer.x : null;
  if (x !== null && x !== tracker.pointerX) intent.targetX = x;
  tracker.pointerX = x;
  if (intent.move !== 0) intent.targetX = null;
  return intent;
}
