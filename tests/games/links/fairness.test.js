import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createWorld, stepWorld } from '../../../src/games/links/world.js';
import { DT, seeded } from '../runner/fake-host.js';

/** The solver acts once every PACE steps (0.2 s), about as fast as a quick player. */
const PACE = 12;
const BOARDS_TO_FIX = 5;

/**
 * A plain solver: find the first tile in reading order that is not at its solved mask, walk the
 * cursor there one arrow at a time, then turn it once. One action per pace, as a player would.
 * If it finishes five boards in time, the clock and the bonus are fair.
 */
function solver(w, intent) {
  intent.dx = 0;
  intent.dy = 0;
  intent.turn = false;
  intent.tapTile = -1;
  const b = w.board;
  let target = 0;
  while (target < b.cols * b.rows - 1 && b.mask[target] === b.solved[target]) target += 1;
  const dx = (target % b.cols) - (w.cursor % b.cols);
  const dy = Math.floor(target / b.cols) - Math.floor(w.cursor / b.cols);
  if (dx !== 0) intent.dx = Math.sign(dx);
  else if (dy !== 0) intent.dy = Math.sign(dy);
  else intent.turn = true;
  return intent;
}

const SIZES = [
  { width: 960, height: 540 },
  { width: 375, height: 667 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1080 },
  { width: 320, height: 240 },
];

const idle = { dx: 0, dy: 0, turn: false, tapTile: -1 };

for (const size of SIZES) {
  for (const reducedMotion of [false, true]) {
    test(`a paced solver fixes ${BOARDS_TO_FIX} boards at ${size.width}x${size.height}${reducedMotion ? ' with reduced motion' : ''}`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const w = createWorld(size, seeded(seed), { reducedMotion });
        const intent = { ...idle };
        for (let i = 0; !w.dead && w.solves < BOARDS_TO_FIX; i++) {
          const act = i > 10 && i % PACE === 0 && w.solvedT <= 0;
          stepWorld(w, act ? solver(w, intent) : idle, DT);
        }
        assert.equal(w.dead, false, `seed ${seed} ran out of time on round ${w.round}`);
        assert.equal(w.solves, BOARDS_TO_FIX);
        assert.ok(w.clock > 0);
      }
    });
  }
}
