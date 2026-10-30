// @ts-check
// Benjo Run's How to play card (#28): the goal, the controls, and what each thing on the board does.

import { FLYERS_AFTER, PICKUP_SCORE } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: 'Benjo runs on his own and keeps speeding up. Jump and duck past the broken links for as long as you can. One hit ends the run.',
  keys: [
    ['Space, Up or W', 'Jump. Hold it for a higher jump'],
    ['Down, S or Shift', 'Duck'],
  ],
  touch: [
    ['Tap', 'Jump. Hold for a higher jump'],
    ['Swipe down', 'Duck'],
  ],
  things: [
    {
      sprite: { set: 'hazards', index: 0 },
      name: 'Broken link',
      tip: 'Jump over it',
    },
    {
      sprite: { set: 'hazards', index: 1 },
      name: 'Tall broken link',
      tip: 'Jump early. These show up after a few seconds',
    },
    {
      sprite: { set: 'hazards', index: 2 },
      name: 'Flying link',
      tip: `Duck under it. These show up after ${FLYERS_AFTER} seconds`,
    },
    {
      sprite: { set: 'pickups', index: 0 },
      name: 'Orb',
      tip: `+${PICKUP_SCORE} points. Your score is the distance run plus orbs`,
    },
  ],
};
