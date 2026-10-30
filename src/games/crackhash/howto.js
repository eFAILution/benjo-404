// @ts-check
// Crack the Hash's How to play card (#28, #104): the goal, the controls, and what each thing on
// the ring does.

import { BUG_LOCK, PINS_START } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: `Benjo runs around the lock. Tap when he is on the target to pop it. Pop ${PINS_START} to open the first lock. A miss ends the run.`,
  keys: [['Space, Up or W', 'Tap when Benjo is on the target']],
  touch: [['Tap', 'Tap when Benjo is on the target']],
  things: [
    {
      sprite: { set: 'pickups', index: 0 },
      name: 'Target',
      tip: 'Tap while Benjo is on its glowing band. He turns round each pop',
    },
    {
      sprite: { set: 'hazards', index: 0 },
      name: 'Bug',
      tip: `From lock ${BUG_LOCK} on. Run over it, but never tap while Benjo is on it`,
    },
    {
      swatch: 'ink',
      name: 'Pins left',
      tip: 'The big number. Each lock needs more pops and runs faster',
    },
  ],
  powers: {
    twin: 'Forgives one miss. A run past the target turns Benjo round',
    gc: 'Clears the bug off the ring',
    magnet: 'Widens the glowing band, so the target is easier to hit',
  },
};
