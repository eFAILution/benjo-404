// @ts-check
// The USS Never Sleeps from above, nose to the right, as Benjo flies it through the belt (#94).
//
// A stand-in drawn from simple shapes in the colors of the rear view in Never Sleeps Run (#88):
// swept wings, a hull with an accent stripe, two engines, and an open cockpit where draw.js puts
// Benjo. Swap these paths for the real ship's once its reference art is available (A-88.1).

/** @type {import('../../contracts').Sprite} */
export const SHIP = {
  viewBox: [0, 0, 100, 84],
  paths: [
    // Wings, swept back to the tips
    { d: 'M30 42L8 4H22L62 34V50L22 80H8Z', fill: 'muted' },
    // Wing tip lights
    { d: 'M6 0H20V8H6ZM6 76H20V84H6Z', fill: 'accent' },
    // Hull
    { d: 'M14 30H62Q98 34 100 42Q98 50 62 54H14Z', fill: 'ink' },
    // Hull stripe
    { d: 'M24 38H44V46H24Z', fill: 'accent' },
    // Engines
    { d: 'M4 30H14V40H4ZM4 44H14V54H4Z', fill: 'glow' },
    // Cockpit
    { d: 'M54 34Q84 36 86 42Q84 48 54 50Z', fill: 'bg' },
  ],
};

/** Where Benjo sits, as a share of the ship's height ahead of its center, and his size. */
export const COCKPIT_X = 0.3;
export const PILOT_H = 0.34;
/** The engines, as a share of the ship's height behind its center, for the thrust flame. */
export const ENGINE_X = 0.55;
