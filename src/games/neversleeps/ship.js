// @ts-check
// The USS Never Sleeps from behind, as Benjo flies it down the trench (#88).
//
// A stand-in drawn from simple shapes: swept wings, a hull, two engines, and an open cockpit
// where draw.js puts Benjo. Swap these paths for the real ship's once its model or reference art
// is available; the game only needs the viewBox and the cockpit spot below.

/** @type {import('../../contracts').Sprite} */
export const SHIP = {
  viewBox: [0, 0, 190, 100],
  paths: [
    // Wings, swept down to the tips
    { d: 'M6 74L78 46H112L184 74V82L112 66H78L6 82Z', fill: 'muted' },
    // Wing tip lights
    { d: 'M2 72H14V84H2ZM176 72H188V84H176Z', fill: 'accent' },
    // Hull
    { d: 'M68 34Q95 8 122 34L130 74Q95 94 60 74Z', fill: 'ink' },
    // Hull stripe
    { d: 'M78 60H112V68H78Z', fill: 'accent' },
    // Engines
    {
      d: 'M40 80A12 12 0 1 0 64 80A12 12 0 1 0 40 80ZM126 80A12 12 0 1 0 150 80A12 12 0 1 0 126 80Z',
      fill: 'glow',
    },
    // Cockpit
    { d: 'M78 38Q95 20 112 38V48H78Z', fill: 'bg' },
  ],
};

/** Where Benjo sits, as a share of the ship's height above its center, and his size. */
export const COCKPIT_Y = 0.22;
export const PILOT_H = 0.42;
