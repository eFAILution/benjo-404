// @ts-check
// Bug Belt's How to play card (#28, #94): the goal, the controls, and what each thing in the
// belt does.

import { BUG_SCORE, LIVES, ORB_SCORE, WAVE_BONUS } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: `Benjo flies the USS Never Sleeps through a belt of bugs. Shoot them all to clear the wave. A bump costs a life, and you have ${LIVES}.`,
  keys: [
    ['Left/Right or A/D', 'Turn'],
    ['Up or W', 'Thrust'],
    ['Space', 'Fire. Hold to keep firing'],
  ],
  touch: [
    ['Hold', 'Fly toward your finger and fire'],
    ['Hold near the ship', 'Aim and fire without moving'],
  ],
  things: [
    {
      sprite: { set: 'hazards', index: 0 },
      name: 'Bug',
      tip: `Splits in two when shot, twice. +${BUG_SCORE[0]}, +${BUG_SCORE[1]}, then +${BUG_SCORE[2]}`,
    },
    {
      sprite: { set: 'pickups', index: 0 },
      name: 'Orb',
      tip: `Some small bugs leave one. Fly into it for +${ORB_SCORE}`,
    },
    {
      swatch: 'glow',
      name: 'Edges',
      tip: `Everything wraps around. Clear a wave for +${WAVE_BONUS}`,
    },
  ],
  powers: {
    twin: 'Takes one bump. Bugs pass through the ship while it blinks',
    gc: 'Every bug on screen pops for its points',
    magnet: 'Orbs near the ship slide over to it',
  },
};
