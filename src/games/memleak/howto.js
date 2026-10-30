// @ts-check
// Memory Leak's How to play card (#28, #106): the goal, the controls, and what each thing in
// the heap does.

import { FREE_SCORE, ROW_BONUS } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: 'Blocks of memory fall into the heap and free themselves when their time runs out. A block that lands above the top overflows it.',
  keys: [
    ['Left/Right or A/D', 'Move the falling block'],
    ['Down or S', 'Drop it'],
    ['Space or Up', 'Compact the heap when the meter is full'],
  ],
  touch: [
    ['Drag', 'Move the falling block'],
    ['Tap', 'Drop it'],
    ['Swipe up', 'Compact the heap when the meter is full'],
  ],
  things: [
    {
      swatch: 'hazard',
      name: 'Block',
      tip: `Frees when its bar runs out: +${FREE_SCORE[1]}, +${FREE_SCORE[2]}, +${FREE_SCORE[3]} or +${FREE_SCORE[4]} by size`,
    },
    {
      swatch: 'muted',
      name: 'Hole',
      tip: 'A freed block leaves one. Blocks above it stay put',
    },
    {
      swatch: 'glow',
      name: 'Compact meter',
      tip: 'Freed blocks fill it. Compact drops every block as far as it goes',
    },
    {
      swatch: 'accent',
      name: 'Full row',
      tip: `Flushes out for +${ROW_BONUS} and the points of every block in it`,
    },
  ],
  powers: {
    twin: 'Takes one overflow and clears the top rows of the heap',
    gc: 'Frees every block in the heap now, for its points',
  },
};
