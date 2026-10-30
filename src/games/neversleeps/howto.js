// @ts-check
// Never Sleeps Run's How to play card (#28, #88): the goal, the controls, and what each thing in
// the trench does.

import { ORB_SCORE, PORT_EVERY, PORT_SCORE } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: 'Benjo flies the USS Never Sleeps down the trench. Steer through the open part of every gate. One hit ends the run.',
  keys: [['Arrows or WASD', 'Steer up, down, left and right']],
  touch: [['Drag', 'Steer. The ship moves as far as your finger']],
  things: [
    {
      sprite: { set: 'hazards', index: 0 },
      name: 'Blocked panel',
      tip: 'Gates block part of the trench. Fly through a gap. +1 per gate',
    },
    {
      sprite: { set: 'pickups', index: 0 },
      name: 'Orb',
      tip: `+${ORB_SCORE} points. It rides in a gap: fly through it`,
    },
    {
      swatch: 'glow',
      name: 'Port',
      tip: `Every ${PORT_EVERY}th gate is open. Fly through its lit ring for +${PORT_SCORE}`,
    },
  ],
  powers: {
    twin: 'Takes one hit. Gates pass through the ship while it blinks',
    gc: 'Every gate ahead loses its blocked panels',
    magnet: 'Orbs near the ship slide over to it',
  },
};
