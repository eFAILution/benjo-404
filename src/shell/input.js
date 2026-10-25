// @ts-check
// Keyboard, pointer, and touch folded into one InputState (see src/contracts.d.ts).
/** @typedef {import('../contracts').Action} Action */
/** @typedef {import('../contracts').InputState} InputState */
/** @typedef {'left' | 'right' | 'up' | 'down'} Direction */

/** @type {Record<string, Action[]>} */
export const KEY_MAP = {
  Space: ['primary'],
  Enter: ['primary'],
  ArrowUp: ['primary', 'up'],
  KeyW: ['primary', 'up'],
  ShiftLeft: ['secondary', 'down'],
  KeyX: ['secondary', 'down'],
  ArrowDown: ['secondary', 'down'],
  KeyS: ['secondary', 'down'],
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  Escape: ['pause'],
  KeyP: ['pause'],
};

const TAP_MS = 300;
const TAP_PX = 12;
const SWIPE_MS = 400;
const SWIPE_PX = 40;

/**
 * Pure classifier for a finished pointer gesture.
 * @param {{ dx: number, dy: number, ms: number }} gesture
 * @returns {'tap' | Direction | null}
 */
export function classifyGesture({ dx, dy, ms }) {
  const distance = Math.hypot(dx, dy);
  if (ms <= TAP_MS && distance <= TAP_PX) return 'tap';
  if (ms > SWIPE_MS || distance < SWIPE_PX) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/**
 * State machine with no DOM. The host calls tick() before each update and endTick() after it.
 * @returns {InputState & {
 *   press(action: Action): void, release(action: Action): void, releaseAll(): void,
 *   pulse(action: Action): void, setSwipe(direction: Direction): void,
 *   setPointer(pointer: { x: number, y: number, down: boolean } | null): void,
 *   setTouch(touch: boolean): void, tick(): void, endTick(): void
 * }}
 */
export function createInputState() {
  /** @type {Set<Action>} */
  const held = new Set();
  /** @type {Set<Action>} */
  const pending = new Set();
  /** @type {Set<Action>} */
  const fresh = new Set();
  /** @type {Set<Action>} */
  const pulses = new Set();
  /** @type {Set<Action>} */
  const pulsing = new Set();
  /** @type {Direction | null} */
  let pendingSwipe = null;

  const state = {
    /** @type {{ x: number, y: number, down: boolean } | null} */
    pointer: null,
    /** @type {Direction | null} */
    swipe: null,
    touch: false,
    /** @param {Action} action */
    isDown: (action) => held.has(action) || pulsing.has(action),
    /** @param {Action} action */
    justPressed: (action) => fresh.has(action),
    /** @param {Action} action */
    press(action) {
      if (!held.has(action)) pending.add(action);
      held.add(action);
    },
    /** @param {Action} action */
    release(action) {
      held.delete(action);
    },
    releaseAll() {
      held.clear();
    },
    /** A press that lasts exactly one tick, used for taps. @param {Action} action */
    pulse(action) {
      pending.add(action);
      pulses.add(action);
    },
    /** @param {Direction} direction */
    setSwipe(direction) {
      pendingSwipe = direction;
    },
    /** @param {{ x: number, y: number, down: boolean } | null} pointer */
    setPointer(pointer) {
      state.pointer = pointer;
    },
    /** @param {boolean} touch */
    setTouch(touch) {
      state.touch = touch;
    },
    tick() {
      for (const action of pending) fresh.add(action);
      for (const action of pulses) pulsing.add(action);
      pending.clear();
      pulses.clear();
      state.swipe = pendingSwipe;
      pendingSwipe = null;
    },
    endTick() {
      fresh.clear();
      pulsing.clear();
      state.swipe = null;
    },
  };
  return state;
}

/** Keys that activate a focused button or link. The game never takes these from one. */
const ACTIVATION_KEYS = new Set(['Enter', 'NumpadEnter', 'Space']);

/**
 * Pure decision: is this key game input (and so prevented), or does it belong to the focused
 * control? Links and buttons keep Enter and Space; Tab is never game input.
 * @param {string} code KeyboardEvent.code
 * @param {{ active: { id: string } | null, body: object | null, html: object | null,
 *   pauseButton: object | null }} focus
 * @returns {boolean}
 */
export function gameOwnsKey(code, { active, body, html, pauseButton }) {
  if (!Object.keys(KEY_MAP).includes(code)) return false;
  if (!active || active === body || active === html || active.id === 'game-root') return true;
  return active === pauseButton && !ACTIVATION_KEYS.has(code);
}

/**
 * Fold one game key into the input state. A keydown with repeat set is never a new press, so a
 * held key (such as the Space that started the run) cannot fire again through auto-repeat.
 * @param {ReturnType<typeof createInputState>} input
 * @param {{ type: string, code: string, repeat: boolean }} key
 * @returns {boolean} true when the key asks to pause
 */
export function applyKey(input, { type, code, repeat }) {
  const actions = KEY_MAP[code] ?? [];
  input.setTouch(false);
  if (type !== 'keydown') {
    for (const action of actions) input.release(action);
    return false;
  }
  if (repeat) return false;
  for (const action of actions) input.press(action);
  return actions.includes('pause');
}

/**
 * Wire DOM events into an input state. All listeners use the signal, so abort() removes them.
 * @param {{ canvas: HTMLCanvasElement, signal: AbortSignal, pauseButton?: Element | null,
 *   onPause?: () => void }} options
 */
export function attachInput({ canvas, signal, pauseButton = null, onPause }) {
  const input = createInputState();
  /** @type {{ x: number, y: number, t: number, id: number } | null} */
  let gesture = null;

  /** @param {KeyboardEvent} event */
  function onKey(event) {
    const actions = KEY_MAP[event.code];
    if (!actions || event.altKey || event.ctrlKey || event.metaKey) return;
    const focus = {
      active: document.activeElement,
      body: document.body,
      html: document.documentElement,
      pauseButton,
    };
    if (!gameOwnsKey(event.code, focus)) return;
    event.preventDefault();
    if (applyKey(input, event)) onPause?.();
  }

  /** @param {PointerEvent} event */
  function pointAt(event) {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  /** @param {PointerEvent} event */
  function onPointer(event) {
    const point = pointAt(event);
    input.setTouch(event.pointerType === 'touch' || event.pointerType === 'pen');
    if (event.type === 'pointerdown') {
      gesture = { ...point, t: event.timeStamp, id: event.pointerId };
      input.setPointer({ ...point, down: true });
      return;
    }
    if (event.type === 'pointermove') {
      input.setPointer({ ...point, down: gesture !== null });
      return;
    }
    if (gesture && gesture.id === event.pointerId && event.type === 'pointerup') {
      const kind = classifyGesture({
        dx: point.x - gesture.x,
        dy: point.y - gesture.y,
        ms: event.timeStamp - gesture.t,
      });
      if (kind === 'tap') input.pulse('primary');
      else if (kind) input.setSwipe(kind);
    }
    gesture = null;
    input.setPointer(event.type === 'pointerleave' ? null : { ...point, down: false });
  }

  /** @param {TouchEvent} event */
  function onTouchMove(event) {
    if (gesture) event.preventDefault();
  }

  const passive = { signal, passive: true };
  window.addEventListener('keydown', onKey, { signal });
  window.addEventListener('keyup', onKey, { signal });
  window.addEventListener('blur', () => input.releaseAll(), passive);
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave']) {
    canvas.addEventListener(type, /** @type {EventListener} */ (onPointer), passive);
  }
  canvas.addEventListener('touchmove', onTouchMove, { signal, passive: false });
  return input;
}
