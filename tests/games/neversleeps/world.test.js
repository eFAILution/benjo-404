import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  EVENT_HIT,
  EVENT_ORB,
  EVENT_PASS,
  EVENT_PORT,
  FAR,
  GATE_POOL,
  GATE_SCORE,
  GRID,
  ORB_SCORE,
  PORT_EVERY,
  PORT_SCORE,
  SHIP_SPEED,
  SPEED_CAP,
  SPEED_CAP_REDUCED,
  START_GRACE,
} from '../../../src/games/neversleeps/tuning.js';
import {
  around,
  cellX,
  cellY,
  createWorld,
  gapFor,
  openFor,
  resizeWorld,
  speedFor,
  stepWorld,
} from '../../../src/games/neversleeps/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };
const SIZES = [
  SIZE,
  { width: 375, height: 667 },
  { width: 2560, height: 1080 },
  { width: 320, height: 240 },
];
const CELLS = GRID * GRID;
const MIDDLE = 4;
const idle = () => ({ mx: 0, my: 0, px: null, py: null, grab: false });

/** Step `seconds` with `intent(w)`. */
function run(w, seconds, intent = idle) {
  for (let i = 0; i < Math.round(seconds / DT) && !w.dead; i++) stepWorld(w, intent(w), DT);
  return w;
}

/** A world past the start grace, with every gate cleared away. */
function live(size = SIZE, seed = 1) {
  const w = run(createWorld(size, seeded(seed)), START_GRACE + DT);
  for (const g of w.gates) g.active = false;
  w.lastZ = Number.POSITIVE_INFINITY;
  return w;
}

/** Put one gate just ahead of the ship, about to be crossed. */
function gateAhead(w, { mask = 0, orb = -1, port = -1 } = {}) {
  const g = w.gates[0];
  Object.assign(g, { active: true, z: 0.01, prevZ: 0.01, mask, orb, port, sprite: 0 });
  if (orb >= 0) Object.assign(g, { ox: cellX(orb), oy: cellY(orb) });
  return g;
}

/** Put the ship in the middle of cell `i`. */
const sitIn = (w, i) => Object.assign(w, { sx: cellX(i), sy: cellY(i) });

/** Every gate made in the first `seconds` of a run, in order, as [mask, port]. */
function gatesMade(seconds, seed = 1) {
  const w = createWorld(SIZE, seeded(seed));
  const seen = [];
  const note = () => {
    for (const g of w.gates) {
      if (g.active && !seen.some((s) => s.g === g && s.z === g.sprite)) {
        seen.push({ g, z: g.sprite, mask: g.mask, port: g.port, lane: w.lane, open: openFor(w) });
      }
    }
  };
  note();
  for (let i = 0; i < seconds / DT; i++) {
    // Fly on through: gates never hit a ship nobody is playing.
    w.graceT = 1;
    stepWorld(w, idle(), DT);
    note();
  }
  return seen.sort((a, b) => a.z - b.z);
}

describe('layout', () => {
  for (const size of SIZES) {
    test(`at ${size.width}x${size.height} the ship fits inside one cell`, () => {
      const w = createWorld(size, seeded(1));
      assert.ok(w.hx > 0 && w.hx < 1 / GRID, `hx ${w.hx}`);
      assert.ok(w.hy > 0 && w.hy < 1 / GRID, `hy ${w.hy}`);
      assert.ok(w.cy - w.halfH >= w.ceiling - 1e-9 && w.cy + w.halfH <= w.bottom + 1e-9);
      assert.ok(w.cx - w.halfW >= 0 && w.cx + w.halfW <= w.width);
    });
  }
});

describe('gates', () => {
  test('the first gate starts at FAR, and the next come gapFor apart', () => {
    const w = createWorld(SIZE, seeded(2));
    assert.equal(w.gates.filter((g) => g.active).length, 1);
    assert.equal(w.gates[0].z, FAR);
    w.graceT = 99;
    run(w, 2);
    const zs = w.gates
      .filter((g) => g.active)
      .map((g) => g.z)
      .sort((a, b) => a - b);
    for (let i = 1; i < zs.length; i++) assert.ok(Math.abs(zs[i] - zs[i - 1] - gapFor(w)) < 0.2);
    assert.ok(w.gates.length === GATE_POOL);
  });

  test('every gate leaves the lane open, and the lane moves at most one cell', () => {
    const made = gatesMade(40);
    assert.ok(made.length > 40, `${made.length} gates`);
    let lane = MIDDLE;
    for (const { mask, lane: now } of made) {
      assert.ok(around(lane) & (1 << now), 'the lane moves at most one cell');
      assert.equal(mask & (1 << now), 0, 'the lane cell is open');
      lane = now;
    }
  });

  test('openings are one connected shape of openFor cells, and every 8th gate is a port', () => {
    for (const { z, mask, port, open } of gatesMade(40)) {
      if (z % PORT_EVERY === 0) {
        assert.equal(mask, 0);
        assert.ok(port >= 0);
        continue;
      }
      assert.equal(port, -1);
      const cells = [...Array(CELLS).keys()].filter((i) => !(mask & (1 << i)));
      assert.equal(cells.length, open, `gate ${z}`);
      const seen = new Set([cells[0]]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const i of cells) {
          if (seen.has(i)) continue;
          const touches = [...seen].some(
            (j) =>
              Math.abs((i % GRID) - (j % GRID)) +
                Math.abs(Math.floor(i / GRID) - Math.floor(j / GRID)) ===
              1,
          );
          if (touches) {
            seen.add(i);
            grew = true;
          }
        }
      }
      assert.equal(seen.size, cells.length, `gate ${z} opening is connected`);
    }
  });

  test('openings shrink and the trench speeds up as the run goes on, up to caps', () => {
    const w = createWorld(SIZE, seeded(1));
    const [open0, speed0] = [openFor(w), speedFor(w)];
    w.spawned = 40;
    w.passed = 40;
    assert.ok(openFor(w) < open0);
    assert.ok(speedFor(w) > speed0);
    w.passed = 1e4;
    assert.equal(speedFor(w), SPEED_CAP);
    w.reducedMotion = true;
    assert.equal(speedFor(w), SPEED_CAP_REDUCED);
  });
});

describe('steering', () => {
  test('keys steer at SHIP_SPEED and stop at the walls', () => {
    const w = live();
    run(w, 0.25, () => ({ ...idle(), mx: 1, my: 1 }));
    assert.ok(Math.abs(w.sx - 0.25 * SHIP_SPEED) < 0.02);
    assert.ok(Math.abs(w.sy - 0.25 * SHIP_SPEED) < 0.02);
    run(w, 2, () => ({ ...idle(), mx: -1, my: -1 }));
    assert.equal(w.sx, -1 + w.hx);
    assert.equal(w.sy, -1 + w.hy);
  });

  test('a drag moves the ship as far as the finger moved, not to the finger', () => {
    const w = live();
    const down = { mx: 0, my: 0, px: 100, py: 400, grab: true };
    stepWorld(w, down, DT);
    run(w, 0.5, () => ({ ...down, px: 100 + w.halfW * 0.3, py: 400, grab: false }));
    assert.ok(Math.abs(w.sx - 0.3) < 1e-6, `sx ${w.sx}`);
    assert.ok(Math.abs(w.sy) < 1e-6);
  });

  test('input inside the start grace is the press that started the run', () => {
    const w = createWorld(SIZE, seeded(1));
    stepWorld(w, { ...idle(), mx: 1 }, DT);
    assert.equal(w.sx, 0);
  });
});

describe('crossing a gate', () => {
  test('a blocked cell ends the run', () => {
    const w = live();
    sitIn(w, MIDDLE);
    gateAhead(w, { mask: 1 << MIDDLE });
    stepWorld(w, idle(), DT);
    assert.equal(w.dead, true);
    assert.ok(w.events & EVENT_HIT);
    assert.equal(w.score, 0);
  });

  test('an open cell scores the gate', () => {
    const w = live();
    sitIn(w, MIDDLE);
    gateAhead(w, { mask: (1 << CELLS) - 1 - (1 << MIDDLE) });
    stepWorld(w, idle(), DT);
    assert.equal(w.dead, false);
    assert.equal(w.score, GATE_SCORE);
    assert.ok(w.events & EVENT_PASS);
  });

  test('a ship that clips the edge of a blocked cell hits it', () => {
    const w = live();
    sitIn(w, MIDDLE);
    w.sx += 1 / GRID - w.hx / 2;
    gateAhead(w, { mask: 1 << (MIDDLE + 1) });
    stepWorld(w, idle(), DT);
    assert.equal(w.dead, true);
  });

  test('flying through an orb scores it; flying past does not', () => {
    for (const [cell, scored] of [
      [MIDDLE, true],
      [0, false],
    ]) {
      const w = live();
      sitIn(w, MIDDLE);
      gateAhead(w, { orb: cell });
      stepWorld(w, idle(), DT);
      assert.equal(w.score, GATE_SCORE + (scored ? ORB_SCORE : 0));
      assert.equal(Boolean(w.events & EVENT_ORB), scored);
    }
  });

  test("a port's ring is worth its bonus; missing it scores nothing", () => {
    for (const [cell, score] of [
      [MIDDLE, PORT_SCORE],
      [0, 0],
    ]) {
      const w = live();
      sitIn(w, MIDDLE);
      gateAhead(w, { port: cell });
      stepWorld(w, idle(), DT);
      assert.equal(w.dead, false);
      assert.equal(w.score, score);
      assert.equal(Boolean(w.events & EVENT_PORT), score > 0);
    }
  });
});

test('a resize keeps the ship and the gates where they are in the trench', () => {
  const w = createWorld(SIZE, seeded(3));
  w.graceT = 99;
  run(w, 1.5, () => ({ ...idle(), mx: 1 }));
  const before = { sx: w.sx, sy: w.sy, z: w.gates.map((g) => g.z) };
  resizeWorld(w, { width: 375, height: 667 });
  assert.equal(w.width, 375);
  assert.ok(Math.abs(w.sx - Math.min(before.sx, 1 - w.hx)) < 1e-9);
  assert.deepEqual(
    w.gates.map((g) => g.z),
    before.z,
  );
});
