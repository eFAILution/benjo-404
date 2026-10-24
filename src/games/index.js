// @ts-check
// Game registry. Each game is a named export so the build can import only configured ids.
/** @typedef {import('../contracts').GameModule} GameModule */

import runner from './runner/index.js';

export { default as runner } from './runner/index.js';

/** @type {Record<string, GameModule>} */
export const games = { runner };
