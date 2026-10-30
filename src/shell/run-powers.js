// @ts-check
// One run's power-ups (#22): the slot, Rollback's snapshots and rewind, the Garbage Collector,
// and the ghost trail with the Digital Twin. The host runs the loop and calls in at each step.
/** @typedef {import('../contracts').GameInstance} GameInstance */
/** @typedef {import('./host.js').HostOptions} HostOptions */
/** @typedef {import('./host.js').RunEvent} RunEvent */

import { createTrail } from './ghost.js';
import { createPowers, powerPool } from './power.js';

// Rollback keeps a snapshot every 0.5 s of game time, eight deep, and rewinds at least 3 s.
const SNAP_TICKS = 30;
const SNAPS = 8;
const ROLLBACK_TICKS = 180;

/**
 * @param {HostOptions} options
 * @param {{ emit: (event: RunEvent) => void, guard: (fn: () => void) => boolean,
 *   instance: () => GameInstance | null }} host `guard` calls into the game and fails the run
 *   when it throws
 */
export function createRunPowers(options, { emit, guard, instance }) {
  const { game } = options;
  /** The run's score and Cache Hit bonus, which a Rollback puts back (run-context.js). */
  const ledger = { raw: 0, bonus: 0 };
  const trail = createTrail(options.storage, options.size);
  let ticks = 0;
  let snapping = false;
  /** @type {Array<{ tick: number, data: unknown, ledger: typeof ledger, trail: ReturnType<typeof trail.mark> }>} */
  let snaps = [];
  const powers = createPowers({
    pool: () => {
      const live = instance();
      return live ? powerPool(game.powers, live) : [];
    },
    random: options.powerRandom ?? Math.random,
    emit,
    show: (view) => options.hud.setPower?.(view),
    cue: () => options.audio?.play('pickup'),
  });

  /**
   * Garbage Collector: the game clears what it can and reports the count. False when collect()
   * threw and failed the run.
   * @param {GameInstance} live
   */
  function collect(live) {
    let count = 0;
    if (!guard(() => (count = Math.max(0, Math.floor(Number(live.collect?.()) || 0)))))
      return false;
    emit({ type: 'collect', count });
    return true;
  }

  return {
    powers,
    ledger,
    /** @param {number} x @param {number} y canvas CSS px */
    track: (x, y) => trail.track(x, y),

    /** The game is built: snapshots are only worth taking when it can be rolled back. @param {GameInstance} live */
    started(live) {
      snapping = powerPool(game.powers, live).includes('rollback');
    },

    /**
     * After each update: feed the trail, run a Garbage Collector that dropped during it, and keep
     * a Rollback snapshot every 0.5 s of game time. False when a game hook threw and failed the run.
     * @param {GameInstance} live
     */
    afterUpdate(live) {
      trail.step(ticks);
      ticks += 1;
      if (powers.sweep() && !collect(live)) return false;
      if (!snapping || ticks % SNAP_TICKS !== 0) return true;
      /** @type {unknown} */
      let data;
      if (!guard(() => (data = live.snapshot?.()))) return false;
      const snap = { tick: ticks, data, ledger: { ...ledger }, trail: trail.mark() };
      snaps = [...snaps.slice(1 - SNAPS), snap];
      return true;
    },

    /**
     * A held Rollback turns a death into a rewind to the newest snapshot at least 3 s old. True
     * when it took the end (a restore that throws fails the run, like any game error).
     * @param {GameInstance} live
     */
    rollback(live) {
      if (!live.restore || !powers.holds('rollback')) return false;
      const back = snaps.filter((snap) => ticks - snap.tick >= ROLLBACK_TICKS).pop();
      if (!back || !powers.take('rollback')) return false;
      snaps = [];
      // Score, bonus, clock, and ghost go back with the run, so the ghost stays in step with it.
      Object.assign(ledger, back.ledger);
      ticks = back.tick;
      trail.rewind(back.trail);
      if (guard(() => live.restore?.(back.data))) emit({ type: 'rollback' });
      return true;
    },

    /** The ghost of the best run, then the twin, over the game's frame. @param {(x: number, y: number, alpha: number) => void} paint */
    draw: (paint) => trail.draw(ticks, powers.isActive('twin'), paint),

    /** Keep this run as the ghost to beat. */
    saveGhost: () => trail.save(),
    /** True when this run raced a saved ghost. */
    racing: trail.racing,

    /** The run is over: empty the slot and let the snapshots go. */
    clear() {
      powers.clear();
      snaps = [];
    },
  };
}

/** @typedef {ReturnType<typeof createRunPowers>} RunPowers */
