import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  back,
  CELLS,
  carve,
  DX,
  distances,
  isOpen,
  step,
} from '../../../src/games/benjotower/maze.js';
import {
  BENJO_SPEED,
  CLEAR_T,
  EVENT_BLOCK,
  EVENT_KEY,
  EVENT_SLAY,
  FLOOR_SCORE,
  FLOOR_T,
  HIT_T,
  KEY_SCORE,
  KNIGHT_HP,
  LIVES,
  SLIME_SCORE,
  START_GRACE,
} from '../../../src/games/benjotower/tuning.js';
import {
  createWorld,
  posX,
  posY,
  resizeWorld,
  rosterFor,
  stepWorld,
} from '../../../src/games/benjotower/world.js';
import { DT, seeded } from '../runner/fake-host.js';

const SIZE = { width: 960, height: 540 };

/** Step `seconds` with `intent(w)`. */
function run(w, seconds, intent = () => ({ dir: -1 })) {
  for (let i = 0; i < Math.round(seconds / DT) && !w.dead; i++) stepWorld(w, intent(w), DT);
  return w;
}

/** A world past the start grace with no enemies. */
function live(seed = 1) {
  const w = run(createWorld(SIZE, seeded(seed)), START_GRACE + DT);
  for (const e of w.enemies) e.active = false;
  return w;
}

/** An open way out of Benjo's cell. */
const openWay = (w) => [0, 1, 2, 3].find((d) => isOpen(w.open, w.benjo.cell, d));

/** Put an enemy of `kind` standing in cell `cell`. */
function enemyAt(w, kind, cell) {
  const e = w.enemies[0];
  Object.assign(e, {
    active: true,
    kind,
    cell,
    dir: -1,
    t: 0,
    hp: kind === 'knight' ? KNIGHT_HP : 1,
    hurtT: 0,
    phase: 'show',
    timer: 99,
    cast: false,
    castDir: 0,
  });
  e.prevX = posX(e);
  e.prevY = posY(e);
  return e;
}

describe('maze', () => {
  test('every floor is one connected maze, with walls that match on both sides', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const open = carve(seeded(seed));
      assert.ok(
        distances(open, 0).every((d) => d >= 0),
        `seed ${seed} is connected`,
      );
      for (let i = 0; i < CELLS; i++) {
        for (let d = 0; d < 4; d++) {
          if (step(i, d) < 0) assert.equal(isOpen(open, i, d), false, 'the edge is closed');
          else assert.equal(isOpen(open, i, d), isOpen(open, step(i, d), back(d)));
        }
      }
    }
  });

  test('the key and the door sit far from the start and from each other', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = createWorld(SIZE, seeded(seed));
      const fromStart = distances(w.open, w.start);
      assert.ok(fromStart[w.key] >= 4, `seed ${seed} key`);
      assert.ok(
        fromStart[w.door] >= 3 && distances(w.open, w.key)[w.door] >= 3,
        `seed ${seed} door`,
      );
    }
  });

  test('higher floors bring more and tougher enemies', () => {
    assert.deepEqual(rosterFor(1), { slime: 2, knight: 0, mage: 0 });
    const later = rosterFor(8);
    assert.ok(later.slime > 2 && later.knight > 0 && later.mage > 0);
  });
});

describe('Benjo', () => {
  test('walks at BENJO_SPEED while a way is held, and stops when it is let go', () => {
    const w = live();
    const d = openWay(w);
    const [x0, y0] = [posX(w.benjo), posY(w.benjo)];
    run(w, 0.15, () => ({ dir: d }));
    const moved = Math.hypot(posX(w.benjo) - x0, posY(w.benjo) - y0);
    assert.ok(Math.abs(moved - BENJO_SPEED * (0.15 - DT)) < 0.06, `moved ${moved}`);
    run(w, 1);
    assert.equal(w.benjo.dir, -1, 'he stops at a cell middle');
  });

  test('turns to face a blocked way without moving', () => {
    const w = live();
    const blocked = [0, 1, 2, 3].find((d) => !isOpen(w.open, w.benjo.cell, d));
    run(w, 0.2, () => ({ dir: blocked }));
    assert.equal(w.benjo.cell, w.start);
    assert.equal(w.benjo.facing, blocked);
  });

  test('taking the key, then reaching the door, clears the floor and builds the next', () => {
    const w = live();
    const firstMaze = w.open.join();
    w.benjo.cell = w.key;
    let events = 0;
    stepWorld(w, { dir: -1 }, DT);
    events |= w.events;
    assert.ok(events & EVENT_KEY && w.hasKey);
    w.benjo.cell = w.door;
    const clock = w.clock;
    stepWorld(w, { dir: -1 }, DT);
    assert.equal(w.pause, 'clear');
    assert.ok(w.score >= KEY_SCORE + FLOOR_SCORE + Math.floor(clock) - 1);
    run(w, CLEAR_T + DT);
    assert.equal(w.floor, 2);
    assert.equal(w.hasKey, false);
    assert.notEqual(w.open.join(), firstMaze);
  });

  test('when the clock runs out, a life goes and the floor starts again', () => {
    const w = live();
    w.clock = DT / 2;
    stepWorld(w, { dir: -1 }, DT);
    assert.equal(w.lives, LIVES - 1);
    assert.equal(w.hit, 'time');
    run(w, HIT_T + DT);
    assert.ok(w.clock > FLOOR_T - 0.1);
    assert.equal(w.benjo.cell, w.start);
  });

  test('input inside the start grace is the press that started the run', () => {
    const w = createWorld(SIZE, seeded(1));
    stepWorld(w, { dir: 0 }, DT);
    assert.equal(w.benjo.dir, -1);
  });
});

describe('the sword and the shield', () => {
  /** Benjo in his cell facing way `d`, with an enemy of `kind` coming from the cell that way. */
  function facing(kind, side) {
    const w = live();
    const d = openWay(w);
    w.benjo.facing = side === 'front' ? d : back(d);
    const e = enemyAt(w, kind, step(w.start, d));
    Object.assign(e, { dir: back(d), t: 0.5 });
    return w;
  }

  test('a slime that meets the sword is slain', () => {
    const w = facing('slime', 'front');
    stepWorld(w, { dir: -1 }, DT);
    assert.equal(w.enemies[0].active, false);
    assert.ok(w.events & EVENT_SLAY);
    assert.equal(w.score, SLIME_SCORE);
    assert.equal(w.lives, LIVES);
  });

  test('a knight takes two hits', () => {
    const w = facing('knight', 'front');
    stepWorld(w, { dir: -1 }, DT);
    assert.equal(w.enemies[0].active, true);
    assert.equal(w.enemies[0].hp, KNIGHT_HP - 1);
  });

  test('an enemy that reaches Benjo from behind costs a life', () => {
    const w = facing('slime', 'back');
    stepWorld(w, { dir: -1 }, DT);
    assert.equal(w.lives, LIVES - 1);
    assert.equal(w.hit, 'enemy');
  });

  test('standing still, the shield stops a bolt; walking, it costs a life', () => {
    for (const walking of [false, true]) {
      const w = live();
      const d = openWay(w);
      const bolt = w.bolts[0];
      Object.assign(bolt, {
        active: true,
        x: posX(w.benjo) + DX[d] * 0.3,
        y: posY(w.benjo) + [-0.3, 0, 0.3, 0][d],
        dir: back(d),
      });
      if (walking) Object.assign(w.benjo, { dir: d, t: 0.01 });
      stepWorld(w, { dir: walking ? w.benjo.dir : -1 }, DT);
      if (walking) assert.equal(w.lives, LIVES - 1);
      else {
        assert.equal(w.lives, LIVES);
        assert.ok(w.events & EVENT_BLOCK);
      }
    }
  });
});

test('a resize keeps Benjo where he is in the maze', () => {
  const w = live();
  run(w, 0.2, () => ({ dir: openWay(w) }));
  const at = [posX(w.benjo), posY(w.benjo)];
  resizeWorld(w, { width: 375, height: 667 });
  assert.equal(w.width, 375);
  assert.deepEqual([posX(w.benjo), posY(w.benjo)], at);
  assert.ok(w.ox >= 0 && w.ox + 11 * w.k <= w.width);
});
