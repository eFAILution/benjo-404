// A tiny stand-in for the shell's HostContext so the runner can be tested on Node.
import { benjo } from '../../../src/assets/benjo.js';

export const DT = 1 / 60;

/** Seeded generator (mulberry32) so runs are repeatable. */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const box = (w, h, fill) => ({ viewBox: [0, 0, w, h], paths: [{ d: `M0 0H${w}V${h}H0Z`, fill }] });

export function fakeTheme() {
  return {
    id: 'test',
    name: 'Test',
    holiday: 'default',
    palette: {
      bg: '#040404',
      accent: '#d72228',
      accentSoft: '#d7222833',
      glow: '#ff8a3d',
      ink: '#f2f2f2',
      muted: '#9e9e9e',
      hazard: '#d72228',
      pickup: '#ff8a3d',
    },
    particles: {
      count: 10,
      color: '#ff8a3d',
      size: [1, 2],
      speed: [4, 8],
      drift: 'up',
      twinkle: false,
    },
    sprites: {
      benjo,
      hazards: [
        box(64, 64, 'hazard'),
        { ...box(48, 96, 'hazard'), anchor: [0.5, 1] },
        box(96, 64, 'hazard'),
      ],
      pickups: [box(64, 64, 'pickup'), box(64, 64, 'glow')],
    },
  };
}

/** InputState with settable held keys, one-tick presses, pointer, and swipe. */
export function fakeInput() {
  const held = new Set();
  const pressed = new Set();
  return {
    held,
    pressed,
    pointer: null,
    swipe: null,
    touch: false,
    isDown: (action) => held.has(action),
    justPressed: (action) => pressed.has(action),
    /** Clear per-tick state, as the host does after each update. */
    tick() {
      pressed.clear();
      this.swipe = null;
    },
  };
}

/** A 2D context whose every method is a no-op and whose properties accept any value. */
export function fakeCtx() {
  const calls = { count: 0 };
  const noop = () => {
    calls.count += 1;
  };
  return new Proxy(
    { calls },
    {
      get: (target, key) => (key in target ? target[key] : noop),
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    },
  );
}

export function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get: (key) => (map.has(key) ? map.get(key) : null),
    set: (key, value) => {
      map.set(key, String(value));
      return true;
    },
    getNumber: (key, fallback) => {
      const n = Number(map.get(key));
      return map.has(key) && Number.isFinite(n) ? n : fallback;
    },
    setNumber: (key, value) => {
      map.set(key, String(value));
      return true;
    },
  };
}

export function fakeHost(overrides = {}) {
  const log = { scores: [], statuses: [], ends: [], sprites: 0 };
  const host = {
    root: {},
    canvas: {},
    ctx: fakeCtx(),
    size: { width: 960, height: 540, dpr: 1 },
    input: fakeInput(),
    theme: fakeTheme(),
    storage: fakeStorage(),
    signal: new AbortController().signal,
    reducedMotion: false,
    random: seeded(7),
    drawSprite: () => {
      log.sprites += 1;
    },
    setScore: (value) => log.scores.push(value),
    setStatus: (text) => log.statuses.push(text),
    end: (result) => log.ends.push(result),
    log,
    ...overrides,
  };
  return host;
}

/** Input for the pure world: no buttons. */
export const idle = () => ({
  jumpPressed: false,
  jumpHeld: false,
  duckHeld: false,
  duckTap: false,
});
