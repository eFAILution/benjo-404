import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DOWN, LEFT, NONE, RIGHT, START_GRACE, UP } from '../../../src/games/tail/tuning.js';
import { createWorld, DX, DY, reverse, segment, stepWorld } from '../../../src/games/tail/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const PAGES = 20;

/** Inside the grid and free on the next move (the departing tip counts as free). */
function free(w, d) {
  const x = w.xs[w.head] + DX[d];
  const y = w.ys[w.head] + DY[d];
  if (x < 0 || y < 0 || x >= w.cols || y >= w.rows) return false;
  if (!w.occupied[y * w.cols + x]) return true;
  const tip = segment(w, w.length - 1);
  const eating = x === w.foodX && y === w.foodY;
  return !eating && x === w.xs[tip] && y === w.ys[tip];
}

/** Free cells reachable from the cell one step away (a flood fill over the occupancy map). */
function room(w, d) {
  const start = (w.ys[w.head] + DY[d]) * w.cols + w.xs[w.head] + DX[d];
  const seen = new Uint8Array(w.cols * w.rows);
  const stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop();
    count += 1;
    const x = i % w.cols;
    const y = Math.floor(i / w.cols);
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      const j = ny * w.cols + nx;
      if (nx < 0 || ny < 0 || nx >= w.cols || ny >= w.rows || seen[j] || w.occupied[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return count;
}

/**
 * Safe: inside the grid, free next move, and not a pocket too small to hold the snake. The
 * pocket check is one flood fill; without it a one-step greedy walks into U-shaped dead ends
 * that no food placement could avoid.
 */
const safe = (w, d) => d !== reverse(w.dir) && free(w, d) && room(w, d) >= w.length;

/**
 * A greedy autopilot: head for the food along the axis that shortens the Manhattan distance,
 * and take any safe non-reversing turn when that way is blocked. It decides once per move.
 */
function makePilot() {
  let decidedAt = -1;
  return (w) => {
    if (w.ready) return w.time > START_GRACE ? RIGHT : NONE;
    if (w.queued || w.head === decidedAt) return NONE;
    decidedAt = w.head;
    const dx = w.foodX - w.xs[w.head];
    const dy = w.foodY - w.ys[w.head];
    const wants = [];
    if (dx) wants.push(dx > 0 ? RIGHT : LEFT);
    if (dy) wants.push(dy > 0 ? DOWN : UP);
    if (Math.abs(dy) > Math.abs(dx)) wants.reverse();
    const pick = [...wants, w.dir, RIGHT, DOWN, LEFT, UP].find((d) => safe(w, d));
    return pick === undefined || pick === w.dir ? NONE : pick;
  };
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
    test(`a greedy autopilot eats ${PAGES} pages at ${size.width}x${size.height}${reducedMotion ? ' with reduced motion' : ''}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld(size, seeded(seed), { reducedMotion });
        const autopilot = makePilot();
        for (let i = 0; i < 600 * 60 && !w.dead && w.score < PAGES; i++) {
          stepWorld(w, autopilot(w), DT);
        }
        assert.equal(w.dead, false, `seed ${seed} hit the ${w.hit} at ${w.score} pages`);
        assert.ok(w.score >= PAGES, `seed ${seed} ate only ${w.score}`);
      }
    });
  }
}
