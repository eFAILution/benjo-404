// @ts-check
// Dragon Tail's How to play card (#28): the goal, the controls, and what each thing on the board does.

import { MAGNET_STEPS } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: 'Steer Benjo round the board to eat pages. Each page makes his tail longer and him faster. Hitting a wall or his own tail ends the run.',
  keys: [['Arrows or WASD', 'Turn']],
  touch: [
    ['Swipe', 'Turn that way'],
    ['Tap', 'Turn toward the side you tapped'],
  ],
  things: [
    {
      sprite: { set: 'pickups', index: 0 },
      name: 'Page',
      tip: 'Eat it: +1 point, and the tail grows by one',
    },
    {
      swatch: 'accent',
      name: 'Tail',
      tip: "Don't run into it. You can't turn straight back",
    },
    {
      swatch: 'ink',
      name: 'Wall',
      tip: "The board's edge. Hitting it ends the run",
    },
  ],
  powers: {
    twin: 'Takes one crash. More crashes only turn Benjo aside for a moment',
    magnet: `The page slides up to ${MAGNET_STEPS} cells toward Benjo's path each move`,
  },
};
