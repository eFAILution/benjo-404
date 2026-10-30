// @ts-check
// Benjo Pinball's How to play card (#28): the goal, the controls, and what each thing on the table does.

import { BALLS, QUARTERS_REPAIRS } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: `Keep the USS Never Sleeps flying. Hit the lit shots to bring each ship system back online. You have ${BALLS} balls.`,
  keys: [
    ['Left/Right or A/D', 'Left and right flippers'],
    ['Hold Space or Down', 'Pull the plunger, let go to launch'],
    ['Up or W', 'Nudge the table. Too much tilts'],
  ],
  touch: [
    ['Hold left or right half', 'Left and right flippers'],
    ['Hold, then let go', 'Pull and launch the plunger'],
    ['Swipe up', 'Nudge the table. Too much tilts'],
  ],
  things: [
    {
      swatch: 'accent',
      name: 'Lit arrows',
      tip: 'The shot that repairs the offline system. Repairs score more each time',
    },
    {
      swatch: 'hazard',
      name: 'Bug bumpers',
      tip: 'Kick the ball away. Squash the bugs that crawl out for points',
    },
    {
      swatch: 'pickup',
      name: 'S-H-I-P lanes',
      tip: 'Light all four for a bigger end of ball bonus. Flippers move them',
    },
    {
      swatch: 'glow',
      name: 'Center ramp',
      tip: 'Climbs to the bridge deck, with its own flippers and spinner',
    },
    {
      swatch: 'muted',
      name: 'Hangar',
      tip: 'Lock two balls here to start Twin Mode, a three ball multiball',
    },
    {
      swatch: 'ink',
      name: 'Easter Eggs',
      tip: `Top of the bridge. Opens Benjo's Quarters after ${QUARTERS_REPAIRS} repairs`,
    },
  ],
  powers: {
    twin: 'Saves your last ball when it drains',
    gc: 'Squashes every bug on the table',
  },
};
