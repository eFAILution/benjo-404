// Test helpers that drive a Dragon Tail instance through the fake host, as a player would.
import { DOWN, NONE, UP } from '../../../src/games/tail/tuning.js';
import { createWorld } from '../../../src/games/tail/world.js';
import { DT, fakeHost, seeded } from '../runner/fake-host.js';

const ACTIONS = ['right', 'down', 'left', 'up'];
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/** Run the instance like the host loop: update then render, rolling input each tick. */
export function play(host, game, seconds, beforeTick = () => {}, renderEvery = 1) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps && host.log.ends.length === 0; i++) {
    beforeTick(i * DT, host.input);
    game.update(DT);
    if (i % renderEvery === 0) game.render(0.5);
    host.input.tick();
  }
}

/** Press a direction key the way the shell reports it (ArrowUp also raises primary). */
export function press(input, dir) {
  input.pressed.add(ACTIONS[dir]);
  if (dir === UP) input.pressed.add('primary');
  if (dir === DOWN) input.pressed.add('secondary');
}

/** A 2D context of plain no-op methods, much cheaper than the proxy for long runs. */
export function plainCtx() {
  const noop = () => {};
  const names = ['save', 'restore', 'translate', 'clearRect', 'fillRect', 'beginPath', 'moveTo'];
  const ctx = Object.fromEntries([...names, 'arcTo', 'fill'].map((name) => [name, noop]));
  return { ...ctx, calls: { count: 0 } };
}

/**
 * A host whose drawSprite reports Benjo's grid cell (reduced motion snaps him onto it).
 * `seen.moved` turns true on the render after the head enters a new cell.
 */
export function watchedHost(options = {}) {
  const host = fakeHost({ reducedMotion: true, ...options });
  const ref = createWorld(host.size, seeded(1));
  const seen = { col: -1, row: -1, moved: false };
  host.drawSprite = (sprite, x, y) => {
    host.log.sprites += 1;
    if (sprite !== host.theme.sprites.benjo) return;
    const col = Math.round((x - ref.originX) / ref.cell - 0.5);
    const row = Math.round((y - ref.originY) / ref.cell - 0.5);
    if (col !== seen.col || row !== seen.row) seen.moved = true;
    seen.col = col;
    seen.row = row;
  };
  return { host, ref, seen };
}

/**
 * Walk a Hamiltonian cycle backwards so the tail always trails along it: rows run
 * boustrophedon over columns 1.., and column 0 is the way back. Needs an even row count.
 */
function cycleWalker(cols, rows) {
  const order = [];
  for (let row = 0; row < rows; row++) {
    for (let k = 1; k < cols; k++) order.push([row % 2 === 0 ? k : cols - k, row]);
  }
  for (let row = rows - 1; row >= 0; row--) order.push([0, row]);
  const index = new Map(order.map(([x, y], i) => [y * cols + x, i]));
  return (col, row) => {
    const [x, y] = order[(index.get(row * cols + col) - 1 + order.length) % order.length];
    return [0, 1, 2, 3].find((d) => DX[d] === x - col && DY[d] === y - row);
  };
}

/** Steer along the cycle, pressing a key only when the next cell needs a turn. */
export function followCycle(seen, ref) {
  const next = cycleWalker(ref.cols, ref.rows);
  const state = { heading: NONE };
  return (t, input) => {
    if (t < 0.2 || !seen.moved) return;
    seen.moved = false;
    const dir = next(seen.col, seen.row);
    if (dir === state.heading) return;
    press(input, dir);
    state.heading = dir;
  };
}
