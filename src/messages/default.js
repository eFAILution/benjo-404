// @ts-check
// The live beast-code.com 404 copy.
/** @typedef {import('../contracts').MessageModule} MessageModule */

/** @type {MessageModule} */
const message = {
  id: 'default',
  title: 'Page Not Found | Beast Code',
  kicker: 'Page Not Found',
  code: '404',
  body: "We're sorry, but the page you're looking for doesn't exist. It might have been moved, deleted, or perhaps it never existed at all.",
  cta: { label: 'Return Home', href: '/' },
  playPrompt: 'Press Space or tap to play',
};

export default message;
