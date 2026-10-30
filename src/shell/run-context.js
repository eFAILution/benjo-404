// @ts-check
// The HostContext a game receives for one run (see src/contracts.d.ts).
/** @typedef {import('../contracts').EndResult} EndResult */
/** @typedef {import('../contracts').HostContext} HostContext */
/** @typedef {import('../contracts').InputState} InputState */
/** @typedef {import('./host.js').HostOptions} HostOptions */
/** @typedef {import('./power.js').Powers} Powers */
/** @typedef {{ raw: number, bonus: number }} Ledger the game's last score and Cache Hit's bonus */

/**
 * One context per run. Its end, setScore, setStatus, audio, and music go quiet once the run's
 * signal aborts, so a stale instance can never end, sound over, or write over the next run.
 *
 * Cache Hit doubles points without the game knowing: each rise in the game's own score while it
 * runs is added again as a bonus, the HUD shows score plus bonus, and end() reports both. The
 * host owns `ledger`, so Rollback can put the score and bonus back with the rest of the run.
 * @param {HostOptions} options
 * @param {{ signal: AbortSignal, input: InputState, end: (result: EndResult) => void,
 *   random: () => number, powers: Powers, track: (x: number, y: number) => void,
 *   ledger: Ledger }} run
 * @returns {HostContext}
 */
export function createRunContext(options, { signal, input, end, random, powers, track, ledger }) {
  const { ctx, hud } = options;
  let lastScore = -1;
  const live = () => !signal.aborted;
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
    random,
    drawSprite: (sprite, x, y, h, opts) => options.drawSprite?.(ctx, sprite, x, y, h, opts),
    setScore(value) {
      if (signal.aborted) return;
      if (value > ledger.raw) {
        if (powers.isActive('cache')) ledger.bonus += value - ledger.raw;
        powers.scored();
      }
      ledger.raw = value;
      const shown = value + ledger.bonus;
      if (shown === lastScore) return;
      lastScore = shown;
      hud.setScore(shown);
    },
    setStatus: (text) => signal.aborted || hud.setStatus(String(text)),
    end: (result) =>
      signal.aborted || end({ ...result, score: (Number(result?.score) || 0) + ledger.bonus }),
    audio: { play: (cue) => signal.aborted || options.audio?.play(cue, options.game.cues) },
    music: {
      play: (track) => signal.aborted || options.music?.play(track),
      stop: () => signal.aborted || options.music?.stop(),
    },
    power: {
      active: (id) => live() && powers.isActive(id),
      absorb: () => live() && powers.absorb(),
    },
    track: (x, y) => signal.aborted || track(x, y),
  };
}
