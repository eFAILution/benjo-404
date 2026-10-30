// @ts-check
// The power-up slot for one run (#22): when drops land, what the slot holds, and which timed power
// is running. The host applies the effects; this file only keeps time and the HUD view.
/** @typedef {import('../contracts').PowerId} PowerId */
/** @typedef {import('./host.js').PowerView} PowerView */
/** @typedef {import('./host.js').RunEvent} RunEvent */

/**
 * id: [HUD label, name, seconds]. 0 seconds means the power acts once and is gone.
 * @type {Record<PowerId, [string, string, number]>}
 */
export const POWERS = {
  twin: ['TWN', 'Digital Twin', 12],
  rollback: ['RBK', 'Rollback', 0],
  cache: ['2X', 'Cache Hit', 10],
  gc: ['GC', 'Garbage Collector', 0],
  breakpoint: ['BRK', 'Breakpoint', 5],
  magnet: ['LB', 'Load Balancer', 10],
};

const FIRST_DROP = 10;
const DROP_GAP = 15;
const DROP_SPREAD = 10;
// The draining bar only moves in 2% steps, so the HUD sees about 50 calls per power, not 60 a second.
const LEFT_STEPS = 50;

/**
 * Which powers this run may drop. The host runs cache and breakpoint alone; the rest need the
 * game's help, and rollback and gc also need the instance hooks that carry them out.
 * @param {PowerId[] | undefined} listed GameModule.powers
 * @param {import('../contracts').GameInstance} instance
 * @returns {PowerId[]}
 */
export function powerPool(listed, instance) {
  /** @type {Record<string, boolean>} */
  const usable = {
    twin: true,
    magnet: true,
    gc: typeof instance.collect === 'function',
    rollback: typeof instance.snapshot === 'function' && typeof instance.restore === 'function',
  };
  const extra = Array.isArray(listed) ? listed.filter((id) => usable[id] === true) : [];
  return ['cache', 'breakpoint', ...new Set(extra)];
}

/**
 * A power takes effect the moment it drops (#74). Rollback is the exception: it is armed and
 * waits for a crash on its own, so other powers keep dropping while it waits.
 * @param {{ pool: () => PowerId[], random: () => number, emit: (event: RunEvent) => void,
 *   show: (view: PowerView | null) => void, cue: () => void }} options
 */
export function createPowers({ pool, random, emit, show, cue }) {
  let clock = 0;
  let due = FIRST_DROP;
  let armed = false;
  /** @type {PowerId | null} */
  let active = null;
  let until = 0;
  let sweeps = 0;
  let shown = '';

  /**
   * @param {PowerId | null} id
   * @param {'armed' | 'active'} [state]
   * @param {number} [left]
   */
  function paint(id, state = 'armed', left = 1) {
    const key = id ? `${id} ${state} ${left}` : '';
    if (key === shown) return;
    shown = key;
    if (!id) return show(null);
    const [label, name] = POWERS[id];
    show({ id, label, name, state, left });
  }

  /** Nothing running: the slot shows an armed Rollback, or empties. */
  const idle = () => paint(armed ? 'rollback' : null);

  /** @param {PowerId} id */
  function start(id) {
    const seconds = POWERS[id][2];
    emit({ type: 'power', id });
    if (id === 'gc') sweeps += 1;
    if (seconds > 0) {
      active = id;
      until = clock + seconds;
      paint(id, 'active');
    }
  }

  /** The game scored. A drop that is due lands now, so it feels earned, and fires at once. */
  function scored() {
    if (active || clock < due) return;
    const ids = pool().filter((id) => !(armed && id === 'rollback'));
    if (ids.length === 0) return;
    const id = ids[Math.floor(random() * ids.length)] ?? ids[0];
    due = clock + DROP_GAP + random() * DROP_SPREAD;
    emit({ type: 'drop', id });
    cue();
    if (id === 'rollback') {
      armed = true;
      idle();
    } else start(id);
  }

  /** @param {number} seconds real playing time since the last frame */
  function tick(seconds) {
    clock += seconds;
    if (!active) return;
    const left = (until - clock) / POWERS[active][2];
    if (left > 0) return paint(active, 'active', Math.ceil(left * LEFT_STEPS) / LEFT_STEPS);
    active = null;
    idle();
  }

  /** Use up the armed Rollback. The host takes it this way when the game ends the run. */
  function take(/** @type {PowerId} */ id) {
    if (id !== 'rollback' || !armed) return false;
    armed = false;
    if (!active) idle();
    return true;
  }

  /** Digital Twin takes one hit, then it is gone. */
  function absorb() {
    if (active !== 'twin') return false;
    active = null;
    idle();
    emit({ type: 'absorb' });
    return true;
  }

  /** Empty the slot at the end of a run. Always tells the HUD, even when it looks empty. */
  function clear() {
    armed = false;
    active = null;
    sweeps = 0;
    shown = '';
    show(null);
  }

  return {
    scored,
    tick,
    take,
    absorb,
    clear,
    /**
     * True once for each Garbage Collector that dropped. The host clears the screen after the
     * game's update, since the drop lands inside it, from the game's own setScore.
     */
    sweep() {
      if (sweeps === 0) return false;
      sweeps -= 1;
      return true;
    },
    /** @param {PowerId} id */
    isActive: (id) => active === id,
    /** @param {PowerId} id */
    holds: (id) => id === 'rollback' && armed,
    /** Real playing seconds, pauses left out. */
    get clock() {
      return clock;
    },
  };
}

/** @typedef {ReturnType<typeof createPowers>} Powers */
