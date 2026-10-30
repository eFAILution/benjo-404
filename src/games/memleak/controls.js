// @ts-check
// Turns the host's InputState into the falling block's intent for one step.
//
// Keys: Left/Right or A/D move, Down or S drops, Space, Enter, Up or W compact. Up and W also
// raise `primary`, and compact reads only `primary`, so one press is one compact.
//
// Touch: a press acts when it ends, because a drag and a swipe also start with a press. Once a
// finger slides past DRAG_PX it drags, and the block follows it a column for every cell it moves.
// A press that lifts without dragging drops the block; a swipe up compacts and a swipe down
// drops. The host also reports a tap as `primary`; that echo of a press is not a compact.

import { createPress, isTapEcho, pointerPressed, resetPress } from '../../shell/press.js';
import { COLS, DRAG_PX } from './tuning.js';

/** @typedef {import('../../contracts').InputState} InputState */
/** @typedef {import('./world.js').Intent} Intent */
/** @typedef {import('./world.js').World} World */
/**
 * `pressed` is true while a press made in the run is down, `pressX` is where the finger held the
 * block from, and `dragged` whether it slid. `baseX` is the block's column then, for the block
 * numbered `baseId`. `stale` is true while the press that started or resumed the run is still
 * down, and `held` is the arrow held last step.
 * @typedef {import('../../shell/press.js').PressTracker & { pressed: boolean, pressX: number,
 *   dragged: boolean, baseX: number, baseId: number, stale: boolean, held: number }} Tracker
 */

/** @returns {Tracker} */
export const createTracker = () => ({
  ...createPress(),
  pressed: false,
  pressX: 0,
  dragged: false,
  baseX: 0,
  baseId: -1,
  stale: false,
  held: 0,
});

/** @returns {Intent} */
export const createIntent = () => ({
  dir: 0,
  fresh: false,
  target: null,
  drop: false,
  compact: false,
});

/** @param {InputState} input */
const arrows = (input) => Number(input.isDown('right')) - Number(input.isDown('left'));

/**
 * Forget pointer history, treating a pointer or compact key that is already down as used.
 * Called at start and resume so the press that started or resumed the game does not act.
 * @param {Tracker} tracker
 * @param {InputState} input
 */
export function resetTracker(tracker, input) {
  resetPress(tracker, input);
  tracker.pressed = false;
  tracker.dragged = false;
  tracker.stale = tracker.pointerDown || input.isDown('primary');
  tracker.held = arrows(input);
}

/**
 * Hold the falling block from where the finger is now.
 * @param {Tracker} tracker @param {World} w @param {number} x
 */
function grab(tracker, w, x) {
  tracker.pressX = x;
  tracker.baseX = w.fall.x;
  tracker.baseId = w.spawned;
}

/**
 * The column a dragging finger wants the block at, or null when no finger drags it.
 * @param {InputState} input @param {Tracker} tracker @param {World} w
 */
function dragTarget(input, tracker, w) {
  const { pointer } = input;
  if (!tracker.pressed || !pointer?.down || !w.fall.active) return null;
  if (tracker.baseId !== w.spawned) grab(tracker, w, pointer.x);
  if (Math.abs(pointer.x - tracker.pressX) > DRAG_PX) tracker.dragged = true;
  if (!tracker.dragged) return null;
  const x = tracker.baseX + Math.round((pointer.x - tracker.pressX) / w.cell);
  return Math.min(COLS - w.fall.w, Math.max(0, x));
}

/**
 * @param {InputState} input
 * @param {Tracker} tracker mutated
 * @param {World} w read only: the block, the cell size, and the run clock
 * @param {Intent} intent mutated and returned, so a step allocates nothing
 * @returns {Intent}
 */
export function readIntent(input, tracker, w, intent) {
  const released = tracker.pointerDown && !input.pointer?.down;
  const edge = pointerPressed(tracker, input, w.time);
  if (edge && input.pointer) {
    tracker.pressed = true;
    tracker.dragged = false;
    grab(tracker, w, input.pointer.x);
  }
  const stale = tracker.stale;
  if (stale && !tracker.pointerDown && !input.isDown('primary')) tracker.stale = false;
  const ended = released && tracker.pressed;
  if (ended) tracker.pressed = false;
  const tapped = ended && !tracker.dragged && input.swipe === null;
  const dir = arrows(input);
  intent.fresh = dir !== 0 && dir !== tracker.held;
  tracker.held = dir;
  intent.dir = dir;
  intent.target = dragTarget(input, tracker, w);
  intent.drop = input.justPressed('down') || tapped || (ended && input.swipe === 'down');
  const key = !stale && input.justPressed('primary') && !isTapEcho(tracker, w.time);
  intent.compact = key || (ended && input.swipe === 'up');
  return intent;
}
