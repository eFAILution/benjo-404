// @ts-check
// The ?debug=1 fps meter. It only asks for frames while main.js says a run is playing.

const REPORT_MS = 1000;

/**
 * @param {{ frames: { request(cb: (t: number) => void): number, cancel(id: number): void },
 *   emit: (line: string) => void, describe: () => string }} options
 */
export function createDebugMeter({ frames, emit, describe }) {
  /** @type {number | null} */
  let frameId = null;
  /** @type {number | null} */
  let since = null;
  let count = 0;

  /** @param {number} now */
  function tick(now) {
    frameId = frames.request(tick);
    if (since === null) {
      since = now;
      return;
    }
    count += 1;
    if (now - since < REPORT_MS) return;
    emit(`${describe()} fps=${Math.round((count * 1000) / (now - since))}`);
    count = 0;
    since = now;
  }

  return {
    /** @param {boolean} on */
    setRunning(on) {
      if (on && frameId === null) {
        since = null;
        count = 0;
        frameId = frames.request(tick);
      } else if (!on && frameId !== null) {
        frames.cancel(frameId);
        frameId = null;
      }
    },
    get running() {
      return frameId !== null;
    },
  };
}
