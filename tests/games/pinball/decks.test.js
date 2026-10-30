import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DECKS } from '../../../src/games/pinball/decks.js';
import { BALL_R, TABLE_H, TABLE_W } from '../../../src/games/pinball/tuning.js';

const decks = Object.values(DECKS);

/** Shortest distance from a point to a segment. */
function toSeg(x, y, s) {
  const ex = s.bx - s.ax;
  const ey = s.by - s.ay;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * ex + (y - s.ay) * ey) / (ex * ex + ey * ey)));
  return Math.hypot(x - s.ax - ex * t, y - s.ay - ey * t);
}

describe('pinball decks', () => {
  test('every piece sits inside the table', () => {
    for (const deck of decks) {
      for (const s of deck.segs) {
        for (const [x, y] of [
          [s.ax, s.ay],
          [s.bx, s.by],
        ]) {
          assert.ok(
            x >= 0 && x <= TABLE_W && y >= 0 && y <= TABLE_H,
            `${deck.id} ${s.k} ${x},${y}`,
          );
        }
      }
      for (const r of deck.rounds)
        assert.ok(r.x - r.r > 0 && r.x + r.r < TABLE_W, `${deck.id} round`);
    }
  });

  test('the outer wall is one unbroken run of walls', () => {
    for (const deck of decks) {
      const { outline } = deck;
      for (let i = 1; i < outline.length; i++) {
        const [ax, ay] = outline[i - 1];
        const [bx, by] = outline[i];
        const joined = deck.segs.some(
          (s) =>
            (Math.hypot(s.ax - ax, s.ay - ay) < 1e-6 && Math.hypot(s.bx - bx, s.by - by) < 1e-6) ||
            (Math.hypot(s.ax - bx, s.ay - by) < 1e-6 && Math.hypot(s.bx - ax, s.by - ay) < 1e-6),
        );
        assert.ok(joined, `${deck.id} gap at ${ax},${ay}`);
      }
    }
  });

  test('bumpers leave room for a ball between them and every wall', () => {
    for (const deck of decks) {
      const bumpers = deck.rounds.filter((r) => r.k !== 'post');
      for (const a of bumpers) {
        for (const b of bumpers) {
          if (a === b) continue;
          assert.ok(
            Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r + BALL_R * 2,
            `${deck.id} bumpers`,
          );
        }
        for (const s of deck.segs)
          assert.ok(toSeg(a.x, a.y, s) > a.r + BALL_R, `${deck.id} bumper by wall`);
      }
    }
  });

  test('every deck has two flippers, an entry inside it, and a way back down', () => {
    for (const deck of decks) {
      assert.deepEqual(
        deck.flippers.map((f) => f.side),
        [1, -1],
      );
      assert.ok(deck.entry.x > 0 && deck.entry.x < TABLE_W && deck.entry.y < TABLE_H);
      const [left, right] = deck.flippers;
      assert.ok(right.x - left.x > 0, `${deck.id} drain between flippers`);
    }
    assert.ok(DECKS.hull.plunger, 'the hull has the plunger');
    assert.ok(DECKS.hull.saucer, 'the hull has the hangar');
    assert.ok(
      DECKS.bridge.segs.some((s) => s.k === 'egg'),
      'the bridge has the Easter Eggs target',
    );
    assert.equal(DECKS.quarters.segs.filter((s) => s.k === 'letter').length, 5);
  });

  test('zones each have a direction and fit in the table', () => {
    for (const deck of decks) {
      for (const z of deck.zones) {
        assert.ok([-1, 0, 1].includes(z.dir));
        assert.ok(z.x >= 0 && z.x + z.w <= TABLE_W && z.y >= 0 && z.y + z.h <= TABLE_H);
      }
      assert.ok(deck.zones.length <= 31, 'one bit per zone fits in an int');
    }
  });
});
