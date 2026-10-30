// @ts-check
// Which controls the visitor plays with (#64), so the How to play card and the run's first hint
// show only those. Before any input it guesses from the primary pointer: coarse means a finger.
// After that it follows the last input: a touch or pen means touch, a mouse or a key means keys.

/**
 * @param {Pick<Window, 'matchMedia' | 'addEventListener'>} win
 * @param {AbortSignal} signal
 */
export function watchDevice(win, signal) {
  let touch = win.matchMedia('(pointer: coarse)').matches;
  const options = { signal, capture: true, passive: true };
  win.addEventListener(
    'pointerdown',
    (event) => {
      touch = event.pointerType !== 'mouse';
    },
    options,
  );
  win.addEventListener(
    'keydown',
    () => {
      touch = false;
    },
    options,
  );
  return {
    get touch() {
      return touch;
    },
  };
}
