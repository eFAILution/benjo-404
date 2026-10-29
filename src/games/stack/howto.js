// @ts-check
// Stack the Server's How to play card (#28): the goal, the controls, and what each thing on the board does.

import { PERFECT_STREAK } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: 'A server block slides above the stack. Drop it onto the block below: any overhang is cut off. Miss the stack and the run ends.',
  keys: [['Space, Enter, Up or W', 'Drop the block']],
  touch: [['Tap', 'Drop the block']],
  things: [
    {
      swatch: 'accent',
      name: 'Sliding block',
      tip: 'Line it up with the block below. +1 for each block stacked',
    },
    {
      swatch: 'glow',
      name: 'Perfect drop',
      tip: `Land it almost exactly. ${PERFECT_STREAK} in a row make the block wider`,
    },
    {
      swatch: 'hazard',
      name: 'Overhang',
      tip: 'Cut off and lost, so the next block is narrower',
    },
  ],
};
