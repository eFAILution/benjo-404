// @ts-check
// The secret 418 (#22): tap the big 404 four times inside two seconds and it turns into a teapot.

import { text } from './dom.js';

const TEAPOT_TAPS = 4;
const TEAPOT_MS = 2000;
const TEAPOT_SHOW_MS = 1200;

/**
 * The secret 418: tap the big 404 four times inside two seconds.
 * @param {HTMLElement} code
 * @param {() => void} onFound
 * @param {AbortSignal} signal
 */
export function watchTeapot(code, onFound, signal) {
  const label = code.textContent ?? '';
  /** @type {number[]} */
  let taps = [];
  const onTap = (/** @type {Event} */ event) => {
    const time = event.timeStamp;
    taps = [...taps.filter((at) => time - at < TEAPOT_MS), time];
    if (taps.length < TEAPOT_TAPS) return;
    taps = [];
    text(code, '418');
    setTimeout(() => text(code, label), TEAPOT_SHOW_MS);
    onFound();
  };
  code.addEventListener('click', onTap, { signal });
}
