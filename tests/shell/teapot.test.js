import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { watchTeapot } from '../../src/shell/teapot.js';

/** A stand-in for the big 404 that records its click listener. */
function fakeCode() {
  const code = { textContent: '404', listener: null };
  code.addEventListener = (type, listener) => {
    if (type === 'click') code.listener = listener;
  };
  code.tap = (timeStamp) => code.listener({ timeStamp });
  return code;
}

describe('watchTeapot', () => {
  it('turns the 404 into 418 on the fourth tap inside two seconds', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const code = fakeCode();
    let found = 0;
    watchTeapot(code, () => (found += 1), new AbortController().signal);
    for (const at of [0, 500, 1000]) code.tap(at);
    assert.equal(found, 0);
    code.tap(1500);
    assert.equal(found, 1);
    assert.equal(code.textContent, '418');
    t.mock.timers.tick(1200);
    assert.equal(code.textContent, '404');
  });

  it('ignores slow taps', () => {
    const code = fakeCode();
    let found = 0;
    watchTeapot(code, () => (found += 1), new AbortController().signal);
    for (const at of [0, 900, 1800, 2700, 3600]) code.tap(at);
    assert.equal(found, 0);
  });
});
