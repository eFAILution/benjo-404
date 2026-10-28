// @ts-check
// Small notices near the top of the page (#22). The stack ignores the pointer, so it never
// blocks a tap, and a polite live region reads each one out once.

import { el } from './dom.js';

const SHOW_MS = 2600;
const MAX_SHOWN = 3;

/**
 * @param {HTMLElement} parent
 * @param {{ setTimeout: (fn: () => void, ms: number) => unknown }} [timers]
 */
export function createToasts(parent, timers = globalThis) {
  const stack = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  parent.append(stack);

  /** @param {string} message */
  function show(message) {
    const node = el('p', { class: 'toast' }, [message]);
    stack.append(node);
    while (stack.childElementCount > MAX_SHOWN) stack.firstElementChild?.remove();
    timers.setTimeout(() => node.remove(), SHOW_MS);
  }

  return {
    show,
    /** @param {string[]} messages */
    showAll: (messages) => messages.forEach(show),
  };
}
