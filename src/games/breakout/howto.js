// @ts-check
// Break the 404's How to play card (#28): the goal, the controls, and what each thing on the board does.

import { BRICK_SCORE, LIVES, WALL_BONUS } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: `Bounce Benjo's fireball off the paddle to break the bricks that spell 404. You have ${LIVES} balls. Clear the wall for a bonus and a faster round.`,
  keys: [
    ['Left/Right or A/D', 'Move the paddle'],
    ['Space or Up', 'Serve the fireball'],
  ],
  touch: [
    ['Drag', 'Move the paddle'],
    ['Tap', 'Serve the fireball'],
  ],
  things: [
    {
      swatch: 'hazard',
      name: 'Brick',
      tip: `+${BRICK_SCORE} points, times the round. Clear them all for +${WALL_BONUS}, times the round`,
    },
    {
      swatch: 'glow',
      name: 'Fireball',
      tip: "Hit it with the paddle's edge to send it off at an angle",
    },
    {
      swatch: 'accent',
      name: 'Paddle',
      tip: "Don't let the fireball fall past it. It narrows each round",
    },
  ],
};
