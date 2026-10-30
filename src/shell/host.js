// @ts-check
// Runs one game: HostContext, fixed-step loop, pause, end, and error isolation (ADR-0008 section 3),
// plus the run's power-ups, Digital Twin, ghost race, and run events (#22).
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
 * What the HUD power slot shows (#22). 'held' waits for the player to fire it; 'active' is running
 * and `left` drains from 1 to 0.
 * @typedef {{ id: PowerId, label: string, name: string, state: 'held' | 'active', left: number }} PowerView
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

import { avatarSize, createTrail } from './ghost.js';
import { createPowers, powerPool } from './power.js';
import { createRunContext } from './run-context.js';

export const STEP = 1 / 60;
export const MAX_STEPS = 5;
const MAX_FRAME_SECONDS = 0.25;
const EPSILON = 1e-9;
// Rollback keeps a snapshot every 0.5 s of game time, eight deep, and rewinds at least 3 s.
const SNAP_TICKS = 30;
const SNAPS = 8;
const ROLLBACK_TICKS = 180;

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
  /** @type {import('./power.js').Powers | null} */
  let powers = null;
  /** @type {import('./ghost.js').Trail | null} */
  let trail = null;
  let nightly = false;
  let snapping = false;
  let ticks = 0;
  /** @type {Array<{ tick: number, data: unknown }>} */
  let snaps = [];

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
    powers?.clear();
    powers = null;
    snaps = [];
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

  /**
   * A held Rollback turns a death into a rewind to the newest snapshot at least 3 s old. True when
   * it took the end (a restore that throws fails the run, like any game error).
   */
  function rollback() {
    const game = instance;
    if (!game?.restore || !powers?.holds('rollback')) return false;
    const back = snaps.filter((snap) => ticks - snap.tick >= ROLLBACK_TICKS).pop();
    if (!back || !powers.take('rollback')) return false;
    snaps = [];
    if (guard(() => game.restore?.(back.data))) emit({ type: 'rollback' });
    return true;
  }

  /** @param {EndResult} result */
  function end(result) {
    if (state !== 'playing' && state !== 'paused') return;
    if (rollback()) return;
    const seconds = Math.floor(powers?.clock ?? 0);
    releaseRun();
    const score = Math.max(0, Math.floor(Number(result?.score) || 0));
    const previous = storage.getNumber(game.bestKey, 0);
    const best = Math.max(previous, score);
    if (score > previous) {
      storage.setNumber(game.bestKey, score);
      trail?.save();
    }
    const ghost = trail?.racing ?? false;
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
   * After each update: feed the trail, and keep a Rollback snapshot every 0.5 s of game time.
   * @param {GameInstance} game
   */
  function afterUpdate(game) {
    trail?.step(ticks);
    ticks += 1;
    if (!snapping || ticks % SNAP_TICKS !== 0) return true;
    /** @type {unknown} */
    let data;
    if (!guard(() => (data = game.snapshot?.()))) return false;
    snaps = [...snaps.slice(1 - SNAPS), { tick: ticks, data }];
    return true;
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
    trail?.draw(ticks, powers?.isActive('twin') ?? false, (x, y, opacity) =>
      options.drawSprite?.(ctx, benjo, x, y, h, { alpha: opacity }),
    );
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
    powers?.tick(seconds);
    accumulator += powers?.isActive('breakpoint') ? seconds / 2 : seconds;
    let steps = 0;
    while (accumulator + EPSILON >= STEP && steps < MAX_STEPS) {
      keys.tick();
      const ok = guard(() => game.update(STEP));
      keys.endTick();
      if (!ok || state !== 'playing' || !afterUpdate(game)) return;
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === MAX_STEPS) accumulator %= STEP;
    const alpha = Math.min(Math.max(accumulator / STEP, 0), 0.999);
    lastAlpha = alpha;
    if (!render(game, alpha) || state !== 'playing') return;
    scheduleLoop();
  }

  /** @param {RunOptions} [run] a run's own random (the nightly seed) and whether it is nightly */
  function play(run) {
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
    nightly = run?.nightly === true;
    ticks = 0;
    trail = createTrail(storage, options.size);
    const runTrail = trail;
    powers = createPowers({
      pool: () => (instance ? powerPool(game.powers, instance) : []),
      random: options.powerRandom ?? Math.random,
      emit,
      show: (view) => hud.setPower?.(view),
      cue: () => options.audio?.play('pickup'),
    });
    const context = createRunContext(options, {
      signal: controller.signal,
      input,
      end,
      random: run?.random ?? options.random,
      powers,
      track: (x, y) => runTrail.track(x, y),
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
    snapping = powerPool(game.powers, created).includes('rollback');
    if (!guard(() => created.start()) || state !== 'playing') return;
    emit({ type: 'start', game: game.id, nightly });
    accumulator = STEP;
    lastTime = null;
    scheduleLoop();
  }

  /** The player fires the held power-up. Only while playing. */
  function firePower() {
    const game = instance;
    if (state !== 'playing' || !game || !powers) return;
    if (powers.fire() !== 'gc') return;
    let count = 0;
    if (!guard(() => (count = Math.max(0, Math.floor(Number(game.collect?.()) || 0))))) return;
    emit({ type: 'collect', count });
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
    firePower,
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
