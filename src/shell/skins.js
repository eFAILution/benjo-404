// @ts-check
// Benjo's unlockable looks (#22), one per major release. Each is drawn on top of Benjo in the
// logo's own viewBox, so it follows every move, flip, and tilt a game gives him.
/** @typedef {import('../contracts').Sprite} Sprite */
/** @typedef {Sprite & { name: string }} Skin */

const VIEW_BOX = /** @type {[number, number, number, number]} */ ([91, 91, 620, 620]);
const GOLD = '#ffcc33';
const HAT = '#f2b705';
const LENS = '#111';

/** @type {Skin[]} index + 1 is the look number and the major release that unlocks it */
export const SKINS = [
  {
    name: 'Hard Hat',
    viewBox: VIEW_BOX,
    paths: [
      { d: 'M356 336C388 253 546 313 513 397Z', fill: HAT },
      { d: 'M449 288L474 298 446 371 421 361Z', fill: '#c98f00' },
      { d: 'M327 341L551 427 558 411 333 324Z', fill: HAT },
    ],
  },
  {
    name: 'Dark Mode',
    viewBox: VIEW_BOX,
    paths: [
      { d: 'M346 368L404 382 404 398 344 382Z', fill: LENS },
      { d: 'M394 374L510 404 500 446Q448 458 402 424Z', fill: LENS },
      { d: 'M424 398L484 414', stroke: '#fff', strokeWidth: 7 },
    ],
  },
  {
    name: 'Support',
    viewBox: VIEW_BOX,
    paths: [
      { d: 'M372 408C340 304 456 288 492 380', stroke: 'accent', strokeWidth: 18 },
      { d: 'M384 426Q392 474 448 470', stroke: 'accent', strokeWidth: 10 },
      { d: 'M346 412a34 34 0 1 0 68 0a34 34 0 1 0-68 0', fill: 'accent' },
      { d: 'M439 469a13 13 0 1 0 26 0a13 13 0 1 0-26 0', fill: 'bg' },
    ],
  },
  {
    name: 'Root Access',
    viewBox: VIEW_BOX,
    paths: [
      { d: 'M362 354L376 285 403 336 463 294 476 364 530 344 495 405Z', fill: GOLD },
      { d: 'M427 356a12 12 0 1 0 24 0a12 12 0 1 0-24 0', fill: 'accent' },
    ],
  },
];

/**
 * The look to draw over this sprite, if any. Only Benjo himself wears one, and only when the
 * sprite uses the logo's viewBox, so a theme with its own drawing is left alone.
 * @param {Sprite} sprite
 * @param {Sprite} benjo the theme's Benjo
 * @param {number} look 0 for none
 * @returns {Skin | null}
 */
export function skinFor(sprite, benjo, look) {
  const skin = SKINS[look - 1];
  if (!skin || sprite !== benjo) return null;
  return sprite.viewBox.every((value, index) => value === VIEW_BOX[index]) ? skin : null;
}
