import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BENJO_HALF_W, BUG_H, RUN_ACCEL } from '../../../src/games/tower/tuning.js';
import { bugSpeedFor, createWorld, floorAt, stepWorld } from '../../../src/games/tower/world.js';
import { freezeWorld, thawWorld } from '../../../src/shell/world-copy.js';
import { DT } from '../runner/fake-host.js';

/** A seeded generator (mulberry32) whose state can be copied, so a plan can be tried ahead. */
function forkable(seed) {
  const rng = { a: seed >>> 0 };
  rng.next = () => {
    rng.a = (rng.a + 0x6d2b79f5) >>> 0;
    let t = rng.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return rng;
}

/** Land at least this far from a bug, in tower units. */
const BUG_CLEAR = 34;
/** Steer within this of the landing spot. */
const DEADBAND = 4;
/** Close enough under the landing spot, and slow enough, to jump one floor straight up. */
const LINE_UP = 14;
const SLOW = 90;

/** About how long a one-floor jump takes to land. */
const AIRTIME = 0.57;

/** Where a floor's bug will be in `t` seconds, bouncing off the floor's ends. */
function bugLater(f, t) {
  const lo = f.x + BUG_H / 2;
  const hi = f.x + f.w - BUG_H / 2;
  const span = Math.max(1, hi - lo);
  let d = (f.bx - lo + f.bdir * bugSpeedFor(f.n) * t) % (2 * span);
  if (d < 0) d += 2 * span;
  return lo + (d <= span ? d : 2 * span - d);
}

/**
 * Where to land on the floor above, jumping from `from`: the spot, among its two ends and its
 * middle, that keeps Benjo's whole path from `from` to it farthest from where the floor's bug
 * will be while he rises past it and lands. Safe when that is more than BUG_CLEAR.
 */
function landingSpot(f, from) {
  const lo = f.x + BENJO_HALF_W;
  const hi = f.x + f.w - BENJO_HALF_W;
  if (!f.bug) return { x: (lo + hi) / 2, safe: true };
  const bugs = [bugLater(f, AIRTIME / 2), bugLater(f, AIRTIME)];
  /** The closest the path from `from` to `x` comes to the bug. */
  const clearance = (x) => {
    const a = Math.min(from, x);
    const b = Math.max(from, x);
    return Math.min(...bugs.map((bug) => (bug < a ? a - bug : bug > b ? bug - b : 0)));
  };
  let best = lo;
  for (const x of [lo, (lo + hi) / 2, hi]) if (clearance(x) > clearance(best)) best = x;
  return { x: best, safe: clearance(best) > BUG_CLEAR };
}

/** Run toward a spot `gap` away, braking in time to stop on it, as a player eases off. */
function steer(w, gap) {
  const stop = (w.vx * w.vx) / (2 * RUN_ACCEL);
  if (Math.sign(w.vx) === Math.sign(gap) && Math.abs(gap) <= stop + DEADBAND)
    return -Math.sign(w.vx);
  if (Math.abs(gap) > DEADBAND) return Math.sign(gap);
  return Math.abs(w.vx) > SLOW ? -Math.sign(w.vx) : 0;
}

/**
 * The autopilot's own judgement, on the keys: one floor at a time. Standing, it lines up under its
 * landing spot on the floor above when its own floor reaches that far, then jumps as soon as it
 * can land away from that floor's bug. It jumps at once when a bug on its own floor comes close
 * or the view is about to catch it. In the air it steers for the landing spot.
 */
function heuristic(w, state) {
  const intent = { mx: 0, jump: false, px: null };
  if (w.on >= 0) {
    const here = floorAt(w, w.on);
    const above = floorAt(w, w.on + 1);
    const ends = [here.x + BENJO_HALF_W, here.x + here.w - BENJO_HALF_W];
    const reach = (x) => Math.min(ends[1], Math.max(ends[0], x));
    const spot = landingSpot(above, reach(landingSpot(above, w.x).x));
    state.target = spot.x;
    const under = reach(spot.x);
    // Never walk through the bug on this floor to get there.
    // A bug coming this way blocks from farther off.
    const margin = BUG_CLEAR + (Math.sign(w.x - here.bx) === here.bdir ? BUG_CLEAR : 0);
    const blocked =
      here.bug &&
      Math.min(w.x, under) - margin < here.bx &&
      here.bx < Math.max(w.x, under) + margin;
    // A running jump goes two floors up, so it slows down first.
    const lined = Math.abs(under - w.x) < LINE_UP && Math.abs(w.vx) < SLOW;
    const near = here.bug && Math.abs(here.bx - w.x) < BUG_CLEAR + BUG_H;
    const late = w.y - w.camY < 60;
    intent.jump = (spot.safe && lined) || near || late;
    // A jump forced with no safe landing goes straight up and comes back down.
    if (intent.jump && !spot.safe) state.target = w.x;
    intent.mx = intent.jump ? 0 : steer(w, blocked ? 0 : under - w.x);
    return intent;
  }
  intent.mx = steer(w, state.target - w.x);
  return intent;
}

/** Each plan holds its run and jump this many steps, then the heuristic flies on for LOOK. */
const HOLD = 12;
const LOOK = 54;
/** Plan again every REPLAN steps. */
const REPLAN = 6;
const PLANS = [-1, 0, 1].flatMap((mx) => [false, true].map((jump) => ({ mx, jump })));
/** Another move wins only if the heuristic's would die, or it ends at least a floor higher. */
const BETTER = 1000;

/** Play `plan` ahead on a copy of the world, and say how well it went. */
function tryPlan(w, rng, state, plan) {
  const fork = forkable(0);
  fork.a = rng.a;
  const sim = thawWorld(freezeWorld(w), fork.next);
  const simState = { ...state };
  for (let i = 0; i < HOLD + LOOK && !sim.dead; i++) {
    const intent =
      i < HOLD ? { mx: plan.mx, jump: plan.jump && i === 0, px: null } : heuristic(sim, simState);
    stepWorld(sim, intent, DT);
  }
  return sim.dead ? -1e9 : sim.best * 1000 + (sim.y - sim.camY);
}

/**
 * The spec's autopilot: the heuristic above, with a short lookahead. Every REPLAN steps it tries
 * each run and jump on a copy of the world for about a second, the heuristic flying the rest, and
 * keeps the heuristic's own move unless another one survives where it would not, or ends at least
 * a floor higher.
 * It sees no more than a player sees coming. If it reaches floor GOAL, the tower is climbable.
 */
function autopilot(w, rng, state) {
  const own = heuristic(w, state);
  if (state.hold > 0) {
    state.hold -= 1;
    return { ...state.plan, jump: false };
  }
  const ownScore = tryPlan(w, rng, state, { mx: own.mx, jump: own.jump });
  let best = null;
  for (const plan of PLANS) {
    const score = tryPlan(w, rng, state, plan);
    if (score >= ownScore + BETTER && (!best || score > best.score)) best = { ...plan, score };
  }
  if (!best) return own;
  state.plan = { mx: best.mx, jump: false, px: null };
  state.hold = REPLAN - 1;
  return { mx: best.mx, jump: best.jump, px: null };
}

const SIZES = [
  { width: 960, height: 540 },
  { width: 375, height: 667 },
  { width: 1440, height: 900 },
  { width: 320, height: 240 },
];

/** Seeds per size: the lookahead makes each run slow, so four. */
const SEEDS = 4;

/** The autopilot must climb this high without dying. Past it, narrower floors, more bugs, and a faster view make the tower deadly on purpose. */
const GOAL = 40;

for (const size of SIZES) {
  for (const reducedMotion of [false, true]) {
    test(`an autopilot climbs to floor ${GOAL} at ${size.width}x${size.height}${reducedMotion ? ' with reduced motion' : ''}`, () => {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const rng = forkable(seed);
        const w = createWorld(size, rng.next, { reducedMotion });
        const state = { target: w.x, hold: 0 };
        for (let i = 0; i < 120 * 60 && !w.dead && w.best < GOAL; i++) {
          stepWorld(w, autopilot(w, rng, state), DT);
        }
        assert.equal(
          w.dead,
          false,
          `seed ${seed}: ${w.hit} at ${w.time.toFixed(1)} s, floor ${w.best}`,
        );
        assert.ok(w.best >= GOAL, `seed ${seed} reached only floor ${w.best}`);
      }
    });
  }
}

test('a Benjo who never jumps falls behind once the view starts climbing', () => {
  const w = createWorld({ width: 960, height: 540 }, forkable(1).next);
  w.best = 5;
  for (let i = 0; i < 30 * 60 && !w.dead; i++) stepWorld(w, { mx: 0, jump: false, px: null }, DT);
  assert.equal(w.hit, 'fall');
});
