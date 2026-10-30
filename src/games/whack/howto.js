// @ts-check
// Whack-a-Bug's How to play card (#28): the goal, the controls, and what each thing on the board does.

import { BUG_SCORE, COMBO_MAX, DECOY_COST, ROUND_T } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: `Bugs and features pop out of five holes for ${ROUND_T} seconds. Whack the bugs and leave the features alone.`,
  keys: [
    ['Space or Enter', 'Whack the center hole'],
    ['Arrows or WASD', 'Whack the top, right, bottom, or left hole'],
  ],
  touch: [['Tap a hole', 'Whack it']],
  things: [
    {
      sprite: { set: 'hazards', index: 0 },
      name: 'Bug',
      tip: `+${BUG_SCORE}, plus up to +${COMBO_MAX} for a combo. Letting one sink resets the combo`,
    },
    {
      sprite: { set: 'pickups', index: 0 },
      name: 'Feature',
      tip: `Leave it alone! Whacking it costs ${DECOY_COST} points and resets the combo`,
    },
    {
      swatch: 'muted',
      name: 'Empty hole',
      tip: 'Whacking an empty hole resets the combo',
    },
  ],
};
