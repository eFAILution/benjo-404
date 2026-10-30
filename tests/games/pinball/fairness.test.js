import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { makeBall } from '../../../src/games/pinball/physics.js';
import { loseBall } from '../../../src/games/pinball/rules.js';
import { createWorld, stepWorld } from '../../../src/games/pinball/table.js';
import { TABLE_W } from '../../../src/games/pinball/tuning.js';
import { seeded } from '../runner/fake-host.js';
import { createBot } from './bot.js';

const DT = 1 / 60;

/** Play a whole game with the bot. */
function botGame(seed) {
  const w = createWorld(seeded(seed));
  const bot = createBot();
  let seconds = 0;
  let escaped = 0;
  const decks = new Set();
  while (!w.ended && seconds < 900) {
    stepWorld(w, bot(w, DT), DT);
    if (w.lost) loseBall(w);
    for (const b of w.balls) if (b.x < -2 || b.x > TABLE_W + 2 || b.y < -2) escaped += 1;
    decks.add(w.deck);
    seconds += DT;
  }
  return { w, seconds, escaped, decks };
}

describe('pinball fairness', () => {
  test('a simple bot plays a real game on every seed: it lasts, scores, and ends', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { w, seconds, escaped } = botGame(seed);
      assert.equal(w.ended, true, `seed ${seed} ends`);
      assert.ok(seconds > 60, `seed ${seed} lasts ${seconds.toFixed(0)}s`);
      assert.ok(w.score > 50000, `seed ${seed} scores ${w.score}`);
      assert.equal(escaped, 0, `seed ${seed} keeps the ball on the table`);
    }
  });

  test('across seeds the bot repairs systems', () => {
    const runs = [1, 2, 3, 4, 5, 6].map(botGame);
    assert.ok(runs.some((r) => r.w.repaired > 0));
  });

  test('the ramp up to the bridge can be made with a flipper shot, but not every time', () => {
    const idle = {
      left: false,
      right: false,
      pull: false,
      nudge: false,
      leftPressed: false,
      rightPressed: false,
    };
    let tries = 0;
    let made = 0;
    for (let x = 120; x <= 260; x += 8) {
      for (let delay = 0; delay < 30; delay += 3) {
        const w = createWorld(seeded(1), { reducedMotion: true });
        w.balls = [{ ...makeBall(x, 440), vy: 300 }];
        tries += 1;
        for (let i = 0; i < 180 && w.balls.length && w.deck === 'hull'; i++) {
          stepWorld(w, { ...idle, left: i >= delay && i < delay + 20 }, DT);
        }
        if (w.deck === 'bridge') made += 1;
      }
    }
    assert.ok(made > 0, 'the ramp is makeable');
    assert.ok(made < tries / 4, 'and takes aim');
  });
});
