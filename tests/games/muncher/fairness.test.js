import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  benjoCanEnter,
  COLS,
  createWorld,
  DX,
  DY,
  ROWS,
  stepWorld,
} from '../../../src/games/muncher/world.js';
import { DT, seeded } from '../runner/fake-host.js';

/** How many cells around a dangerous cache miss the pilot keeps clear of, tried widest first. */
const REACHES = [3, 2, 1, 0];
/** Search this far when fleeing. */
const FLEE_DEPTH = 40;

/** Cache misses that can catch Benjo: out of the pen, or on their way out, and not gray. */
const dangerous = (w) => w.misses.filter((m) => m.state !== 'pen' && !m.frightened);

/** Every cell a dangerous cache miss could reach in `reach` cells, from where it is or is going. */
function dangerMap(w, reach) {
  const danger = new Uint8Array(COLS * ROWS);
  for (const m of dangerous(w)) {
    let frontier = [[m.col, m.row]];
    if (m.dir >= 0) frontier.push([m.col + DX[m.dir], m.row + DY[m.dir]]);
    for (const [c, r] of frontier) danger[r * COLS + c] = 1;
    for (let k = 0; k < reach; k++) {
      const next = [];
      for (const [c, r] of frontier) {
        for (let d = 0; d < 4; d++) {
          const nc = c + DX[d];
          const nr = r + DY[d];
          if (!benjoCanEnter(nc, nr) || danger[nr * COLS + nc]) continue;
          danger[nr * COLS + nc] = 1;
          next.push([nc, nr]);
        }
      }
      frontier = next;
    }
  }
  return danger;
}

/** First direction on the shortest path to the nearest byte that avoids `danger`, or -1. */
function towardByte(w, c0, r0, danger) {
  const first = new Int8Array(COLS * ROWS).fill(-2);
  first[r0 * COLS + c0] = -1;
  const queue = [[c0, r0]];
  for (let head = 0; head < queue.length; head++) {
    const [c, r] = queue[head];
    if (head > 0 && w.bytes[r * COLS + c] > 0) return first[r * COLS + c];
    for (let d = 0; d < 4; d++) {
      const nc = c + DX[d];
      const nr = r + DY[d];
      const i = nr * COLS + nc;
      if (!benjoCanEnter(nc, nr) || first[i] !== -2 || danger[i]) continue;
      first[i] = head === 0 ? d : first[r * COLS + c];
      queue.push([nc, nr]);
    }
  }
  return -1;
}

/** Grid steps from a cell to the nearest dangerous cache miss. */
function stepsToDanger(w, c0, r0) {
  const at = new Set(dangerous(w).map((m) => m.row * COLS + m.col));
  const seen = new Uint8Array(COLS * ROWS);
  seen[r0 * COLS + c0] = 1;
  let frontier = [[c0, r0]];
  for (let k = 0; k < FLEE_DEPTH; k++) {
    const next = [];
    for (const [c, r] of frontier) {
      if (at.has(r * COLS + c)) return k;
      for (let d = 0; d < 4; d++) {
        const nc = c + DX[d];
        const nr = r + DY[d];
        if (!benjoCanEnter(nc, nr) || seen[nr * COLS + nc]) continue;
        seen[nr * COLS + nc] = 1;
        next.push([nc, nr]);
      }
    }
    frontier = next;
  }
  return FLEE_DEPTH;
}

/**
 * Head for the nearest byte by a path that keeps clear of the cache misses, accepting less room
 * when there is no other way; with no safe path at all, run to the neighbor farthest from them.
 * If it clears the maze, a level leaves a way through.
 */
function pilot(w) {
  const b = w.benjo;
  const moving = b.dir >= 0 && b.t > 0;
  const c = moving ? b.col + DX[b.dir] : b.col;
  const r = moving ? b.row + DY[b.dir] : b.row;
  for (const reach of REACHES) {
    const d = towardByte(w, c, r, dangerMap(w, reach));
    if (d >= 0) return d;
  }
  let best = -1;
  let bestSteps = -1;
  for (let d = 0; d < 4; d++) {
    if (!benjoCanEnter(c + DX[d], r + DY[d])) continue;
    const steps = stepsToDanger(w, c + DX[d], r + DY[d]);
    if (steps > bestSteps) [best, bestSteps] = [d, steps];
  }
  return best;
}

const SIZES = [
  { width: 960, height: 540 },
  { width: 375, height: 667 },
];

for (const size of SIZES) {
  for (const reducedMotion of [false, true]) {
    test(`an autopilot clears level 1 at ${size.width}x${size.height}${reducedMotion ? ' with reduced motion' : ''}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld(size, seeded(seed), { reducedMotion });
        const intent = { dir: -1 };
        for (let i = 0; i < 150 * 60 && !w.dead && w.level < 2; i++) {
          intent.dir = w.time > 0.2 ? pilot(w) : -1;
          stepWorld(w, intent, DT);
        }
        assert.equal(w.level, 2, `seed ${seed} stopped on level 1 with ${w.left} bytes left`);
        assert.ok(w.lives >= 1, `seed ${seed}`);
      }
    });
  }
}
