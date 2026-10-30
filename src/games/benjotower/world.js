// @ts-check
// The Tower of Benjo world and its fixed step (#100). No DOM, no host: tests drive it directly.
//
// Benjo and the walking enemies are movers on the maze: a cell, a direction, and how far along
// they are to the next cell, so they turn only at cell middles and speeds are cells per second.
// Only layout() knows pixels, so a resize is a new layout. Pools are allocated in createWorld.

import { back, CELLS, carve, DX, DY, distances, isOpen, step } from './maze.js';
import {
  BENJO_SPEED,
  BOLT_CONTACT,
  BOLT_POOL,
  BOLT_SPEED,
  BOTTOM_PAD,
  CEILING,
  CEILING_NARROW,
  CLEAR_T,
  COLS,
  CONTACT,
  ENEMY_POOL,
  EVENT_BLOCK,
  EVENT_CAST,
  EVENT_CLEAR,
  EVENT_HIT,
  EVENT_KEY,
  EVENT_SLAY,
  FLOOR_SCORE,
  FLOOR_T,
  FRONT,
  GRACE_T,
  HIT_T,
  HURT_T,
  KEY_SCORE,
  KNIGHT_HP,
  KNIGHT_SCORE,
  KNIGHT_SPEED,
  LIVES,
  MAGE_CAST,
  MAGE_HIDE,
  MAGE_HIDE_JITTER,
  MAGE_LINGER,
  MAGE_SCORE,
  MIN_HEIGHT,
  MIN_WIDTH,
  NARROW_WIDTH,
  REACH,
  ROWS,
  SHAKE_T,
  SIDE_PAD,
  SLIME_SCORE,
  SLIME_SPEED,
  SPAWN_GAP,
  SPEED_GROWTH,
  SPEED_GROWTH_MAX,
  START_GRACE,
  TIME_SCORE,
} from './tuning.js';

/** @typedef {{ width: number, height: number }} Area */
/** The way the player wants Benjo to walk: 0 up, 1 right, 2 down, 3 left, or -1 to stop. @typedef {{ dir: number }} Intent */
/** @typedef {{ cell: number, dir: number, t: number, prevX: number, prevY: number }} Mover */
/**
 * A slime wanders, a knight chases, a mage hides, then shows in line with Benjo, casts, and goes.
 * @typedef {Mover & { active: boolean, kind: 'slime' | 'knight' | 'mage', hp: number,
 *   hurtT: number, phase: 'hide' | 'show', timer: number, cast: boolean, castDir: number }} Enemy
 */
/** @typedef {{ active: boolean, x: number, y: number, prevX: number, prevY: number, dir: number }} Bolt */
/**
 * Power-up help from the host (#22), read during a step.
 * @typedef {{ absorb?: () => boolean }} Powers
 */
/**
 * @typedef {object} World
 * @property {number} width
 * @property {number} height
 * @property {number} ceiling
 * @property {number} bottom
 * @property {number} ox screen x of the maze's left edge
 * @property {number} oy screen y of the maze's top edge
 * @property {number} k px per cell
 * @property {number[]} open each cell's open sides as bits
 * @property {number} start
 * @property {number} key
 * @property {number} door
 * @property {boolean} hasKey
 * @property {Mover & { facing: number }} benjo
 * @property {number} floor
 * @property {number} lives
 * @property {number} score
 * @property {number} clock seconds left on this floor
 * @property {number} pauseT pause left after a lost life or a cleared floor, 0 when playing
 * @property {'hit' | 'clear' | null} pause
 * @property {number} time seconds since start
 * @property {boolean} dead the run is over
 * @property {'enemy' | 'bolt' | 'time' | null} hit what took the last life
 * @property {number} deadT
 * @property {number} graceT seconds left of the Digital Twin's grace, 0 when none
 * @property {number} shakeT
 * @property {number} events EVENT_* bits raised by the last step
 * @property {boolean} reducedMotion
 * @property {() => number} random
 * @property {Enemy[]} enemies
 * @property {Bolt[]} bolts
 */

/** No power-ups: what a step gets from a host without them. @type {Powers} */
const NO_POWERS = {};

/** @param {Area} size */
export function layout(size) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const ceiling = size.width < NARROW_WIDTH ? CEILING_NARROW : CEILING;
  const bottom = height - BOTTOM_PAD;
  const k = Math.min((width - 2 * SIDE_PAD) / COLS, (bottom - ceiling) / ROWS);
  return {
    width,
    height,
    ceiling,
    bottom,
    k,
    ox: (width - COLS * k) / 2,
    oy: ceiling + (bottom - ceiling - ROWS * k) / 2,
  };
}

/** A mover's middle, in cells. @param {Mover} m */
export const posX = (m) => (m.cell % COLS) + 0.5 + (m.dir >= 0 ? DX[m.dir] * m.t : 0);
/** @param {Mover} m */
export const posY = (m) => Math.floor(m.cell / COLS) + 0.5 + (m.dir >= 0 ? DY[m.dir] * m.t : 0);

/** Enemies get a little faster each floor. @param {World} w @param {number} speed */
const paced = (w, speed) => speed * Math.min(SPEED_GROWTH_MAX, 1 + SPEED_GROWTH * (w.floor - 1));

/** How many of each enemy a floor has. @param {number} floor */
export function rosterFor(floor) {
  return {
    slime: Math.min(6, 2 + Math.floor(floor / 2)),
    knight: Math.min(3, Math.floor(floor / 3)),
    mage: floor < 4 ? 0 : Math.min(2, 1 + Math.floor((floor - 4) / 4)),
  };
}

/** Pick a random cell from those that pass `ok`. @param {World} w @param {(i: number) => boolean} ok */
function pickCell(w, ok) {
  const cells = [];
  for (let i = 0; i < CELLS; i++) if (ok(i)) cells.push(i);
  return cells.length ? cells[Math.floor(w.random() * cells.length)] : -1;
}

/**
 * A new maze, with the key far from the start and the door far from both.
 * @param {World} w
 */
function newFloor(w) {
  w.open = carve(w.random);
  w.start = Math.floor(w.random() * CELLS);
  const fromStart = distances(w.open, w.start);
  const far = Math.max(...fromStart);
  w.key = pickCell(w, (i) => fromStart[i] >= far * 0.6);
  const fromKey = distances(w.open, w.key);
  let door = w.key;
  for (let i = 0; i < CELLS; i++) {
    if (Math.min(fromStart[i], fromKey[i]) > Math.min(fromStart[door], fromKey[door])) door = i;
  }
  w.door = door;
}

/** Benjo back at the start, the key back in place, the enemies back at their posts, the clock reset. @param {World} w */
function resetFloor(w) {
  Object.assign(w.benjo, { cell: w.start, dir: -1, t: 0, facing: 1 });
  w.benjo.prevX = posX(w.benjo);
  w.benjo.prevY = posY(w.benjo);
  w.hasKey = false;
  w.clock = FLOOR_T;
  for (const e of w.enemies) e.active = false;
  for (const b of w.bolts) b.active = false;
  const fromStart = distances(w.open, w.start);
  const roster = rosterFor(w.floor);
  let n = 0;
  for (const kind of /** @type {const} */ (['slime', 'knight', 'mage'])) {
    for (let k = 0; k < roster[kind] && n < w.enemies.length; k++, n++) {
      const e = w.enemies[n];
      const cell = pickCell(w, (i) => fromStart[i] >= SPAWN_GAP && i !== w.key && i !== w.door);
      Object.assign(e, {
        active: true,
        kind,
        cell,
        dir: -1,
        t: 0,
        hp: kind === 'knight' ? KNIGHT_HP : 1,
        hurtT: 0,
        phase: kind === 'mage' ? 'hide' : 'show',
        timer: MAGE_HIDE + w.random() * MAGE_HIDE_JITTER,
        cast: false,
        castDir: 0,
      });
      e.prevX = posX(e);
      e.prevY = posY(e);
    }
  }
}

/**
 * @param {Area} size
 * @param {() => number} random
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {World}
 */
export function createWorld(size, random, options = {}) {
  const mover = () => ({ cell: 0, dir: -1, t: 0, prevX: 0, prevY: 0 });
  /** @type {World} */
  const w = {
    ...layout(size),
    open: [],
    start: 0,
    key: 0,
    door: 0,
    hasKey: false,
    benjo: { ...mover(), facing: 1 },
    floor: 1,
    lives: LIVES,
    score: 0,
    clock: FLOOR_T,
    pauseT: 0,
    pause: null,
    time: 0,
    dead: false,
    hit: null,
    deadT: 0,
    graceT: 0,
    shakeT: 0,
    events: 0,
    reducedMotion: Boolean(options.reducedMotion),
    random,
    enemies: Array.from({ length: ENEMY_POOL }, () => ({
      ...mover(),
      active: false,
      kind: /** @type {Enemy['kind']} */ ('slime'),
      hp: 1,
      hurtT: 0,
      phase: /** @type {Enemy['phase']} */ ('show'),
      timer: 0,
      cast: false,
      castDir: 0,
    })),
    bolts: Array.from({ length: BOLT_POOL }, () => ({
      active: false,
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
      dir: 0,
    })),
  };
  newFloor(w);
  resetFloor(w);
  return w;
}

/**
 * Move a mover `speed` cells per second. At each cell's middle `choose` picks the next way, or -1
 * to stop there. A mover asked to turn back does so at once.
 * @param {Mover} m @param {number} speed @param {number} dt
 * @param {(m: Mover) => number} choose
 * @param {number} [turn] a way to take right away if it is straight back
 */
function advance(m, speed, dt, choose, turn = -1) {
  if (m.dir >= 0 && turn === back(m.dir)) {
    m.cell = step(m.cell, m.dir);
    m.t = 1 - m.t;
    m.dir = turn;
  }
  if (m.dir < 0) {
    m.dir = choose(m);
    m.t = 0;
    if (m.dir < 0) return;
  }
  m.t += speed * dt;
  while (m.t >= 1) {
    m.cell = step(m.cell, m.dir);
    m.t -= 1;
    const next = choose(m);
    if (next < 0) {
      m.dir = -1;
      m.t = 0;
      return;
    }
    m.dir = next;
  }
}

/**
 * Benjo walks the way asked when it is open, keeps going while a blocked side way is asked, and
 * stops when nothing is asked. Facing follows the last way asked, so a stop can face a corridor.
 * @param {World} w @param {Intent} intent @param {number} dt
 */
function moveBenjo(w, intent, dt) {
  const b = w.benjo;
  const want = intent.dir;
  if (want >= 0) b.facing = want;
  advance(
    b,
    BENJO_SPEED,
    dt,
    (m) => {
      if (want < 0) return -1;
      if (isOpen(w.open, m.cell, want)) return want;
      return m.dir >= 0 && isOpen(w.open, m.cell, m.dir) ? m.dir : -1;
    },
    want,
  );
  if (b.dir >= 0) b.facing = b.dir;
}

/** The open ways out of cell `i`, not straight back the way `m` came unless it must. @param {World} w @param {Mover} m */
function ways(w, m) {
  const all = [0, 1, 2, 3].filter((d) => isOpen(w.open, m.cell, d));
  const on = all.filter((d) => m.dir < 0 || d !== back(m.dir));
  return on.length ? on : all;
}

/**
 * Walking enemies: a slime turns at random; a knight takes the way that gets closest to Benjo.
 * A stunned enemy stands still.
 * @param {World} w @param {Enemy} e @param {number[]} toBenjo @param {number} dt
 */
function moveWalker(w, e, toBenjo, dt) {
  if (e.hurtT > 0) return;
  const knight = e.kind === 'knight';
  advance(e, paced(w, knight ? KNIGHT_SPEED : SLIME_SPEED), dt, (m) => {
    const options = ways(w, m);
    if (!knight) return options[Math.floor(w.random() * options.length)];
    return options.reduce((best, d) =>
      toBenjo[step(m.cell, d)] < toBenjo[step(m.cell, best)] ? d : best,
    );
  });
}

/**
 * A mage hides, then shows in a cell in a straight open line with Benjo at least two cells off,
 * casts a bolt down that line, lingers, and hides again.
 * @param {World} w @param {Enemy} e @param {number} dt
 */
function moveMage(w, e, dt) {
  e.timer -= dt;
  if (e.phase === 'hide') {
    if (e.timer > 0) return;
    const spot = sightline(w);
    if (spot.cell < 0) {
      e.timer = 0.5;
      return;
    }
    Object.assign(e, {
      phase: 'show',
      cell: spot.cell,
      dir: -1,
      t: 0,
      timer: MAGE_CAST + MAGE_LINGER,
      cast: false,
      castDir: spot.dir,
    });
    e.prevX = posX(e);
    e.prevY = posY(e);
    return;
  }
  if (!e.cast && e.timer <= MAGE_LINGER) {
    e.cast = true;
    const bolt = w.bolts.find((s) => !s.active);
    if (bolt) {
      Object.assign(bolt, { active: true, x: posX(e), y: posY(e), dir: e.castDir });
      bolt.prevX = bolt.x;
      bolt.prevY = bolt.y;
      w.events |= EVENT_CAST;
    }
  }
  if (e.timer <= 0) {
    e.phase = 'hide';
    e.timer = MAGE_HIDE + w.random() * MAGE_HIDE_JITTER;
  }
}

/** A cell two or more cells from Benjo's in an open straight line, and the way back to him. @param {World} w */
function sightline(w) {
  const options = [];
  for (let d = 0; d < 4; d++) {
    let i = w.benjo.cell;
    for (let n = 1; n <= 6 && isOpen(w.open, i, d); n++) {
      i = step(i, d);
      if (n >= 2 && i !== w.door && i !== w.key) options.push({ cell: i, dir: back(d) });
    }
  }
  return options.length ? options[Math.floor(w.random() * options.length)] : { cell: -1, dir: 0 };
}

/** Bolts fly straight and stop at walls. @param {World} w @param {number} dt */
function moveBolts(w, dt) {
  for (const s of w.bolts) {
    if (!s.active) continue;
    s.prevX = s.x;
    s.prevY = s.y;
    const cell = Math.floor(s.y) * COLS + Math.floor(s.x);
    const cx = (cell % COLS) + 0.5;
    const cy = Math.floor(cell / COLS) + 0.5;
    s.x += DX[s.dir] * BOLT_SPEED * dt;
    s.y += DY[s.dir] * BOLT_SPEED * dt;
    // Past its cell's middle toward a closed side, a bolt hits the wall.
    const past = (s.x - cx) * DX[s.dir] + (s.y - cy) * DY[s.dir];
    if (past > 0.35 && !isOpen(w.open, cell, s.dir)) s.active = false;
  }
}

/**
 * Benjo loses a life to `what`, unless the twin takes it.
 * @param {World} w @param {'enemy' | 'bolt' | 'time'} what @param {Powers} powers
 * @returns {boolean} true when the twin took it
 */
function hurt(w, what, powers) {
  if (what !== 'time' && powers.absorb?.()) {
    w.graceT = GRACE_T;
    return true;
  }
  w.lives -= 1;
  w.hit = what;
  w.shakeT = SHAKE_T;
  w.events |= EVENT_HIT;
  if (w.lives <= 0) {
    w.dead = true;
    w.deadT = 0;
  } else {
    w.pause = 'hit';
    w.pauseT = HIT_T;
  }
  return false;
}

/** Score for slaying an enemy of `kind`. @param {Enemy['kind']} kind */
const slayScore = (kind) =>
  kind === 'knight' ? KNIGHT_SCORE : kind === 'mage' ? MAGE_SCORE : SLIME_SCORE;

/**
 * Benjo meets the enemies and the bolts. His sword points the way he faces, walking or not, so
 * an enemy that meets it is hit; one that touches his side or back costs a life. Standing still,
 * his shield stops bolts.
 * @param {World} w @param {Powers} powers
 * @returns {boolean} false when Benjo lost a life
 */
function meet(w, powers) {
  const b = w.benjo;
  const bx = posX(b);
  const by = posY(b);
  for (const e of w.enemies) {
    if (!e.active || e.phase === 'hide' || e.hurtT > 0) continue;
    const dx = posX(e) - bx;
    const dy = posY(e) - by;
    const d = Math.hypot(dx, dy);
    if (d >= CONTACT) continue;
    const ahead = dx * DX[b.facing] + dy * DY[b.facing] >= FRONT * d;
    if (ahead) {
      e.hp -= 1;
      e.hurtT = HURT_T;
      if (e.hp <= 0) {
        e.active = false;
        w.score += slayScore(e.kind);
        w.events |= EVENT_SLAY;
      } else if (e.dir >= 0) {
        // Knocked back the way it came.
        advance(e, 0, 0, () => -1, back(e.dir));
      }
      continue;
    }
    if (w.graceT > 0) continue;
    if (!hurt(w, 'enemy', powers)) return false;
  }
  for (const s of w.bolts) {
    if (!s.active || Math.hypot(s.x - bx, s.y - by) >= BOLT_CONTACT) continue;
    s.active = false;
    if (b.dir < 0) {
      w.events |= EVENT_BLOCK;
      continue;
    }
    if (w.graceT > 0) continue;
    if (!hurt(w, 'bolt', powers)) return false;
  }
  return true;
}

/**
 * Garbage Collector: every enemy and bolt on the floor goes, enemies scoring as slain.
 * @param {World} w
 * @returns {number} how many went
 */
export function clearEnemies(w) {
  let n = 0;
  for (const e of w.enemies) {
    if (!e.active) continue;
    e.active = false;
    w.score += slayScore(e.kind);
    n += 1;
  }
  for (const s of w.bolts) {
    if (!s.active) continue;
    s.active = false;
    n += 1;
  }
  return n;
}

/** Near the middle of cell `i`? @param {World} w @param {number} i */
const at = (w, i) =>
  Math.hypot(posX(w.benjo) - ((i % COLS) + 0.5), posY(w.benjo) - (Math.floor(i / COLS) + 0.5)) <
  REACH;

/**
 * Advance the world one fixed step. Mutates and returns `w`.
 * @param {World} w
 * @param {Intent} intent
 * @param {number} dt
 * @param {Powers} [powers] power-up help; none by default
 * @returns {World}
 */
export function stepWorld(w, intent, dt, powers = NO_POWERS) {
  const b = w.benjo;
  b.prevX = posX(b);
  b.prevY = posY(b);
  for (const e of w.enemies) {
    e.prevX = posX(e);
    e.prevY = posY(e);
  }
  w.events = 0;
  w.time += dt;
  w.shakeT = Math.max(0, w.shakeT - dt);
  if (w.dead) {
    w.deadT += dt;
    return w;
  }
  if (w.pauseT > 0) {
    w.pauseT = Math.max(0, w.pauseT - dt);
    if (w.pauseT > 0) return w;
    if (w.pause === 'clear') {
      w.floor += 1;
      newFloor(w);
    }
    w.pause = null;
    resetFloor(w);
    return w;
  }

  if (w.time > START_GRACE) moveBenjo(w, intent, dt);
  w.graceT = Math.max(0, w.graceT - dt);
  w.clock = Math.max(0, w.clock - dt);
  const toBenjo = distances(w.open, b.dir >= 0 && b.t > 0.5 ? step(b.cell, b.dir) : b.cell);
  for (const e of w.enemies) {
    if (!e.active) continue;
    e.hurtT = Math.max(0, e.hurtT - dt);
    if (e.kind === 'mage') moveMage(w, e, dt);
    else moveWalker(w, e, toBenjo, dt);
  }
  moveBolts(w, dt);
  if (!meet(w, powers)) return w;

  if (!w.hasKey && at(w, w.key)) {
    w.hasKey = true;
    w.score += KEY_SCORE;
    w.events |= EVENT_KEY;
  }
  if (w.hasKey && at(w, w.door)) {
    w.score += FLOOR_SCORE + Math.floor(w.clock) * TIME_SCORE;
    w.events |= EVENT_CLEAR;
    w.pause = 'clear';
    w.pauseT = CLEAR_T;
  } else if (w.clock === 0) hurt(w, 'time', powers);
  return w;
}

/**
 * Fit a running world to a new canvas size. Everything is in cells, so only the layout changes.
 * @param {World} w
 * @param {Area} size
 * @returns {World}
 */
export const resizeWorld = (w, size) => Object.assign(w, layout(size));
