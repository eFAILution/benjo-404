import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DECKS } from '../../../src/games/pinball/decks.js';
import {
  hitFlipper,
  hitSeg,
  makeBall,
  moveBall,
  restAngle,
  swing,
} from '../../../src/games/pinball/physics.js';
import { MAX_SPEED, SUBSTEPS, TABLE_W } from '../../../src/games/pinball/tuning.js';
import { seeded } from '../runner/fake-host.js';

const DT = 1 / 60;
const H = DT / SUBSTEPS;
const restFlippers = (deck) => deck.flippers.map((s) => ({ a: restAngle(s.side), w: 0 }));

/** Is (x, y) inside the polygon? */
function inside(points, x, y) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

describe('pinball physics', () => {
  test('a ball at top speed never leaves any deck through a wall', () => {
    const random = seeded(3);
    for (const deck of Object.values(DECKS)) {
      // The outline is open at the drain; close it well below the table to test the sides.
      const shape = [...deck.outline, [deck.outline.at(-1)[0], 2000], [deck.outline[0][0], 2000]];
      for (let n = 0; n < 60; n++) {
        const b = makeBall(60 + random() * 280, 140 + random() * 300);
        if (!inside(shape, b.x, b.y)) continue;
        const a = random() * Math.PI * 2;
        b.vx = Math.cos(a) * MAX_SPEED;
        b.vy = Math.sin(a) * MAX_SPEED;
        const flippers = restFlippers(deck);
        for (let i = 0; i < 120 * SUBSTEPS && b.y < 640; i++) {
          deck.flippers.forEach((s, k) => {
            swing(flippers[k], s.side, i % 200 < 60, H);
          });
          moveBall(
            b,
            deck,
            flippers,
            () => true,
            H,
            () => {},
          );
          assert.ok(b.x > -1 && b.x < TABLE_W + 1 && b.y > -1, `${deck.id} ${b.x},${b.y}`);
        }
      }
    }
  });

  test('a wall bounces a ball back out and keeps it touching distance away', () => {
    const b = makeBall(100, 96);
    b.vy = 500;
    const hit = hitSeg(b, { ax: 0, ay: 100, bx: 200, by: 100, k: 'wall', id: 0 });
    assert.ok(hit > 400);
    assert.ok(b.vy < 0);
    assert.ok(Math.abs(b.y - 92) < 1e-6);
  });

  test('a one-way gate lets a ball up through it and stops one falling on it', () => {
    const gate = { ax: 394, ay: 175, bx: 364, by: 200, k: 'wall', id: 0, one: true };
    const up = makeBall(379, 192);
    up.vy = -900;
    assert.equal(hitSeg(up, gate), -1);
    const down = makeBall(379, 182);
    down.vy = 300;
    assert.ok(hitSeg(down, gate) > 0);
    assert.ok(down.vy < 300);
  });

  test('the tip of a swinging flipper hits harder than its base', () => {
    const spot = DECKS.hull.flippers[0];
    const speedAt = (t) => {
      const f = { a: restAngle(1), w: 0 };
      swing(f, 1, true, H);
      const x = spot.x + Math.cos(f.a) * spot.len * t;
      const y = spot.y + Math.sin(f.a) * spot.len * t - 12;
      const b = makeBall(x, y);
      hitFlipper(b, spot, f);
      return Math.hypot(b.vx, b.vy);
    };
    assert.ok(speedAt(0.95) > speedAt(0.15) * 2);
  });

  test('a held flipper cradles a ball', () => {
    const deck = DECKS.hull;
    const flippers = restFlippers(deck);
    for (let i = 0; i < 40; i++) swing(flippers[0], 1, true, H);
    const spot = deck.flippers[0];
    const b = makeBall(spot.x + 30, spot.y - 40);
    for (let i = 0; i < 120 * SUBSTEPS; i++) {
      swing(flippers[0], 1, true, H);
      moveBall(
        b,
        deck,
        flippers,
        () => true,
        H,
        () => {},
      );
    }
    assert.ok(b.y < spot.y, 'still on the flipper');
    assert.ok(Math.hypot(b.vx, b.vy) < 30, 'and at rest');
  });

  test('bumpers kick the ball away and report the hit', () => {
    const deck = { segs: [], rounds: [DECKS.hull.rounds[0]], flippers: [] };
    const r = deck.rounds[0];
    const b = makeBall(r.x, r.y - r.r - 7.5);
    b.vy = 200;
    const hits = [];
    moveBall(
      b,
      deck,
      [],
      () => true,
      H,
      (k, id) => hits.push([k, id]),
    );
    assert.deepEqual(hits, [['bumper', 0]]);
    assert.ok(b.vy < -400);
  });
});
