// @ts-check
// Runs one game: HostContext, fixed-step loop, pause, end, and error isolation (ADR-0008 section 3).
/** @typedef {import('../contracts').GameModule} GameModule */
/** @typedef {import('../contracts').GameInstance} GameInstance */
/** @typedef {import('../contracts').GameStorage} GameStorage */
/** @typedef {import('../contracts').EndResult} EndResult */
/** @typedef {import('../contracts').Size} Size */
/** @typedef {import('../contracts').ThemePack} ThemePack */
/** @typedef {import('../contracts').InputState} InputState */
/** @typedef {'idle' | 'playing' | 'paused' | 'over'} HostState */
/**
 * @typedef {object} HudPort
 * @property {(value: number) => void} setScore
 * @property {(value: number) => void} setBest
 * @property {(text: string) => void} setStatus
 * @property {(options: { focus: boolean }) => void} showPaused
 * @property {(card: { score: number, best: number, scoreLabel: string, reason: string }) => void} showOver
 * @property {() => void} clearCard
 */
/**
 * @typedef {object} HostOptions
 * @property {HTMLElement} root
 * @property {HTMLCanvasElement} canvas
 * @property {CanvasRenderingContext2D} ctx
 * @property {Size} size live object kept current by watchSize()
 * @property {ThemePack} theme
 * @property {GameModule} game
 * @property {boolean} reducedMotion
 * @property {() => number} random
 * @property {HudPort} hud
 * @property {{ start(): void, stop(): void }} attract
 * @property {(name: string, on: boolean) => void} setClass toggles a class on <html>
 * @property {(signal: AbortSignal) => InputState & { tick(): void, endTick(): void }} createInput
 * @property {GameStorage} storage
 * @property {{ request(cb: (t: number) => void): number, cancel(id: number): void }} frames
 * @property {(failures: number) => void} [onFailure]
 * @property {(error: unknown) => void} [logError]
 * @property {(ctx: CanvasRenderingContext2D, sprite: import('../contracts').Sprite, x: number,
 *   y: number, h: number, opts?: object) => void} [drawSprite]
 */

import { createRunContext } from './run-context.js';

export const STEP = 1 / 60;
export const MAX_STEPS = 5;
const MAX_FRAME_SECONDS = 0.25;
const EPSILON = 1e-9;

/** @param {unknown} error */
function defaultLogError(error) {
  console.error('[benjo-404] game failed', error);
}

/** @param {CanvasRenderingContext2D} ctx */
export function clearCanvas(ctx) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/** @param {HostOptions} options */
export function createHost(options) {
  const { game, hud, attract, setClass, frames, storage, ctx } = options;
  const logError = options.logError ?? defaultLogError;
  /** @type {HostState} */
  let state = 'idle';
  /** @type {GameInstance | null} */
  let instance = null;
  /** @type {AbortController | null} */
  let controller = null;
  /** @type {(InputState & { tick(): void, endTick(): void }) | null} */
  let input = null;
  let destroyed = true;
  let failures = 0;
  let logged = false;
  let accumulator = 0;
  /** @type {number | null} */
  let lastTime = null;
  let lastAlpha = 0;
  /** @type {number | null} */
  let frameId = null;

  function stopLoop() {
    if (frameId !== null) frames.cancel(frameId);
    frameId = null;
  }

  function scheduleLoop() {
    if (frameId === null) frameId = frames.request(frame);
  }

  function destroyOnce() {
    if (!instance || destroyed) return;
    destroyed = true;
    try {
      instance.destroy();
    } catch (error) {
      if (!logged) logError(error);
      logged = true;
    }
  }

  function releaseRun() {
    stopLoop();
    controller?.abort();
    destroyOnce();
  }

  function backToIdle() {
    clearCanvas(ctx);
    setClass('is-over', false);
    setClass('is-paused', false);
    setClass('is-playing', false);
    hud.clearCard();
    state = 'idle';
    attract.start();
  }

  /** @param {unknown} error */
  function fail(error) {
    if (!logged) logError(error);
    logged = true;
    releaseRun();
    backToIdle();
    failures += 1;
    options.onFailure?.(failures);
  }

  /**
   * Call into the game. Returns false (after failing the run) when it throws.
   * @param {() => void} fn
   */
  function guard(fn) {
    try {
      fn();
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  }

  /** @param {EndResult} result */
  function end(result) {
    if (state !== 'playing' && state !== 'paused') return;
    releaseRun();
    const score = Math.max(0, Math.floor(Number(result?.score) || 0));
    const previous = storage.getNumber(game.bestKey, 0);
    const best = Math.max(previous, score);
    if (score > previous) storage.setNumber(game.bestKey, score);
    state = 'over';
    setClass('is-paused', false);
    setClass('is-over', true);
    hud.setBest(best);
    hud.showOver({
      score,
      best,
      scoreLabel: String(result?.scoreLabel ?? 'SCORE').slice(0, 16),
      reason: String(result?.reason ?? '').slice(0, 48),
    });
  }

  /** @param {number} time */
  function frame(time) {
    frameId = null;
    if (state !== 'playing' || !instance || !input) return;
    const game = instance;
    const keys = input;
    if (lastTime === null) lastTime = time;
    accumulator += Math.min(Math.max(time - lastTime, 0) / 1000, MAX_FRAME_SECONDS);
    lastTime = time;
    let steps = 0;
    while (accumulator + EPSILON >= STEP && steps < MAX_STEPS) {
      keys.tick();
      const ok = guard(() => game.update(STEP));
      keys.endTick();
      if (!ok || state !== 'playing') return;
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === MAX_STEPS) accumulator %= STEP;
    const alpha = Math.min(Math.max(accumulator / STEP, 0), 0.999);
    lastAlpha = alpha;
    if (!guard(() => game.render(alpha)) || state !== 'playing') return;
    scheduleLoop();
  }

  function play() {
    if (state === 'playing' || state === 'paused') return;
    if (state === 'over') {
      setClass('is-over', false);
      hud.clearCard();
    }
    state = 'playing';
    setClass('is-playing', true);
    attract.stop();
    clearCanvas(ctx);
    controller = new AbortController();
    input = options.createInput(controller.signal);
    const context = createRunContext(options, { signal: controller.signal, input, end });
    hud.setScore(0);
    hud.setBest(storage.getNumber(game.bestKey, 0));
    hud.setStatus(input.touch ? game.controls.touch : game.controls.keyboard);
    instance = null;
    destroyed = false;
    /** @type {GameInstance | null} */
    let created = null;
    try {
      created = game.create(context);
    } catch (error) {
      fail(error);
      return;
    }
    instance = created;
    if (!guard(() => created.start()) || state !== 'playing') return;
    accumulator = STEP;
    lastTime = null;
    scheduleLoop();
  }

  /** @param {{ focus?: boolean }} [how] focus false leaves keyboard focus where it is */
  function pause({ focus = true } = {}) {
    if (state !== 'playing' || !instance) return;
    const game = instance;
    stopLoop();
    if (!guard(() => game.pause())) return;
    state = 'paused';
    setClass('is-paused', true);
    hud.showPaused({ focus });
  }

  function resume() {
    if (state !== 'paused' || !instance) return;
    const game = instance;
    setClass('is-paused', false);
    hud.clearCard();
    state = 'playing';
    if (!guard(() => game.resume())) return;
    accumulator = 0;
    lastTime = null;
    scheduleLoop();
  }

  /**
   * A resize clears the canvas. Paint the paused game once more; a playing game repaints on its
   * next frame. Returns false when no instance is alive, so the caller draws the attract backdrop.
   */
  function redraw() {
    if (state === 'playing') return true;
    if (state !== 'paused' || !instance || destroyed) return false;
    const game = instance;
    return guard(() => game.render(lastAlpha));
  }

  function quit() {
    if (state === 'idle') return;
    releaseRun();
    backToIdle();
  }

  return {
    play,
    pause,
    resume,
    quit,
    redraw,
    get state() {
      return state;
    },
    get failures() {
      return failures;
    },
  };
}
