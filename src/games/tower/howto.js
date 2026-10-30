// @ts-check
// Uptime Tower's How to play card (#28, #95): the goal, the controls, and what each thing in the
// tower does.

import { COMBO_MIN, FLOOR_SCORE, ORB_SCORE } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: 'Jump Benjo up the tower as the view climbs faster and faster. Fall off the bottom, or touch a bug, and the run ends.',
  keys: [
    ['Left/Right or A/D', 'Run. Faster runs jump higher'],
    ['Space, Up or W', 'Jump'],
  ],
  touch: [['Press and hold', 'Jump, then run toward your finger']],
  things: [
    {
      swatch: 'accent',
      name: 'Floor',
      tip: `+${FLOOR_SCORE} per new floor. Jump up through floors, land on top`,
    },
    {
      swatch: 'glow',
      name: 'Combo',
      tip: `Chain jumps of ${COMBO_MIN}+ floors for the combo's floors squared`,
    },
    {
      sprite: { set: 'hazards', index: 0 },
      name: 'Bug',
      tip: 'Crawls along floors higher up. Touching one ends the run',
    },
    {
      sprite: { set: 'pickups', index: 0 },
      name: 'Orb',
      tip: `+${ORB_SCORE} points`,
    },
  ],
  powers: {
    twin: 'Takes one bug, or throws Benjo back up when he falls',
    gc: 'Every bug in the tower goes',
    magnet: 'Orbs on nearby floors slide over to Benjo',
  },
};
