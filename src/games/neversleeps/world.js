// @ts-check
// The Never Sleeps Run world and its fixed step (#88). No DOM, no host: tests drive it directly.
//
// Everything lives in trench units: the ship's (sx, sy) on the cross-section, from -1 to 1 on
// each axis with +y up, and each gate's depth z ahead of the ship. Only layout() knows pixels, so
// a resize is a new layout. Pools are allocated once in createWorld, and stepWorld only mutates.

import {
  BOTTOM_PAD,
  CEILING,
  CEILING_NARROW,
  DRAG_SPEED,
  EVENT_HIT,
  EVENT_ORB,
  EVENT_PASS,
  EVENT_PORT,
  FAR,
  FLASH_T,
  GATE_GAP,
  GATE_GAP_MIN,
  GATE_GAP_STEP,
  GATE_POOL,
  GATE_SCORE,
  GRACE_T,
  GRID,
  HIT_FRAC,
  MAGNET_REACH,
  MAGNET_V,
  MIN_HEIGHT,
  MIN_WIDTH,
  NARROW_WIDTH,
  OPEN_EVERY,
  OPEN_MIN,
  OPEN_START,
  ORB_CHANCE,
  ORB_SCORE,
  PORT_EVERY,
  PORT_SCORE,
  REF_HEIGHT,
  SHAKE_T,
  SHIP_ASPECT,
  SHIP_H,
  SHIP_SPEED,
  SPEED_CAP,
  SPEED_CAP_REDUCED,
  SPEED_START,
  SPEED_STEP,
  START_GRACE,
  TRENCH_ASPECT,
  UNIT_MAX,
  UNIT_MIN,
} from './tuning.js';

/** @typedef {{ width: number, height: number }} Area */
/**
 * What the player asks for this step. `mx` and `my` are key steering, -1 to 1 with up as +1.
 * While a finger or mouse drags, `px` and `py` are where it is in canvas px, and `grab` is true
 * on the step it went down.
 * @typedef {{ mx: number, my: number, px: number | null, py: number | null, grab: boolean }} Intent
 */
/**
 * A gate across the trench. `mask` has bit `row * GRID + col` set for each blocked cell, with
 * row 0 on top. `orb` and `port` are a cell index, or -1; the orb rides at (ox, oy).
 * @typedef {{ active: boolean, z: number, prevZ: number, mask: number, orb: number,
 *   ox: number, oy: number, port: number, sprite: number }} Gate
 */
/** Where a drag started, so the ship moves with the finger instead of jumping under it. @typedef {{ px: number, py: number, sx: number, sy: number }} Anchor */
/**
 * Power-up help from the host (#22), read during a step.
 * @typedef {{ magnet?: boolean, absorb?: () => boolean }} Powers
 *   magnet pulls orbs in this step; absorb() is true when the Digital Twin takes a hit.
 */
/**
 * @typedef {object} World
 * @property {number} width
 * @property {number} height
 * @property {number} unit
 * @property {number} ceiling top of the play rect, just below the HUD strip
 * @property {number} bottom
 * @property {number} cx screen x of the trench's center line
 * @property {number} cy screen y of the trench's center line
 * @property {number} halfW px from the center to a wall at the ship's depth
 * @property {number} halfH px from the center to the floor or the rim at the ship's depth
 * @property {number} shipW drawn ship width, px
 * @property {number} shipH drawn ship height, px
 * @property {number} hx hitbox half width, trench units
 * @property {number} hy hitbox half height, trench units
 * @property {number} sx ship center, trench units
 * @property {number} sy
 * @property {number} prevSx
 * @property {number} prevSy
 * @property {number} dist units flown, for the trench ribs
 * @property {number} prevDist
 * @property {number} lastZ depth of the newest gate
 * @property {number} spawned gates made so far
 * @property {number} lane the cell the newest gate is sure to leave open
 * @property {number} passed gates flown through
 * @property {number} score
 * @property {number} time seconds since start
 * @property {boolean} dead
 * @property {number} deadT
 * @property {number} graceT seconds left of the Digital Twin's grace, 0 when none
 * @property {number} shakeT
 * @property {number} flashT seconds left of the port's flash
 * @property {number} events EVENT_* bits raised by the last step
 * @property {boolean} reducedMotion
 * @property {() => number} random
 * @property {Anchor | null} anchor
 * @property {Gate[]} gates
 */

/** No power-ups: what a step gets from a host without them. @type {Powers} */
const NO_POWERS = {};

const CELLS = GRID * GRID;
const ALL = (1 << CELLS) - 1;
/** One cell's size in trench units. */
const CELL = 2 / GRID;

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Center of cell `i`, in trench units. @param {number} i */
export const cellX = (i) => -1 + ((i % GRID) + 0.5) * CELL;
/** @param {number} i */
export const cellY = (i) => 1 - (Math.floor(i / GRID) + 0.5) * CELL;

/** Chebyshev distance between two cells: 1 means next to each other, corners included. @param {number} a @param {number} b */
const apart = (a, b) =>
  Math.max(
    Math.abs((a % GRID) - (b % GRID)),
    Math.abs(Math.floor(a / GRID) - Math.floor(b / GRID)),
  );

/** @param {Area} size */
export function layout(size) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const unit = clamp(height / REF_HEIGHT, UNIT_MIN, UNIT_MAX);
  const ceiling = size.width < NARROW_WIDTH ? CEILING_NARROW : CEILING;
  const bottom = height - BOTTOM_PAD;
  const halfH = (bottom - ceiling) / 2;
  const halfW = Math.min(width / 2, halfH * TRENCH_ASPECT);
  const shipH = Math.min(SHIP_H * unit, (halfH * CELL) / 2);
  const shipW = Math.min(shipH * SHIP_ASPECT, (halfW * CELL) / 1.2);
  return {
    width,
    height,
    unit,
    ceiling,
    bottom,
    cx: width / 2,
    cy: ceiling + halfH,
    halfW,
    halfH,
    shipW,
    shipH,
    hx: (HIT_FRAC * shipW) / 2 / halfW,
    hy: (HIT_FRAC * shipH) / 2 / halfH,
  };
}

/** Trench speed: faster with each gate flown, up to a cap that is lower with reduced motion. @param {World} w */
export function speedFor(w) {
  const cap = w.reducedMotion ? SPEED_CAP_REDUCED : SPEED_CAP;
  return Math.min(cap, SPEED_START + SPEED_STEP * w.passed);
}

/** Depth between gates: a little shorter as the run goes on. @param {World} w */
export const gapFor = (w) => Math.max(GATE_GAP_MIN, GATE_GAP - GATE_GAP_STEP * w.spawned);

/** Open cells a new gate leaves: fewer as the run goes on. @param {World} w */
export const openFor = (w) => Math.max(OPEN_MIN, OPEN_START - Math.floor(w.spawned / OPEN_EVERY));

/**
 * A random cell from a bit mask of cells.
 * @param {World} w @param {number} cells
 */
function pick(w, cells) {
  let count = 0;
  for (let i = 0; i < CELLS; i++) if (cells & (1 << i)) count += 1;
  let n = Math.floor(w.random() * count);
  for (let i = 0; i < CELLS; i++) if (cells & (1 << i) && n-- === 0) return i;
  return Math.floor(CELLS / 2);
}

/** Cell `i` and every cell next to it, corners included, as a bit mask. @param {number} i */
export function around(i) {
  let cells = 0;
  for (let j = 0; j < CELLS; j++) if (apart(i, j) <= 1) cells |= 1 << j;
  return cells;
}

/**
 * Grow `count` open cells from `start`, each new one beside an open one (no diagonals), so the
 * opening is one connected shape.
 * @param {World} w @param {number} start @param {number} count
 */
function growOpen(w, start, count) {
  let open = 1 << start;
  for (let n = 1; n < count; n++) {
    let edge = 0;
    for (let i = 0; i < CELLS; i++) {
      if (!(open & (1 << i))) continue;
      const c = i % GRID;
      if (c > 0) edge |= 1 << (i - 1);
      if (c < GRID - 1) edge |= 1 << (i + 1);
      if (i >= GRID) edge |= 1 << (i - GRID);
      if (i < CELLS - GRID) edge |= 1 << (i + GRID);
    }
    edge &= ~open;
    if (!edge) break;
    open |= 1 << pick(w, edge);
  }
  return open;
}

/**
 * @template {{ active: boolean }} T
 * @param {T[]} list
 * @returns {T | null}
 */
function free(list) {
  for (let i = 0; i < list.length; i++) if (!list[i].active) return list[i];
  return null;
}

/**
 * Put the next gate at depth `z`. A hidden lane runs down the trench: each gate leaves its lane
 * cell open, and the lane moves at most one cell, corners included, from gate to gate, so a ship
 * that follows it always gets through. Every PORT_EVERY-th gate is a port with its ring on the
 * lane; the rest open a connected shape grown from the lane.
 * @param {World} w @param {number} z
 * @returns {boolean} false when the pool is full
 */
function spawnGate(w, z) {
  const g = free(w.gates);
  if (!g) return false;
  w.spawned += 1;
  w.lastZ = z;
  const start = pick(w, around(w.lane));
  w.lane = start;
  g.active = true;
  g.z = z;
  g.prevZ = z;
  g.orb = -1;
  g.port = -1;
  g.sprite = w.spawned;
  if (w.spawned % PORT_EVERY === 0) {
    g.mask = 0;
    g.port = start;
    return true;
  }
  const open = growOpen(w, start, openFor(w));
  g.mask = ALL & ~open;
  if (w.random() < ORB_CHANCE) {
    g.orb = pick(w, open);
    g.ox = cellX(g.orb);
    g.oy = cellY(g.orb);
  }
  return true;
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
    sx: 0,
    sy: 0,
    prevSx: 0,
    prevSy: 0,
    dist: 0,
    prevDist: 0,
    lastZ: 0,
    spawned: 0,
    lane: Math.floor(CELLS / 2),
    passed: 0,
    score: 0,
    time: 0,
    dead: false,
    deadT: 0,
    graceT: 0,
    shakeT: 0,
    flashT: 0,
    events: 0,
    reducedMotion: Boolean(options.reducedMotion),
    random,
    anchor: null,
    gates: Array.from({ length: GATE_POOL }, () => ({
      active: false,
      z: 0,
      prevZ: 0,
      mask: 0,
      orb: -1,
      ox: 0,
      oy: 0,
      port: -1,
      sprite: 0,
    })),
  };
  spawnGate(w, FAR);
  return w;
}

/**
 * Keys steer at a fixed speed. A drag moves the ship as far as the finger moved since it went
 * down, at up to DRAG_SPEED, so the finger never covers the ship. Keys win over a drag.
 * @param {World} w @param {Intent} intent @param {number} dt
 */
function steer(w, intent, dt) {
  if (intent.mx || intent.my || intent.px === null || intent.py === null) {
    w.anchor = null;
    w.sx += intent.mx * SHIP_SPEED * dt;
    w.sy += intent.my * SHIP_SPEED * dt;
  } else {
    if (intent.grab || !w.anchor) w.anchor = { px: intent.px, py: intent.py, sx: w.sx, sy: w.sy };
    const tx = w.anchor.sx + (intent.px - w.anchor.px) / w.halfW;
    const ty = w.anchor.sy - (intent.py - w.anchor.py) / w.halfH;
    const step = DRAG_SPEED * dt;
    w.sx += clamp(tx - w.sx, -step, step);
    w.sy += clamp(ty - w.sy, -step, step);
  }
  w.sx = clamp(w.sx, -1 + w.hx, 1 - w.hx);
  w.sy = clamp(w.sy, -1 + w.hy, 1 - w.hy);
}

/** Does the ship's hitbox, an ellipse, touch a blocked cell? @param {World} w @param {number} mask */
export function hitsMask(w, mask) {
  for (let i = 0; i < CELLS; i++) {
    if (!(mask & (1 << i))) continue;
    const x = cellX(i);
    const y = cellY(i);
    const dx = (clamp(w.sx, x - CELL / 2, x + CELL / 2) - w.sx) / w.hx;
    const dy = (clamp(w.sy, y - CELL / 2, y + CELL / 2) - w.sy) / w.hy;
    if (dx * dx + dy * dy < 1) return true;
  }
  return false;
}

/** Is the ship's center inside cell `i`? @param {World} w @param {number} i @param {number} x @param {number} y */
const inside = (w, i, x = cellX(i), y = cellY(i)) =>
  Math.abs(w.sx - x) <= CELL / 2 && Math.abs(w.sy - y) <= CELL / 2;

/**
 * The ship reaches a gate. A blocked cell ends the run, unless the twin takes it; otherwise the
 * gate scores, and so do its orb and its port when the ship flies through them.
 * @param {World} w @param {Gate} g @param {Powers} powers
 */
function cross(w, g, powers) {
  if (g.mask && w.graceT === 0 && hitsMask(w, g.mask)) {
    if (!powers.absorb?.()) {
      w.dead = true;
      w.deadT = 0;
      w.shakeT = SHAKE_T;
      w.events |= EVENT_HIT;
      return;
    }
    w.graceT = GRACE_T;
  }
  w.passed += 1;
  if (g.port >= 0) {
    if (inside(w, g.port)) {
      w.score += PORT_SCORE;
      w.flashT = FLASH_T;
      w.events |= EVENT_PORT;
    }
  } else {
    w.score += GATE_SCORE;
    w.events |= EVENT_PASS;
  }
  if (g.orb >= 0 && inside(w, g.orb, g.ox, g.oy)) {
    g.orb = -1;
    w.score += ORB_SCORE;
    w.events |= EVENT_ORB;
  }
}

/** Load Balancer: orbs ahead and within reach slide toward the ship. @param {World} w @param {number} dt */
function pullOrbs(w, dt) {
  const step = MAGNET_V * dt;
  for (const g of w.gates) {
    if (!g.active || g.orb < 0 || g.z <= 0) continue;
    const dx = w.sx - g.ox;
    const dy = w.sy - g.oy;
    const d = Math.hypot(dx, dy);
    if (d > MAGNET_REACH || d === 0) continue;
    const k = Math.min(1, step / d);
    g.ox += dx * k;
    g.oy += dy * k;
  }
}

/**
 * Garbage Collector: every gate ahead loses its blocks. Orbs and ports stay.
 * @param {World} w
 * @returns {number} gates cleared
 */
export function clearGates(w) {
  let n = 0;
  for (const g of w.gates) {
    if (!g.active || g.z <= 0 || !g.mask) continue;
    g.mask = 0;
    n += 1;
  }
  return n;
}

/**
 * Advance the world one fixed step. Mutates and returns `w`.
 * @param {World} w
 * @param {Intent} intent
 * @param {number} dt
 * @param {Powers} [powers] power-up help; none by default
 * @returns {World}
 */
export function stepWorld(w, intent, dt, powers = NO_POWERS) {
  w.prevSx = w.sx;
  w.prevSy = w.sy;
  w.prevDist = w.dist;
  for (const g of w.gates) g.prevZ = g.z;
  w.events = 0;
  w.time += dt;
  w.shakeT = Math.max(0, w.shakeT - dt);
  w.flashT = Math.max(0, w.flashT - dt);
  if (w.dead) {
    w.deadT += dt;
    return w;
  }
  if (w.time > START_GRACE) steer(w, intent, dt);
  const move = speedFor(w) * dt;
  w.dist += move;
  w.lastZ -= move;
  for (const g of w.gates) if (g.active) g.z -= move;
  if (powers.magnet) pullOrbs(w, dt);
  w.graceT = Math.max(0, w.graceT - dt);
  for (const g of w.gates) {
    if (!g.active || g.prevZ <= 0 || g.z > 0) continue;
    cross(w, g, powers);
    if (w.dead) return w;
  }
  // Passed gates fly on past the camera, then free their slot.
  for (const g of w.gates) if (g.active && g.z < -0.6) g.active = false;
  while (w.lastZ + gapFor(w) <= FAR && spawnGate(w, w.lastZ + gapFor(w)));
  return w;
}

/**
 * Fit a running world to a new canvas size. Everything is in trench units, so only the layout
 * and a drag's start change.
 * @param {World} w
 * @param {Area} size
 * @returns {World}
 */
export function resizeWorld(w, size) {
  Object.assign(w, layout(size));
  w.anchor = null;
  w.sx = clamp(w.sx, -1 + w.hx, 1 - w.hx);
  w.sy = clamp(w.sy, -1 + w.hy, 1 - w.hy);
  w.prevSx = w.sx;
  w.prevSy = w.sy;
  return w;
}
