// Fakes for driving src/shell/host.js on Node: no DOM, no canvas, manual frames.
import { createInputState } from '../../../src/shell/input.js';
import { createStorage } from '../../../src/shell/storage.js';
import { fakeTheme } from './theme.js';

export function fakeCtx() {
  const calls = [];
  const record =
    (name) =>
    (...args) =>
      calls.push([name, ...args]);
  return {
    calls,
    canvas: { width: 300, height: 150 },
    save: record('save'),
    restore: record('restore'),
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
  };
}

export function fakeFrames() {
  let next = 1;
  const queue = new Map();
  return {
    request(cb) {
      const id = next++;
      queue.set(id, cb);
      return id;
    },
    cancel(id) {
      queue.delete(id);
    },
    get pending() {
      return queue.size;
    },
    /** Run every queued callback once at time t (ms). */
    run(t) {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const cb of callbacks) cb(t);
    },
  };
}

/**
 * A game that records every lifecycle call. `behavior` can override any method.
 * @param {Record<string, Function>} [behavior]
 */
export function fakeGame(behavior = {}) {
  const log = [];
  const game = {
    id: 'fake',
    name: 'Fake',
    controls: { keyboard: 'SPACE', touch: 'TAP' },
    bestKey: 'best',
    log,
    host: null,
    create(host) {
      log.push('create');
      game.host = host;
      behavior.create?.(host);
      const instance = {};
      for (const name of ['start', 'update', 'render', 'pause', 'resume', 'destroy']) {
        instance[name] = (...args) => {
          log.push(name);
          return behavior[name]?.(...args);
        };
      }
      return instance;
    },
  };
  return game;
}

export function fakeHud() {
  const events = [];
  return {
    events,
    setScore: (value) => events.push(['score', value]),
    setBest: (value) => events.push(['best', value]),
    setStatus: (value) => events.push(['status', value]),
    showPaused: (options) => events.push(['paused', options]),
    showOver: (card) => events.push(['over', card]),
    clearCard: () => events.push(['clear']),
  };
}

/** Everything createHost needs, with spies. */
export function fakeHostOptions(game, overrides = {}) {
  const classes = new Set();
  const attract = { running: true, starts: 0, stops: 0 };
  const errors = [];
  const options = {
    root: {},
    canvas: {},
    ctx: fakeCtx(),
    size: { width: 300, height: 150, dpr: 1 },
    theme: fakeTheme,
    game,
    reducedMotion: false,
    random: () => 0.5,
    hud: fakeHud(),
    attract: {
      start() {
        attract.running = true;
        attract.starts += 1;
      },
      stop() {
        attract.running = false;
        attract.stops += 1;
      },
    },
    setClass: (name, on) => (on ? classes.add(name) : classes.delete(name)),
    createInput: () => createInputState(),
    storage: createStorage('fake', memoryBacking()),
    frames: fakeFrames(),
    logError: (error) => errors.push(error),
    ...overrides,
  };
  return { options, classes, attract, errors };
}

export function memoryBacking() {
  const data = new Map();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}
