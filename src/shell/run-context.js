// @ts-check
// The HostContext a game receives for one run (see src/contracts.d.ts).
/** @typedef {import('../contracts').EndResult} EndResult */
/** @typedef {import('../contracts').HostContext} HostContext */
/** @typedef {import('../contracts').InputState} InputState */
/** @typedef {import('./host.js').HostOptions} HostOptions */

/**
 * One context per run. Its end, setScore, and setStatus go quiet once the run's signal aborts,
 * so a stale instance can never end or write over the next run.
 * @param {HostOptions} options
 * @param {{ signal: AbortSignal, input: InputState, end: (result: EndResult) => void }} run
 * @returns {HostContext}
 */
export function createRunContext(options, { signal, input, end }) {
  const { ctx, hud } = options;
  let lastScore = -1;
  return {
    root: options.root,
    canvas: options.canvas,
    ctx,
    size: options.size,
    input,
    theme: options.theme,
    storage: options.storage,
    signal,
    reducedMotion: options.reducedMotion,
    random: options.random,
    drawSprite: (sprite, x, y, h, opts) => options.drawSprite?.(ctx, sprite, x, y, h, opts),
    setScore(value) {
      if (signal.aborted || value === lastScore) return;
      lastScore = value;
      hud.setScore(value);
    },
    setStatus: (text) => signal.aborted || hud.setStatus(String(text)),
    end: (result) => signal.aborted || end(result),
  };
}
