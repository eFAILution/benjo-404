import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GRID, PORT_EVERY } from '../../../src/games/neversleeps/tuning.js';
import { cellX, cellY, createWorld, stepWorld } from '../../../src/games/neversleeps/world.js';
import { DT, seeded } from '../runner/fake-host.js';

/** Close enough to a target to stop steering, in trench units. */
const DEADBAND = 0.04;

const CELLS = GRID * GRID;
const apart = (a, b) =>
  Math.max(
    Math.abs((a % GRID) - (b % GRID)),
    Math.abs(Math.floor(a / GRID) - Math.floor(b / GRID)),
  );
const open = (g, i) => !(g.mask & (1 << i));

/** Can the ship get from cell `from` in gate k through every gate after it, a cell at a time? */
function through(gates, k, from) {
  if (k === gates.length - 1) return true;
  for (let i = 0; i < CELLS; i++) {
    if (open(gates[k + 1], i) && apart(from, i) <= 1 && through(gates, k + 1, i)) return true;
  }
  return false;
}

/**
 * Where to fly for the next gate: the open cell nearest the ship from which every gate in view
 * can still be flown, moving at most one cell from gate to gate. A port's ring when it is on
 * such a path.
 */
function nextTarget(w) {
  const gates = w.gates.filter((g) => g.active && g.z > 0).sort((a, b) => a.z - b.z);
  if (!gates.length) return { x: w.sx, y: w.sy };
  let best = null;
  for (let i = 0; i < CELLS; i++) {
    if (!open(gates[0], i) || !through(gates, 0, i)) continue;
    const ring = gates[0].port === i ? -1 : 0;
    const d = Math.hypot(cellX(i) - w.sx, cellY(i) - w.sy) + ring;
    if (!best || d < best.d) best = { x: cellX(i), y: cellY(i), d };
  }
  return best ?? { x: w.sx, y: w.sy };
}

/**
 * The spec's autopilot, on the keys: plan a path of open cells through the gates in view, one
 * cell at most from gate to gate, and steer for the first one inside a deadband. If it survives,
 * every run of gates is flyable from the keyboard by a player who looks ahead.
 */
function autopilot(w) {
  const t = nextTarget(w);
  const axis = (d) => (Math.abs(d) < DEADBAND ? 0 : Math.sign(d));
  return { mx: axis(t.x - w.sx), my: axis(t.y - w.sy), px: null, py: null, grab: false };
}

const SIZES = [
  { width: 960, height: 540 },
  { width: 375, height: 667 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1080 },
  { width: 320, height: 240 },
];

for (const size of SIZES) {
  for (const reducedMotion of [false, true]) {
    test(`an autopilot flies 90 s at ${size.width}x${size.height}${reducedMotion ? ' with reduced motion' : ''}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld(size, seeded(seed), { reducedMotion });
        for (let i = 0; i < 90 * 60 && !w.dead; i++) stepWorld(w, autopilot(w), DT);
        assert.equal(
          w.dead,
          false,
          `seed ${seed} hit a gate at ${w.time.toFixed(1)} s, gate ${w.passed}`,
        );
        assert.ok(w.passed > 100, `seed ${seed} passed only ${w.passed} gates`);
        assert.ok(w.passed >= 2 * PORT_EVERY);
      }
    });
  }
}

test('a ship that never steers hits a gate within 20 s', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const w = createWorld({ width: 960, height: 540 }, seeded(seed));
    const idle = { mx: 0, my: 0, px: null, py: null, grab: false };
    for (let i = 0; i < 20 * 60 && !w.dead; i++) stepWorld(w, idle, DT);
    assert.equal(w.dead, true, `seed ${seed} sat in the middle for 20 s`);
  }
});
