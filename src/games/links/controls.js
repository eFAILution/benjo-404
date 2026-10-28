// @ts-check
// Turns the host's InputState into one intent for this step: move the cursor, turn a tile, or
// turn the tile under a fresh pointer press.
//
// A pointer press turns on its down edge, so a tap feels instant. The host also reports a tap
// as `primary` when the pointer comes back up; that echo of a press we already used is dropped.
// ArrowUp raises both `primary` and `up`, so directions win and `primary` waits for a clean tick.

import { TAP_ECHO } from './tuning.js';
import { tileAt } from './world.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('./world.js').Intent} Intent */
/** @typedef {import('./world.js').World} World */
/** @typedef {{ pointerDown: boolean, pointerAt: number }} PointerTracker */

/** @returns {PointerTracker} */
export const createTracker = () => ({ pointerDown: false, pointerAt: Number.NEGATIVE_INFINITY });

/** @returns {Intent} */
export const createIntent = () => ({ dx: 0, dy: 0, turn: false, tapTile: -1 });

/**
 * Forget pointer history, treating a pointer that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not turn.
 * @param {PointerTracker} tracker
 * @param {InputState} input
 */
export function resetTracker(tracker, input) {
  tracker.pointerDown = Boolean(input.pointer?.down);
  tracker.pointerAt = Number.NEGATIVE_INFINITY;
}

/** 1 when the action was pressed this tick or the swipe went that way. @param {InputState} input @param {'left' | 'right' | 'up' | 'down'} action */
const went = (input, action) => (input.justPressed(action) || input.swipe === action ? 1 : 0);

/**
 * @param {InputState} input
 * @param {PointerTracker} tracker mutated
 * @param {World} w for the tile under the pointer and the run clock
 * @param {Intent} out mutated and returned, so a step allocates nothing
 * @returns {Intent}
 */
export function readIntent(input, tracker, w, out) {
  const pointer = input.pointer;
  const pointerDown = Boolean(pointer?.down);
  const pointerEdge = pointerDown && !tracker.pointerDown;
  tracker.pointerDown = pointerDown;
  if (pointerEdge) tracker.pointerAt = w.time;

  out.tapTile = pointer && pointerEdge ? tileAt(w, pointer.x, pointer.y) : -1;
  out.dx = went(input, 'right') - went(input, 'left');
  out.dy = went(input, 'down') - went(input, 'up');
  const direction =
    input.justPressed('up') ||
    input.justPressed('down') ||
    input.justPressed('left') ||
    input.justPressed('right');
  const primary = input.justPressed('primary');
  const echo = primary && !pointerEdge && w.time - tracker.pointerAt < TAP_ECHO;
  out.turn = primary && !echo && !direction;
  return out;
}
