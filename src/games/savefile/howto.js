// @ts-check
// Save the File's How to play card (#28, #92): the goal, the controls, and what each thing in the
// level does.

import { JUMP_SCORE, LIVES, ORB_SCORE } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: `Climb the girders to save the code file at the top while bugs roll down at you. You have ${LIVES} lives. Each save starts a faster level.`,
  keys: [
    ['Left/Right or A/D', 'Walk'],
    ['Up/Down or W/S', 'Climb a ladder'],
    ['Space', 'Jump'],
  ],
  touch: [
    ['Hold and drag', 'Walk toward your finger'],
    ['Swipe up or down', 'Climb the ladder Benjo is at'],
    ['Tap', 'Jump'],
  ],
  things: [
    {
      sprite: { set: 'hazards', index: 1 },
      name: 'Bug',
      tip: `Rolls down the girders, sometimes down a ladder. Jump it for +${JUMP_SCORE}`,
    },
    {
      sprite: { set: 'pickups', index: 0 },
      name: 'Orb',
      tip: `+${ORB_SCORE} points. One sits on each girder`,
    },
    {
      swatch: 'ink',
      name: 'Code file',
      tip: 'Reach it to save it. Time left on the clock is bonus points',
    },
  ],
  powers: {
    twin: 'Takes one bug. Bugs pass through Benjo while he blinks',
    gc: 'Every bug in the level goes in the bin',
    magnet: 'Orbs on your girder slide over to Benjo',
  },
};
