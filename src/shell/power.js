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
 * @param {{ pool: () => PowerId[], random: () => number, emit: (event: RunEvent) => void,
 *   show: (view: PowerView | null) => void, cue: () => void }} options
 */
export function createPowers({ pool, random, emit, show, cue }) {
  let clock = 0;
  let due = FIRST_DROP;
  /** @type {PowerId | null} */
  let held = null;
  /** @type {PowerId | null} */
  let active = null;
  let until = 0;
  let shown = '';

  /**
   * @param {PowerId | null} id
   * @param {'held' | 'active'} [state]
   * @param {number} [left]
   */
  function paint(id, state = 'held', left = 1) {
    const key = id ? `${id} ${state} ${left}` : '';
    if (key === shown) return;
    shown = key;
    if (!id) return show(null);
    const [label, name] = POWERS[id];
    show({ id, label, name, state, left });
  }

  /** The game scored. A drop that is due lands now, so it feels earned. */
  function scored() {
    if (held || active || clock < due) return;
    const ids = pool();
    if (ids.length === 0) return;
    held = ids[Math.floor(random() * ids.length)] ?? ids[0];
    due = clock + DROP_GAP + random() * DROP_SPREAD;
    paint(held);
    emit({ type: 'drop', id: held });
    cue();
  }

  /** @param {number} seconds real playing time since the last frame */
  function tick(seconds) {
    clock += seconds;
    if (!active) return;
    const left = (until - clock) / POWERS[active][2];
    if (left > 0) return paint(active, 'active', Math.ceil(left * LEFT_STEPS) / LEFT_STEPS);
    active = null;
    paint(null);
  }

  /** Held becomes active. Rollback cannot be fired by hand; it waits in the slot for a death. */
  function fire() {
    const id = held;
    if (!id || id === 'rollback') return null;
    held = null;
    const seconds = POWERS[id][2];
    emit({ type: 'power', id });
    if (seconds > 0) {
      active = id;
      until = clock + seconds;
      paint(id, 'active');
    } else paint(null);
    return id;
  }

  /** Use up the held power when it is `id`. The host takes rollback this way. */
  function take(/** @type {PowerId} */ id) {
    if (held !== id) return false;
    held = null;
    paint(null);
    return true;
  }

  /** Digital Twin takes one hit, then it is gone. */
  function absorb() {
    if (active !== 'twin') return false;
    active = null;
    paint(null);
    emit({ type: 'absorb' });
    return true;
  }

  /** Empty the slot at the end of a run. Always tells the HUD, even when it looks empty. */
  function clear() {
    held = null;
    active = null;
    shown = '';
    show(null);
  }

  return {
    scored,
    tick,
    fire,
    take,
    absorb,
    clear,
    /** @param {PowerId} id */
    isActive: (id) => active === id,
    /** @param {PowerId} id */
    holds: (id) => held === id,
    /** Real playing seconds, pauses left out. */
    get clock() {
      return clock;
    },
  };
}

/** @typedef {ReturnType<typeof createPowers>} Powers */
