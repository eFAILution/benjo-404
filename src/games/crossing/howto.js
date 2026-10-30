// @ts-check
// Code Crossing's How to play card (#28): the goal, the controls, and what each thing on the board does.

import { CROSS_T, GOAL_SCORE, LIVES, ORB_SCORE, ROW_SCORE } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: `Hop Benjo across seven lanes of moving code to the far curb before the timer runs out. You have ${LIVES} lives, and each crossing gets faster.`,
  keys: [
    ['Arrows or WASD', 'Hop one cell that way'],
    ['Space or Enter', 'Hop forward'],
  ],
  touch: [
    ['Swipe', 'Hop that way'],
    ['Tap', 'Hop toward the spot you tapped'],
  ],
  things: [
    {
      swatch: 'hazard',
      name: 'Code block',
      tip: 'Getting hit costs a life. Brushing its very edge is a near miss',
    },
    {
      sprite: { set: 'pickups', index: 1 },
      name: 'Orb',
      tip: `+${ORB_SCORE} points. Hop onto one as it rides past; each lane has its own look`,
    },
    {
      swatch: 'ink',
      name: 'Far curb',
      tip: `+${ROW_SCORE} for each new lane and +${GOAL_SCORE} for reaching it`,
    },
    {
      swatch: 'accent',
      name: 'Timer bar',
      tip: `${CROSS_T} seconds per crossing. It changes color, then costs a life at zero`,
    },
  ],
  powers: {
    twin: 'Takes one hit, so no life is lost. Blocks pass through while he blinks',
    gc: 'Clears every code block from the lanes',
    magnet: "Orbs on Benjo's lane and the lanes beside it slide to him",
  },
};
