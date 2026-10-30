// @ts-check
// Tower of Benjo's How to play card (#28, #100): the goal, the controls, and what each thing on a
// floor does.

import { FLOOR_SCORE, KNIGHT_SCORE, LIVES, MAGE_SCORE, SLIME_SCORE } from './tuning.js';

/** @type {import('../../contracts').HowTo} */
export const HOW_TO = {
  goal: `Each floor of the tower is a maze. Find the key, then reach the door before the clock runs out. You have ${LIVES} lives.`,
  keys: [
    ['Arrows or WASD', 'Hold to walk, let go to stop'],
    ['Stop', 'Raise the shield against spells'],
  ],
  touch: [
    ['Hold', 'Benjo walks toward your finger'],
    ['Lift', 'Stop and raise the shield'],
  ],
  things: [
    {
      sprite: { set: 'hazards', index: 0 },
      name: 'Slime',
      tip: `Wanders. Meet it with the sword Benjo faces with: +${SLIME_SCORE}`,
    },
    {
      sprite: { set: 'hazards', index: 1 },
      name: 'Knight',
      tip: `Chases Benjo and takes two hits: +${KNIGHT_SCORE}. Never let it reach his side`,
    },
    {
      sprite: { set: 'hazards', index: 2 },
      name: 'Mage',
      tip: `Appears in line with Benjo and casts a bolt. Stand still to block: +${MAGE_SCORE}`,
    },
    {
      swatch: 'glow',
      name: 'Key and door',
      tip: `Take the key to open the door: +${FLOOR_SCORE} and a point per second left`,
    },
  ],
  powers: {
    twin: 'Takes one hit. Enemies and spells pass through Benjo while he blinks',
    gc: 'Every enemy and spell on the floor goes, enemies scoring as slain',
  },
};
