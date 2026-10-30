import assert from 'node:assert/strict';
import { test } from 'node:test';

import { back, DX, DY, distances, isOpen, step } from '../../../src/games/benjotower/maze.js';
import { createWorld, posX, posY, stepWorld } from '../../../src/games/benjotower/world.js';
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

/** Turn to face and walk into an enemy this close, in cells. */
const ENGAGE = 1.6;
/** Stop and raise the shield for a bolt this close coming straight at Benjo. */
const BOLT_WARN = 2.5;

/** Benjo's cell, or the next one once he's past halfway. */
const cellOf = (b) => (b.dir >= 0 && b.t > 0.5 ? step(b.cell, b.dir) : b.cell);

/** The way from cell `i` that heads down the maze toward `goal`. */
function toward(w, i, goal) {
  const dist = distances(w.open, goal);
  let best = -1;
  for (let d = 0; d < 4; d++) {
    if (isOpen(w.open, i, d) && (best < 0 || dist[step(i, d)] < dist[step(i, best)])) best = d;
  }
  return best;
}

/**
 * The autopilot's own judgement, on the keys: walk the shortest way to the key, then the door. Turn and
 * walk into any enemy that comes close, so the sword meets it head-on. Stop, shield up, when a
 * bolt is coming straight at Benjo.
 */
function heuristic(w) {
  const b = w.benjo;
  const bx = posX(b);
  const by = posY(b);
  for (const s of w.bolts) {
    if (!s.active) continue;
    const dx = bx - s.x;
    const dy = by - s.y;
    const coming = dx * DX[s.dir] + dy * DY[s.dir];
    const side = Math.abs(dx * DY[s.dir]) + Math.abs(dy * DX[s.dir]);
    if (coming > 0 && coming < BOLT_WARN && side < 0.3) return { dir: -1 };
  }
  let near = null;
  for (const e of w.enemies) {
    if (!e.active || e.phase === 'hide') continue;
    const d = Math.hypot(posX(e) - bx, posY(e) - by);
    if (d < ENGAGE && (!near || d < near.d)) near = { e, d };
  }
  const here = cellOf(b);
  if (near) {
    const dx = posX(near.e) - bx;
    const dy = posY(near.e) - by;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    return { dir };
  }
  const goal = w.hasKey ? w.door : w.key;
  // Inside the goal's cell, head for its middle.
  if (here === goal) return { dir: b.cell === goal ? (b.dir >= 0 ? back(b.dir) : -1) : b.dir };
  return { dir: toward(w, here, goal) };
}

/** Each plan holds its way this many steps, then the heuristic plays on for LOOK. */
const HOLD = 10;
const LOOK = 50;
const REPLAN = 5;
/** Another way wins only if the heuristic's would lose a life, or it ends far better off. */
const BETTER = 100;
const PLANS = [-1, 0, 1, 2, 3];

/** How well things stand: lives, then the floor, then the key, then the score. */
const worth = (w) => w.lives * 1e6 + w.floor * 1e4 + (w.hasKey ? 1e3 : 0) + w.score;

/** Play `dir` ahead on a copy of the world, and say how well it went. */
function tryPlan(w, rng, dir) {
  const fork = forkable(0);
  fork.a = rng.a;
  const sim = thawWorld(freezeWorld(w), fork.next);
  for (let i = 0; i < HOLD + LOOK && !sim.dead; i++) {
    stepWorld(sim, i < HOLD ? { dir } : heuristic(sim), DT);
  }
  return worth(sim);
}

/**
 * The spec's autopilot: the heuristic above, with a short lookahead. Every REPLAN steps it tries
 * each way, and standing still, on a copy of the world for about a second, the heuristic playing
 * the rest, and keeps the heuristic's way unless another keeps a life it would lose, or ends far
 * better off. It sees no more than a player sees coming. If it climbs floors with lives to
 * spare, the tower is beatable from the keyboard.
 */
function autopilot(w, rng, state) {
  state.tick = (state.tick + 1) % REPLAN;
  if (state.hold > 0) {
    state.hold -= 1;
    return { dir: state.dir };
  }
  const own = heuristic(w);
  if (state.tick !== 0) return own;
  const ownWorth = tryPlan(w, rng, own.dir);
  let best = null;
  for (const dir of PLANS) {
    const score = tryPlan(w, rng, dir);
    if (score >= ownWorth + BETTER && (!best || score > best.score)) best = { dir, score };
  }
  if (!best) return own;
  state.dir = best.dir;
  state.hold = REPLAN - 1;
  return { dir: best.dir };
}

/** Floors to clear, and seeds to clear them on: the lookahead makes each run slow. */
const FLOORS = 3;
const SEEDS = 4;

for (const reducedMotion of [false, true]) {
  test(`an autopilot clears ${FLOORS} floors without a game over${reducedMotion ? ' with reduced motion' : ''}`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rng = forkable(seed);
      const w = createWorld({ width: 960, height: 540 }, rng.next, { reducedMotion });
      const state = { hold: 0, dir: -1, tick: 0 };
      for (let i = 0; i < 240 * 60 && !w.dead && w.floor <= FLOORS; i++) {
        stepWorld(w, autopilot(w, rng, state), DT);
      }
      assert.equal(
        w.dead,
        false,
        `seed ${seed}: ${w.hit} at ${w.time.toFixed(1)} s, floor ${w.floor}`,
      );
      assert.ok(w.floor > FLOORS, `seed ${seed} reached only floor ${w.floor}`);
    }
  });
}

test('a Benjo who stands still loses every life', () => {
  const w = createWorld({ width: 960, height: 540 }, forkable(1).next);
  for (let i = 0; i < 240 * 60 && !w.dead; i++) stepWorld(w, { dir: -1 }, DT);
  assert.equal(w.dead, true);
});
