// @ts-check
// Runs one game: HostContext, fixed-step loop, pause, end, and error isolation (ADR-0008 section 3),
// and the run events (#22). Each run's power-ups, Rollback, and ghost live in run-powers.js.
/** @typedef {import('../contracts').GameModule} GameModule */
/** @typedef {import('../contracts').GameInstance} GameInstance */
/** @typedef {import('../contracts').GameStorage} GameStorage */
/** @typedef {import('../contracts').EndResult} EndResult */
/** @typedef {import('../contracts').Size} Size */
/** @typedef {import('../contracts').ThemePack} ThemePack */
/** @typedef {import('./input.js').HostInput} HostInput */
/** @typedef {'idle' | 'playing' | 'paused' | 'over'} HostState */
/**
 * @typedef {object} HudPort
 * @property {(value: number) => void} setScore
 * @property {(value: number) => void} setBest
 * @property {(text: string) => void} setStatus
 * @property {(options: { focus: boolean }) => void} showPaused
 * @property {(card: { score: number, best: number, scoreLabel: string, reason: string }) => void} showOver
 * @property {() => void} clearCard
 * @property {(view: PowerView | null) => void} [setPower] the HUD power slot; null empties it
 */
/** @typedef {import('../contracts').PowerId} PowerId */
/**
 * What the HUD power slot shows (#22). 'armed' is a Rollback waiting for a crash (#74); 'active' is
 * running and `left` drains from 1 to 0.
 * @typedef {{ id: PowerId, label: string, name: string, state: 'armed' | 'active', left: number }} PowerView
 */
/**
 * What happened in a run, for trophies, tickets, and XP (#22). The host sends 'end' before it
 * shows the game over card, so the card can carry the XP the run earned.
 * @typedef {{ type: 'start', game: string, nightly: boolean }
 *   | { type: 'end', game: string, score: number, previous: number, seconds: number,
 *       nightly: boolean, ghost: boolean }
 *   | { type: 'drop', id: PowerId }
 *   | { type: 'power', id: PowerId }
 *   | { type: 'absorb' }
 *   | { type: 'rollback' }
 *   | { type: 'collect', count: number }} RunEvent
 */
/** @typedef {{ random?: () => number, nightly?: boolean }} RunOptions */
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
 * @property {(signal: AbortSignal) => HostInput} createInput
 * @property {GameStorage} storage
 * @property {{ request(cb: (t: number) => void): number, cancel(id: number): void }} frames
 * @property {(failures: number) => void} [onFailure]
 * @property {(error: unknown) => void} [logError]
 * @property {{ play(cue: import('../contracts').AudioCue): void }} [audio]
 * @property {(ctx: CanvasRenderingContext2D, sprite: import('../contracts').Sprite, x: number,
 *   y: number, h: number, opts?: object) => void} [drawSprite]
 * @property {(event: RunEvent) => void} [onEvent]
 * @property {() => number} [powerRandom] drops use their own random, so a seeded run's `random`
 *   gives the same level whatever the power-ups do. Default Math.random.
 */

import { avatarSize } from './ghost.js';
import { createRunContext } from './run-context.js';
import { createRunPowers } from './run-powers.js';

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
  /** @type {HostInput | null} */
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
  /** The run's power-ups, Rollback, and ghost (run-powers.js); kept after the run for its ghost. */
  /** @type {import('./run-powers.js').RunPowers | null} */
  let run = null;
  let nightly = false;

  /** A listener that throws must not take the run down with it. @param {RunEvent} event */
  function emit(event) {
    try {
      options.onEvent?.(event);
    } catch (error) {
      logError(error);
    }
  }

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
    run?.clear();
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
    if (instance && run?.rollback(instance)) return;
    const seconds = Math.floor(run?.powers.clock ?? 0);
    releaseRun();
    const score = Math.max(0, Math.floor(Number(result?.score) || 0));
    const previous = storage.getNumber(game.bestKey, 0);
    const best = Math.max(previous, score);
    if (score > previous) {
      storage.setNumber(game.bestKey, score);
      run?.saveGhost();
    }
    const ghost = run?.racing ?? false;
    emit({ type: 'end', game: game.id, score, previous, seconds, nightly, ghost });
    state = 'over';
    setClass('is-paused', false);
    setClass('is-over', true);
    hud.setBest(best);
    // Any run that raises the best cheers, a visitor's first score included (#36).
    options.audio?.play(score > previous ? 'best' : 'over');
    hud.showOver({
      score,
      best,
      scoreLabel: String(result?.scoreLabel ?? 'SCORE').slice(0, 16),
      reason: String(result?.reason ?? '').slice(0, 48),
    });
  }

  /**
   * The game's frame, then the ghost and the twin on top of it.
   * @param {GameInstance} game
   * @param {number} alpha
   */
  function render(game, alpha) {
    if (!guard(() => game.render(alpha))) return false;
    const benjo = options.theme.sprites.benjo;
    const h = avatarSize(options.size);
    run?.draw((x, y, opacity) => options.drawSprite?.(ctx, benjo, x, y, h, { alpha: opacity }));
    return true;
  }

  /** @param {number} time */
  function frame(time) {
    frameId = null;
    if (state !== 'playing' || !instance || !input) return;
    const game = instance;
    const keys = input;
    if (lastTime === null) lastTime = time;
    const seconds = Math.min(Math.max(time - lastTime, 0) / 1000, MAX_FRAME_SECONDS);
    lastTime = time;
    // Power timers run on real time; Breakpoint only slows the game.
    run?.powers.tick(seconds);
    accumulator += run?.powers.isActive('breakpoint') ? seconds / 2 : seconds;
    let steps = 0;
    while (accumulator + EPSILON >= STEP && steps < MAX_STEPS) {
      keys.tick();
      const ok = guard(() => game.update(STEP));
      keys.endTick();
      if (!ok || state !== 'playing' || !run?.afterUpdate(game)) return;
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === MAX_STEPS) accumulator %= STEP;
    const alpha = Math.min(Math.max(accumulator / STEP, 0), 0.999);
    lastAlpha = alpha;
    if (!render(game, alpha) || state !== 'playing') return;
    scheduleLoop();
  }

  /** @param {RunOptions} [how] a run's own random (the nightly seed) and whether it is nightly */
  function play(how) {
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
    nightly = how?.nightly === true;
    const extras = createRunPowers(options, { emit, guard, instance: () => instance });
    run = extras;
    const context = createRunContext(options, {
      signal: controller.signal,
      input,
      end,
      random: how?.random ?? options.random,
      powers: extras.powers,
      track: extras.track,
      ledger: extras.ledger,
    });
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
    extras.started(created);
    if (!guard(() => created.start()) || state !== 'playing') return;
    emit({ type: 'start', game: game.id, nightly });
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
    return render(instance, lastAlpha);
  }

  function quit() {
    if (state === 'idle') return;
    releaseRun();
    backToIdle();
  }

  /** Drop the run and start the same game from zero: the paused card's Play again. */
  function restart() {
    if (state === 'idle') return;
    releaseRun();
    setClass('is-paused', false);
    setClass('is-over', false);
    hud.clearCard();
    state = 'idle';
    play();
  }

  return {
    play,
    pause,
    resume,
    quit,
    restart,
    redraw,
    get state() {
      return state;
    },
    get failures() {
      return failures;
    },
  };
}
