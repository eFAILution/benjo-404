// @ts-check
// The Cache Muncher world and its fixed step. No DOM, no host: tests drive it directly.
//
// Everything moves on the maze grid. An actor sits on cell (col, row) heading `dir`, `t` of the
// way to the next cell, so its center is the cell center plus t cells along dir. At each cell
// center Benjo takes the turn the player asked for once it opens, and a cache miss picks the
// open way (never straight back) that brings it closest to its target cell, as in the arcade.

import {
  AMBUSH_CELLS,
  BENJO_SPEED,
  BENJO_START,
  BOTTOM_PAD,
  BYTE_SCORE,
  CEILING,
  CEILING_NARROW,
  CELL_MAX,
  CLEAR_T,
  CORNERS,
  EVENT_BYTE,
  EVENT_HIT,
  EVENT_LEVEL,
  EVENT_MUNCH,
  EVENT_PELLET,
  FRIGHT_RATIO,
  FRIGHT_T,
  FRIGHT_T_MIN,
  FRIGHT_T_STEP,
  HIT_R,
  HIT_T,
  LEVEL_SPEED,
  LIVES,
  MAZE,
  MIN_HEIGHT,
  MIN_WIDTH,
  MISS_RATIO,
  MISS_RATIO_CAP,
  MISS_RATIO_STEP,
  MISS_SCORE,
  MISS_SCORE_MAX,
  MISS_START,
  MODE_T,
  NARROW_WIDTH,
  PELLET_SCORE,
  PEN_EXIT,
  READY_T,
  REF_HEIGHT,
  RELEASE_T,
  RESPAWN_T,
  SHY_CELLS,
  SIDE_PAD,
  SPEED_CAP,
  SPEED_CAP_REDUCED,
  START_GRACE,
  UNIT_MAX,
  UNIT_MIN,
} from './tuning.js';

/** Directions 0..3: right, down, left, up. Screen y grows downward. -1 is standing still. */
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];
/** The arcade's tie order when two ways are equally close: up, left, down, right. */
const TIE_ORDER = [3, 2, 1, 0];
export const COLS = MAZE[0].length;
export const ROWS = MAZE.length;

/** @param {number} d */
export const reverse = (d) => (d + 2) % 4;

/** @typedef {{ width: number, height: number }} Area */
/** @typedef {{ dir: number }} Intent dir 0..3, or -1 for no new input */
/**
 * @typedef {object} Actor
 * @property {number} col
 * @property {number} row
 * @property {number} dir 0..3, or -1 when standing
 * @property {number} t share of the way to the next cell, in [0, 1)
 * @property {number} x center in cells, for drawing and touches
 * @property {number} y
 * @property {number} prevX
 * @property {number} prevY
 */
/**
 * @typedef {Actor & { index: number, state: 'pen' | 'leaving' | 'out', waitT: number,
 *   frightened: boolean }} Miss
 */
/**
 * @typedef {object} World
 * @property {number} width
 * @property {number} height
 * @property {number} unit
 * @property {number} ceiling screen y of the bottom of the HUD strip
 * @property {number} cell px per cell
 * @property {number} boardX screen x of column 0's left edge
 * @property {number} boardY screen y of row 0's top edge
 * @property {Uint8Array} bytes 1 = byte, 2 = Clear cache pellet, by row * COLS + col
 * @property {number} left bytes and pellets still on the board
 * @property {Actor & { facing: number }} benjo
 * @property {number} wanted the turn the player asked for, kept until it opens
 * @property {Miss[]} misses
 * @property {number} level
 * @property {number} lives
 * @property {number} score
 * @property {number} munched cache misses munched this run
 * @property {number} chain cache misses munched in this Clear cache
 * @property {number} lifeT seconds into this life, for the ready pause and pen releases
 * @property {number} modeT seconds of scatter and chase so far this life
 * @property {number} frightT catchable time left
 * @property {number} hitT hit stop left after a lost life
 * @property {number} clearT pause left before the next level
 * @property {number} hitAge seconds since the last lost life, for the flash
 * @property {boolean} dead
 * @property {number} deadT
 * @property {number} events EVENT_* bits raised by the last step
 * @property {number} time seconds since start
 * @property {boolean} reducedMotion
 * @property {() => number} random
 */

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The maze character at a cell; outside the maze is wall. @param {number} col @param {number} row */
export const cellAt = (col, row) => MAZE[row]?.[col] ?? '#';

/** Benjo walks only the paths. @param {number} col @param {number} row */
export const benjoCanEnter = (col, row) => !'#=G'.includes(cellAt(col, row));

/**
 * A cache miss walks the paths; it crosses the door and the pen only on its way out.
 * @param {Miss} miss @param {number} col @param {number} row
 */
function missCanEnter(miss, col, row) {
  const c = cellAt(col, row);
  if (c === '#') return false;
  if (c === '=' || c === 'G') return miss.state === 'leaving';
  return true;
}

/** @param {Area} size */
function layout(size) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const unit = clamp(height / REF_HEIGHT, UNIT_MIN, UNIT_MAX);
  const ceiling = size.width < NARROW_WIDTH ? CEILING_NARROW : CEILING;
  const playW = width - 2 * SIDE_PAD;
  const playH = height - ceiling - BOTTOM_PAD;
  const cell = Math.min(playW / COLS, playH / ROWS, CELL_MAX * unit);
  return {
    width,
    height,
    unit,
    ceiling,
    cell,
    boardX: (width - COLS * cell) / 2,
    boardY: ceiling + (playH - ROWS * cell) / 2,
  };
}

/** @param {Actor} a */
function place(a) {
  const dx = a.dir < 0 ? 0 : DX[a.dir] * a.t;
  const dy = a.dir < 0 ? 0 : DY[a.dir] * a.t;
  a.x = a.col + 0.5 + dx;
  a.y = a.row + 0.5 + dy;
}

/** @param {Actor} a @param {number} col @param {number} row @param {number} dir */
function putAt(a, col, row, dir) {
  a.col = col;
  a.row = row;
  a.dir = dir;
  a.t = 0;
  place(a);
  a.prevX = a.x;
  a.prevY = a.y;
}

/** @param {number} index @returns {Miss} */
function createMiss(index) {
  return {
    index,
    col: 0,
    row: 0,
    dir: -1,
    t: 0,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    state: 'pen',
    waitT: 0,
    frightened: false,
  };
}

/** Fill every byte and pellet back in. @param {World} w */
function fillBytes(w) {
  w.left = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const c = cellAt(col, row);
      const kind = c === '.' ? 1 : c === 'o' ? 2 : 0;
      w.bytes[row * COLS + col] = kind;
      if (kind) w.left += 1;
    }
  }
}

/** Benjo back on his start cell and every cache miss back home, as at the start of a life. @param {World} w */
function resetActors(w) {
  putAt(w.benjo, BENJO_START[0], BENJO_START[1], -1);
  w.benjo.facing = 2;
  w.wanted = -1;
  for (const miss of w.misses) {
    const [col, row] = MISS_START[miss.index];
    putAt(miss, col, row, miss.index === 0 ? 2 : -1);
    miss.state = miss.index === 0 ? 'out' : 'pen';
    miss.waitT = RELEASE_T[miss.index];
    miss.frightened = false;
  }
  w.lifeT = 0;
  w.modeT = 0;
  w.frightT = 0;
  w.chain = 0;
}

/**
 * @param {Area} size
 * @param {() => number} random
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {World}
 */
export function createWorld(size, random, options = {}) {
  /** @type {World} */
  const w = {
    ...layout(size),
    bytes: new Uint8Array(COLS * ROWS),
    left: 0,
    benjo: { col: 0, row: 0, dir: -1, t: 0, x: 0, y: 0, prevX: 0, prevY: 0, facing: 2 },
    wanted: -1,
    misses: MISS_START.map((_, i) => createMiss(i)),
    level: 1,
    lives: LIVES,
    score: 0,
    munched: 0,
    chain: 0,
    lifeT: 0,
    modeT: 0,
    frightT: 0,
    hitT: 0,
    clearT: 0,
    hitAge: Number.POSITIVE_INFINITY,
    dead: false,
    deadT: 0,
    events: 0,
    time: 0,
    reducedMotion: Boolean(options.reducedMotion),
    random,
  };
  fillBytes(w);
  resetActors(w);
  return w;
}

/** Benjo's speed in cells per second at a level. @param {World} w */
export function benjoSpeed(w) {
  const cap = w.reducedMotion ? SPEED_CAP_REDUCED : SPEED_CAP;
  return Math.min(cap, BENJO_SPEED * (1 + LEVEL_SPEED * (w.level - 1)));
}

/** A cache miss's speed, slower while catchable. @param {World} w @param {Miss} miss */
export function missSpeed(w, miss) {
  const ratio = Math.min(MISS_RATIO_CAP, MISS_RATIO + MISS_RATIO_STEP * (w.level - 1));
  return benjoSpeed(w) * ratio * (miss.frightened ? FRIGHT_RATIO : 1);
}

/** Catchable seconds for this level. @param {World} w */
export const frightTime = (w) => Math.max(FRIGHT_T_MIN, FRIGHT_T - FRIGHT_T_STEP * (w.level - 1));

/** Scattering to the corners, rather than chasing? @param {World} w */
export function scattering(w) {
  let t = w.modeT;
  for (let i = 0; i < MODE_T.length; i++) {
    if (t < MODE_T[i]) return i % 2 === 0;
    t -= MODE_T[i];
  }
  return false;
}

/** Munch whatever is on Benjo's cell. @param {World} w */
function munchCell(w) {
  const i = w.benjo.row * COLS + w.benjo.col;
  const kind = w.bytes[i];
  if (!kind) return;
  w.bytes[i] = 0;
  w.left -= 1;
  if (kind === 1) {
    w.score += BYTE_SCORE;
    w.events |= EVENT_BYTE;
    return;
  }
  w.score += PELLET_SCORE;
  w.events |= EVENT_PELLET;
  w.frightT = frightTime(w);
  w.chain = 0;
  for (const miss of w.misses) {
    if (miss.state !== 'out') continue;
    miss.frightened = true;
    turnAround(miss);
  }
}

/** Head straight back the way it came, from wherever it is between two cells. @param {Actor} a */
function turnAround(a) {
  if (a.dir < 0) return;
  if (a.t > 0) {
    a.col += DX[a.dir];
    a.row += DY[a.dir];
    a.t = 1 - a.t;
  }
  a.dir = reverse(a.dir);
}

/**
 * Move Benjo along the grid. A reverse happens at once; any other turn waits for the next cell
 * center where it opens. He stops against a wall and starts again when an open way is asked for.
 * @param {World} w @param {number} dt
 */
function moveBenjo(w, dt) {
  const b = w.benjo;
  if (w.wanted >= 0 && b.dir >= 0 && w.wanted === reverse(b.dir)) turnAround(b);
  if (b.dir < 0) {
    if (w.wanted < 0 || !benjoCanEnter(b.col + DX[w.wanted], b.row + DY[w.wanted])) return;
    b.dir = w.wanted;
  }
  b.facing = b.dir;
  let dist = benjoSpeed(w) * dt;
  while (dist > 0) {
    const room = 1 - b.t;
    if (dist < room) {
      b.t += dist;
      return;
    }
    dist -= room;
    b.col += DX[b.dir];
    b.row += DY[b.dir];
    b.t = 0;
    munchCell(w);
    if (w.wanted >= 0 && benjoCanEnter(b.col + DX[w.wanted], b.row + DY[w.wanted])) {
      b.dir = w.wanted;
      b.facing = b.dir;
    }
    if (!benjoCanEnter(b.col + DX[b.dir], b.row + DY[b.dir])) {
      b.dir = -1;
      return;
    }
  }
}

/**
 * The cell a cache miss is heading for. The chaser goes for Benjo, the ambusher for the cells
 * ahead of him, the flanker for the point that puts Benjo between it and the chaser, and the shy
 * one chases only from afar.
 * @param {World} w @param {Miss} miss
 * @returns {[number, number]}
 */
export function targetOf(w, miss) {
  if (miss.state === 'leaving') return [PEN_EXIT[0], PEN_EXIT[1]];
  if (scattering(w)) return [CORNERS[miss.index][0], CORNERS[miss.index][1]];
  const b = w.benjo;
  const face = b.dir >= 0 ? b.dir : b.facing;
  if (miss.index === 1) return [b.col + DX[face] * AMBUSH_CELLS, b.row + DY[face] * AMBUSH_CELLS];
  if (miss.index === 2) {
    const chaser = w.misses[0];
    const pivotC = b.col + DX[face] * 2;
    const pivotR = b.row + DY[face] * 2;
    return [2 * pivotC - chaser.col, 2 * pivotR - chaser.row];
  }
  if (miss.index === 3) {
    const far = (miss.col - b.col) ** 2 + (miss.row - b.row) ** 2 > SHY_CELLS ** 2;
    if (!far) return [CORNERS[3][0], CORNERS[3][1]];
  }
  return [b.col, b.row];
}

/**
 * At a cell center: pick the way on. Never straight back unless it is the only way. Catchable
 * cache misses pick at random; the rest pick the way closest to their target.
 * @param {World} w @param {Miss} miss
 */
function chooseDir(w, miss) {
  const back = miss.dir < 0 ? -1 : reverse(miss.dir);
  /** @type {number[]} */
  const ways = [];
  for (const d of TIE_ORDER) {
    if (d !== back && missCanEnter(miss, miss.col + DX[d], miss.row + DY[d])) ways.push(d);
  }
  if (!ways.length) {
    miss.dir = back;
    return;
  }
  if (miss.frightened) {
    miss.dir = ways[Math.floor(w.random() * ways.length)];
    return;
  }
  const [tc, tr] = targetOf(w, miss);
  let best = ways[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const d of ways) {
    const dist = (miss.col + DX[d] - tc) ** 2 + (miss.row + DY[d] - tr) ** 2;
    if (dist < bestD) [best, bestD] = [d, dist];
  }
  miss.dir = best;
}

/** @param {World} w @param {Miss} miss @param {number} dt */
function moveMiss(w, miss, dt) {
  if (miss.state === 'pen') {
    miss.waitT -= dt;
    if (miss.waitT > 0) return;
    miss.state = 'leaving';
    chooseDir(w, miss);
  }
  if (miss.dir < 0) chooseDir(w, miss);
  let dist = missSpeed(w, miss) * dt;
  while (dist > 0 && miss.dir >= 0) {
    const room = 1 - miss.t;
    if (dist < room) {
      miss.t += dist;
      return;
    }
    dist -= room;
    miss.col += DX[miss.dir];
    miss.row += DY[miss.dir];
    miss.t = 0;
    if (miss.state === 'leaving' && miss.col === PEN_EXIT[0] && miss.row === PEN_EXIT[1]) {
      miss.state = 'out';
      miss.dir = -1;
    }
    chooseDir(w, miss);
  }
}

/** Send a munched cache miss back to the pen, to leave again after RESPAWN_T. @param {Miss} miss */
function sendHome(miss) {
  const [col, row] = MISS_START[Math.max(1, miss.index)];
  putAt(miss, col, row, -1);
  miss.state = 'pen';
  miss.waitT = RESPAWN_T;
  miss.frightened = false;
}

/** @param {World} w */
function loseLife(w) {
  w.lives -= 1;
  w.hitAge = 0;
  w.events |= EVENT_HIT;
  if (w.lives > 0) {
    w.hitT = HIT_T;
    return;
  }
  w.dead = true;
  w.deadT = 0;
}

/** Touches between Benjo and the cache misses that are out. @param {World} w */
function checkTouches(w) {
  const b = w.benjo;
  for (const miss of w.misses) {
    if (miss.state === 'pen') continue;
    if ((miss.x - b.x) ** 2 + (miss.y - b.y) ** 2 > HIT_R ** 2) continue;
    if (!miss.frightened) {
      loseLife(w);
      return;
    }
    w.chain += 1;
    w.munched += 1;
    w.score += Math.min(MISS_SCORE_MAX, MISS_SCORE * 2 ** (w.chain - 1));
    w.events |= EVENT_MUNCH;
    sendHome(miss);
  }
}

/** Every byte munched: refill and speed up. @param {World} w */
function nextLevel(w) {
  w.level += 1;
  w.events |= EVENT_LEVEL;
  fillBytes(w);
  resetActors(w);
}

/**
 * Advance the world one fixed step. Mutates and returns `w`.
 * @param {World} w
 * @param {Intent} intent
 * @param {number} dt
 * @returns {World}
 */
export function stepWorld(w, intent, dt) {
  const actors = [w.benjo, ...w.misses];
  for (const a of actors) {
    a.prevX = a.x;
    a.prevY = a.y;
  }
  w.events = 0;
  w.time += dt;
  w.hitAge += dt;

  if (w.dead) {
    w.deadT += dt;
    return w;
  }
  if (w.hitT > 0) {
    w.hitT = Math.max(0, w.hitT - dt);
    if (w.hitT === 0) resetActors(w);
    return w;
  }
  if (w.clearT > 0) {
    w.clearT = Math.max(0, w.clearT - dt);
    if (w.clearT === 0) nextLevel(w);
    return w;
  }

  if (intent.dir >= 0 && w.time > START_GRACE) w.wanted = intent.dir;
  w.lifeT += dt;
  if (w.lifeT < READY_T) return w;

  if (w.frightT > 0) {
    w.frightT = Math.max(0, w.frightT - dt);
    if (w.frightT === 0) for (const miss of w.misses) miss.frightened = false;
  } else {
    const before = scattering(w);
    w.modeT += dt;
    if (scattering(w) !== before) {
      for (const miss of w.misses) if (miss.state === 'out') turnAround(miss);
    }
  }

  moveBenjo(w, dt);
  for (const miss of w.misses) moveMiss(w, miss, dt);
  for (const a of actors) place(a);
  checkTouches(w);
  if (w.hitT === 0 && !w.dead && w.left === 0) w.clearT = CLEAR_T;
  return w;
}

/** Fit a running world to a new canvas size. Everything is in cells, so only the layout moves. @param {World} w @param {Area} size */
export function resizeWorld(w, size) {
  return Object.assign(w, layout(size));
}

/** Screen x of a cell position. @param {World} w @param {number} x */
export const screenX = (w, x) => w.boardX + x * w.cell;

/** Screen y of a cell position. @param {World} w @param {number} y */
export const screenY = (w, y) => w.boardY + y * w.cell;
