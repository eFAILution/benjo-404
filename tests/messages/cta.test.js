import assert from 'node:assert/strict';
import { test } from 'node:test';

import defaultMessage from '../../src/messages/default.js';
import shortMessage from '../../src/messages/short.js';

const HOME = 'https://beast-code.com/';

// The page is also served from GitHub Pages, where `/` is the Pages root, not the company site (#98).
test('Return Home goes to the Beast Code home page in every bundled message', () => {
  for (const message of [defaultMessage, shortMessage]) {
    assert.equal(message.cta.label, 'Return Home', message.id);
    assert.equal(message.cta.href, HOME, message.id);
  }
});
