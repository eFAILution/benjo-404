// @ts-check
// Bug Zapper's How to play card (#28): the goal, the controls, and what each thing on the board does.

import { BUG_SCORE, LIVES, WAVE_BONUS } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: `Bugs march down toward the server room. Breathe fire to zap every one before they get there. Their bites cost a life, and you have ${LIVES}.`,
  keys: [
    ['Left/Right or A/D', 'Move'],
    ['Space, Up or W', 'Breathe fire. Hold to keep firing'],
  ],
  touch: [
    ['Drag', 'Move'],
    ['Tap or hold', 'Breathe fire'],
  ],
  things: [
    {
      sprite: { set: 'hazards', index: 0 },
      name: 'Bug',
      tip: `+${BUG_SCORE} points, times the wave. Clear a wave for a +${WAVE_BONUS} bonus, times the wave`,
    },
    {
      swatch: 'hazard',
      name: 'Bite',
      tip: 'Bugs spit these down at you. Dodge them: each hit costs a life',
    },
    {
      swatch: 'muted',
      name: 'Server room',
      tip: 'The bottom of the screen. A bug that reaches it ends the run',
    },
  ],
};
