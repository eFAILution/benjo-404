// @ts-check
// Cache Muncher's How to play card (#28): the goal, the controls, and what each thing on the board does.

import { BYTE_SCORE, LIVES, MISS_SCORE, MISS_SCORE_MAX, PELLET_SCORE } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: `Steer Benjo round the maze and munch every cached byte while the cache misses chase him. You have ${LIVES} lives. A clear maze is a faster level.`,
  keys: [['Arrows or WASD', 'Turn. Press early to turn at the next gap']],
  touch: [
    ['Swipe', 'Turn that way'],
    ['Tap', 'Turn toward the spot you tapped'],
  ],
  things: [
    {
      swatch: 'ink',
      name: 'Cached byte',
      tip: `+${BYTE_SCORE} points. Munch them all to clear the level`,
    },
    {
      sprite: { set: 'hazards', index: 0 },
      name: 'Cache miss',
      tip: 'Four of them chase Benjo, each its own way. A touch costs a life',
    },
    {
      sprite: { set: 'pickups', index: 0 },
      name: 'Clear cache',
      tip: `+${PELLET_SCORE}. For a few seconds the cache misses turn gray and run`,
    },
    {
      swatch: 'muted',
      name: 'Gray cache miss',
      tip: `Munch it: ${MISS_SCORE}, then double, up to ${MISS_SCORE_MAX}. It flashes before it turns back`,
    },
  ],
};
