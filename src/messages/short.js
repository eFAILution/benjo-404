// @ts-check
// A second message that proves the copy is swappable by config or ?message=short.
/** @typedef {import('../contracts').MessageModule} MessageModule */

/** @type {MessageModule} */
const message = {
  id: 'short',
  kicker: 'Lost Link',
  code: '404',
  body: 'Benjo looked everywhere. This page is not here.',
  cta: { label: 'Return Home', href: '/' },
  playPrompt: 'Press Space or tap to play',
};

export default message;
