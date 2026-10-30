// @ts-check
// Fix the Link's How to play card (#28): the goal, the controls, and what each thing on the board does.

import { CLOCK_CAP, GC_FIX, SOLVE_BONUS_T, TWIN_CLOCK } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: 'Turn tiles until the link runs from Benjo on the left to the home page on the right. Fixed links add time. The run ends when time runs out.',
  keys: [
    ['Arrows or WASD', 'Move the cursor'],
    ['Space or Enter', 'Turn the tile'],
  ],
  touch: [['Tap a tile', 'Turn it']],
  things: [
    {
      sprite: { set: 'benjo' },
      name: 'Benjo',
      tip: 'The link starts at his flame, on the left',
    },
    {
      sprite: { set: 'pickups', index: 0 },
      name: 'Home page',
      tip: `Link up to it: points, plus ${SOLVE_BONUS_T} seconds, up to ${CLOCK_CAP} on the clock`,
    },
    {
      swatch: 'muted',
      name: 'Dead end',
      tip: "Some tile arms lead nowhere. You don't need every arm",
    },
  ],
  powers: {
    twin: `When time runs out, puts ${TWIN_CLOCK} seconds back on the clock`,
    rollback: 'Waits for time to run out, then rewinds 3 seconds',
    gc: `Turns up to ${GC_FIX} wrong tiles the right way, nearest Benjo first`,
  },
};
