// @ts-check
// Benjo Flight's How to play card (#28): the goal, the controls, and what each thing on the board does.

import { PICKUP_SCORE } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: 'Flap to keep Benjo in the air and fly through the gaps in the 404 towers. Hitting a tower or the ground ends the run.',
  keys: [['Space, Up or W', 'Flap']],
  touch: [['Tap', 'Flap']],
  things: [
    {
      sprite: { set: 'hazards', index: 0 },
      name: '404 tower',
      tip: 'Fly through the gap. +1 for each tower you pass',
    },
    {
      sprite: { set: 'pickups', index: 0 },
      name: 'Orb',
      tip: `+${PICKUP_SCORE} points. It floats between two gaps`,
    },
    {
      swatch: 'muted',
      name: 'Ground',
      tip: "Don't touch down. Flap before Benjo falls too low",
    },
  ],
};
