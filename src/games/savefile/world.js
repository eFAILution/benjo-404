// @ts-check
// The Save the File world and its fixed step (#92). No DOM, no host: tests drive it directly.
//
// Everything is in level units (level.js); only layout() knows pixels, so a resize is a new
// layout. Pools are allocated once in createWorld, and stepWorld only mutates.

import {
  BIN_X,
  FILE_X,
  GIRDERS,
  girderY,
  LADDERS,
  onGirder,
  START_X,
  THROWER_X,
  TOP,
} from './level.js';
import {
  BENJO_HALF_W,
  BENJO_HIT_H,
  BOTTOM_PAD,
  BUG_POOL,
  BUG_R,
  BUG_SPEED,
  BUG_SPEED_CAP,
  BUG_SPEED_CAP_REDUCED,
  BUG_SPEED_LEVEL,
  CEILING,
  CEILING_NARROW,
  CLEAR_SCORE,
  CLEAR_T,
  CLIMB,
  EVENT_CLEAR,
  EVENT_HIT,
  EVENT_HOP,
  EVENT_JUMP,
  EVENT_ORB,
  EVENT_THROW,
  FALL_DRIFT,
  FIRST_THROW,
  GRACE_T,
  GRAVITY,
  HIT_T,
  HOLD_T,
  JUMP_SCORE,
  JUMP_V,
  LADDER_CHANCE,
  LADDER_CHANCE_MAX,
  LADDER_CHANCE_STEP,
  LADDER_GAP,
  LADDER_PACE,
  LADDER_REACH,
  LEVEL_H,
  LEVEL_W,
  LIVES,
  MAGNET_V,
  MIN_HEIGHT,
  MIN_WIDTH,
  NARROW_WIDTH,
  ORB_R,
  ORB_SCORE,
  SHAKE_T,
  SIDE_PAD,
  START_GRACE,
  STRETCH_MAX,
  THROW_JITTER,
  THROW_T,
  THROW_T_MIN,
  THROW_T_STEP,
  TIME_SCORE,
  TIME_START,
  WALK,
} from './tuning.js';

/** @typedef {{ width: number, height: number }} Area */
/**
 * What the player asks for this step. `mx` walks (-1 left, 1 right) and `my` climbs (-1 up). A
 * swipe sets `climb` to take a whole ladder. While a finger is held, `px` is where it is in canvas
 * px and `held` how long it has been down.
 * @typedef {{ mx: number, my: number, jump: boolean, climb: number, px: number | null,
 *   held: number }} Intent
 */
/**
 * A bug rolls along girder `g`, falls off its end, or climbs down `ladder`. `hopped` is the jump
 * that already scored for passing it, so one jump scores each bug once.
 * @typedef {{ active: boolean, state: 'roll' | 'fall' | 'ladder', x: number, y: number,
 *   prevX: number, prevY: number, g: number, dir: number, vy: number, ladder: number,
 *   sprite: number, hopped: number }} Bug
 */
/** @typedef {{ active: boolean, x: number, g: number }} Orb */
/**
 * Power-up help from the host (#22), read during a step.
 * @typedef {{ magnet?: boolean, absorb?: () => boolean }} Powers
 */
/**
 * @typedef {object} World
 * @property {number} width
 * @property {number} height
 * @property {number} ceiling
 * @property {number} bottom
 * @property {number} ox screen x of the level's left edge
 * @property {number} oy screen y of the level's top edge
 * @property {number} kx px per level unit across
 * @property {number} ky px per level unit down; sprites use kx
 * @property {number} x Benjo's feet, level units
 * @property {number} y
 * @property {number} prevX
 * @property {number} prevY
 * @property {'walk' | 'climb' | 'jump'} state
 * @property {number} g girder Benjo stands or jumps on; while climbing, the ladder's bottom
 * @property {number} ladder the ladder Benjo is on, or -1
 * @property {number} vx
 * @property {number} vy
 * @property {number} facing 1 right, -1 left
 * @property {number} autoClimb a swipe's climb, -1 up or 1 down, until the ladder ends
 * @property {number} jumps jumps so far, so each one scores a bug once
 * @property {number} level
 * @property {number} lives
 * @property {number} score
 * @property {number} clock seconds left to save the file
 * @property {number} throwT seconds until the next bug
 * @property {number} throwFlash seconds the thrower shows its throw
 * @property {number} pauseT pause left after a lost life or a saved file, 0 when playing
 * @property {'hit' | 'clear' | null} pause
 * @property {number} time seconds since start
 * @property {boolean} dead the run is over
 * @property {'bug' | 'time' | null} hit what took the last life
 * @property {number} deadT
 * @property {number} graceT seconds left of the Digital Twin's grace, 0 when none
 * @property {number} shakeT
 * @property {number} events EVENT_* bits raised by the last step
 * @property {boolean} reducedMotion
 * @property {() => number} random
 * @property {Bug[]} bugs
 * @property {Orb[]} orbs
 */

/** No power-ups: what a step gets from a host without them. @type {Powers} */
const NO_POWERS = {};

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @param {Area} size */
export function layout(size) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const ceiling = size.width < NARROW_WIDTH ? CEILING_NARROW : CEILING;
  const bottom = height - BOTTOM_PAD;
  const fitW = (width - 2 * SIDE_PAD) / LEVEL_W;
  const fitH = (bottom - ceiling) / LEVEL_H;
  const kx = Math.min(fitW, fitH);
  const ky = Math.min(fitH, kx * STRETCH_MAX);
  return {
    width,
    height,
    ceiling,
    bottom,
    kx,
    ky,
    ox: (width - LEVEL_W * kx) / 2,
    oy: ceiling + (bottom - ceiling - LEVEL_H * ky) / 2,
  };
}

/** Bug speed for the level, capped lower with reduced motion. @param {World} w */
export function bugSpeedFor(w) {
  const cap = w.reducedMotion ? BUG_SPEED_CAP_REDUCED : BUG_SPEED_CAP;
  return Math.min(cap, BUG_SPEED * (1 + BUG_SPEED_LEVEL * (w.level - 1)));
}

/** Base seconds between throws for the level. @param {World} w */
export const throwFor = (w) => Math.max(THROW_T_MIN, THROW_T - THROW_T_STEP * (w.level - 1));

/** Chance a bug at the top of a ladder takes it. @param {World} w */
export const ladderChanceFor = (w) =>
  Math.min(LADDER_CHANCE_MAX, LADDER_CHANCE + LADDER_CHANCE_STEP * (w.level - 1));

/** Put Benjo back at the start, clear the bugs, scatter the orbs, and reset the clock. @param {World} w */
function resetLevel(w) {
  w.x = START_X;
  w.y = girderY(0, START_X);
  w.prevX = w.x;
  w.prevY = w.y;
  w.state = 'walk';
  w.g = 0;
  w.ladder = -1;
  w.vx = 0;
  w.vy = 0;
  w.facing = 1;
  w.autoClimb = 0;
  w.clock = TIME_START;
  w.throwT = FIRST_THROW;
  for (const b of w.bugs) b.active = false;
  w.orbs.forEach((o, i) => {
    const { x0, x1 } = GIRDERS[i + 1];
    o.active = true;
    o.g = i + 1;
    o.x = x0 + 48 + w.random() * (x1 - x0 - 96);
  });
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
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    state: 'walk',
    g: 0,
    ladder: -1,
    vx: 0,
    vy: 0,
    facing: 1,
    autoClimb: 0,
    jumps: 0,
    level: 1,
    lives: LIVES,
    score: 0,
    clock: TIME_START,
    throwT: FIRST_THROW,
    throwFlash: 0,
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
    bugs: Array.from({ length: BUG_POOL }, () => ({
      active: false,
      state: /** @type {Bug['state']} */ ('roll'),
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
      g: 0,
      dir: 1,
      vy: 0,
      ladder: -1,
      sprite: 0,
      hopped: 0,
    })),
    orbs: Array.from({ length: GIRDERS.length - 2 }, () => ({ active: false, x: 0, g: 1 })),
  };
  resetLevel(w);
  return w;
}

/** The ladder near Benjo that goes `way` (-1 up, 1 down) from girder `g`, or -1. @param {World} w @param {number} way */
function ladderFrom(w, way) {
  for (let i = 0; i < LADDERS.length; i++) {
    const l = LADDERS[i];
    if ((way < 0 ? l.bottom : l.top) === w.g && Math.abs(l.x - w.x) <= LADDER_REACH) return i;
  }
  return -1;
}

/** @param {World} w @param {number} i @param {number} way */
function startClimb(w, i, way) {
  w.state = 'climb';
  w.ladder = i;
  w.x = LADDERS[i].x;
  w.g = LADDERS[i].bottom;
  w.autoClimb = way;
}

/**
 * Benjo walks, starts up or down a ladder, climbs, or jumps. A held finger walks him toward it;
 * keys win over the finger.
 * @param {World} w @param {Intent} intent @param {number} dt
 */
function moveBenjo(w, intent, dt) {
  let mx = intent.mx;
  if (!mx && intent.px !== null && intent.held >= HOLD_T) {
    const target = (intent.px - w.ox) / w.kx;
    if (Math.abs(target - w.x) > 4) mx = Math.sign(target - w.x);
  }
  if (w.state === 'climb') {
    const l = LADDERS[w.ladder];
    const way = intent.my || w.autoClimb;
    w.y += way * CLIMB * dt;
    const top = girderY(l.top, l.x);
    const bottom = girderY(l.bottom, l.x);
    if (w.y <= top || w.y >= bottom) {
      w.g = w.y <= top ? l.top : l.bottom;
      w.y = girderY(w.g, w.x);
      w.state = 'walk';
      w.ladder = -1;
      w.autoClimb = 0;
    }
    return;
  }
  if (w.state === 'jump') {
    w.x = clamp(w.x + w.vx * dt, GIRDERS[w.g].x0 + BENJO_HALF_W, GIRDERS[w.g].x1 - BENJO_HALF_W);
    w.vy += GRAVITY * dt;
    w.y += w.vy * dt;
    if (w.vy > 0 && w.y >= girderY(w.g, w.x)) {
      w.y = girderY(w.g, w.x);
      w.state = 'walk';
    }
    return;
  }
  const way = intent.my || intent.climb;
  const ladder = way ? ladderFrom(w, way) : -1;
  if (ladder >= 0) return startClimb(w, ladder, intent.climb);
  if (intent.jump) {
    w.state = 'jump';
    w.vy = -JUMP_V;
    w.vx = mx * WALK;
    w.jumps += 1;
    w.events |= EVENT_JUMP;
    return;
  }
  if (mx) w.facing = mx;
  w.x = clamp(w.x + mx * WALK * dt, GIRDERS[w.g].x0 + BENJO_HALF_W, GIRDERS[w.g].x1 - BENJO_HALF_W);
  w.y = girderY(w.g, w.x);
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

/** The thrower sends a new bug rolling along the top girder. @param {World} w */
function throwBug(w) {
  const b = free(w.bugs);
  if (!b) return;
  const top = TOP - 1;
  Object.assign(b, {
    active: true,
    state: 'roll',
    x: THROWER_X + 20,
    g: top,
    dir: GIRDERS[top].dir,
    vy: 0,
    ladder: -1,
    sprite: Math.floor(w.random() * 8),
    hopped: 0,
  });
  b.y = girderY(top, b.x) - BUG_R;
  b.prevX = b.x;
  b.prevY = b.y;
  w.throwFlash = 0.3;
  w.events |= EVENT_THROW;
}

/** Is a bug rolling on girder `g` within LADDER_GAP of `x`? @param {World} w @param {number} g @param {number} x */
const crowded = (w, g, x) =>
  w.bugs.some((o) => o.active && o.state === 'roll' && o.g === g && Math.abs(o.x - x) < LADDER_GAP);

/**
 * One bug's step: roll, maybe take a ladder it crosses (unless another bug is near its foot),
 * fall off an open end onto the girder below, or go in the bin.
 * @param {World} w @param {Bug} b @param {number} dt
 */
function moveBug(w, b, dt) {
  const speed = bugSpeedFor(w);
  if (b.state === 'ladder') {
    const l = LADDERS[b.ladder];
    b.y += speed * LADDER_PACE * dt;
    const floor = girderY(l.bottom, l.x) - BUG_R;
    if (b.y >= floor) {
      b.y = floor;
      b.g = l.bottom;
      b.dir = GIRDERS[b.g].dir;
      b.state = 'roll';
    }
    return;
  }
  if (b.state === 'fall') {
    b.x += b.dir * speed * FALL_DRIFT * dt;
    b.vy += GRAVITY * dt;
    b.y += b.vy * dt;
    const below = b.g - 1;
    if (below >= 0 && onGirder(below, b.x) && b.y >= girderY(below, b.x) - BUG_R) {
      b.g = below;
      b.y = girderY(below, b.x) - BUG_R;
      b.dir = GIRDERS[below].dir;
      b.state = 'roll';
    } else if (b.y > LEVEL_H + 40) b.active = false;
    return;
  }
  const from = b.x;
  b.x += b.dir * speed * dt;
  if (b.g === 0 && b.x < BIN_X) {
    b.active = false;
    return;
  }
  if (!onGirder(b.g, b.x)) {
    b.state = 'fall';
    b.vy = 0;
    return;
  }
  b.y = girderY(b.g, b.x) - BUG_R;
  for (let i = 0; i < LADDERS.length; i++) {
    const l = LADDERS[i];
    if (l.top !== b.g || l.top === TOP || (from - l.x) * (b.x - l.x) > 0) continue;
    if (w.random() < ladderChanceFor(w) && !crowded(w, l.bottom, l.x)) {
      b.state = 'ladder';
      b.ladder = i;
      b.x = l.x;
    }
    return;
  }
}

/** Does Benjo's hitbox touch a circle at (x, y) of radius r? @param {World} w @param {number} x @param {number} y @param {number} r */
function touches(w, x, y, r) {
  const dx = clamp(x, w.x - BENJO_HALF_W, w.x + BENJO_HALF_W) - x;
  const dy = clamp(y, w.y - BENJO_HIT_H, w.y) - y;
  return dx * dx + dy * dy < r * r;
}

/** A jump scores each rolling bug on Benjo's girder that passes under him. @param {World} w @param {Bug} b */
function hop(w, b) {
  if (w.state !== 'jump' || b.state !== 'roll' || b.g !== w.g || b.hopped === w.jumps) return;
  if ((b.prevX - w.prevX) * (b.x - w.x) > 0) return;
  b.hopped = w.jumps;
  w.score += JUMP_SCORE;
  w.events |= EVENT_HOP;
}

/** Lose a life, or the run. @param {World} w @param {'bug' | 'time'} what */
function loseLife(w, what) {
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
}

/** Benjo reached the file: bank the clock and go up a level after a pause. @param {World} w */
function saveFile(w) {
  w.score += CLEAR_SCORE + Math.floor(w.clock) * TIME_SCORE;
  w.events |= EVENT_CLEAR;
  w.pause = 'clear';
  w.pauseT = CLEAR_T;
}

/** Load Balancer: orbs on Benjo's girder slide to him. @param {World} w @param {number} dt */
function pullOrbs(w, dt) {
  for (const o of w.orbs) {
    if (o.active && o.g === w.g) o.x += clamp(w.x - o.x, -MAGNET_V * dt, MAGNET_V * dt);
  }
}

/**
 * Garbage Collector: every bug in the level goes in the bin.
 * @param {World} w
 * @returns {number} bugs cleared
 */
export function clearBugs(w) {
  let n = 0;
  for (const b of w.bugs) {
    if (!b.active) continue;
    b.active = false;
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
  w.prevX = w.x;
  w.prevY = w.y;
  for (const b of w.bugs) {
    b.prevX = b.x;
    b.prevY = b.y;
  }
  w.events = 0;
  w.time += dt;
  w.shakeT = Math.max(0, w.shakeT - dt);
  w.throwFlash = Math.max(0, w.throwFlash - dt);
  if (w.dead) {
    w.deadT += dt;
    return w;
  }
  if (w.pauseT > 0) {
    w.pauseT = Math.max(0, w.pauseT - dt);
    if (w.pauseT > 0) return w;
    if (w.pause === 'clear') w.level += 1;
    w.pause = null;
    resetLevel(w);
    return w;
  }

  if (w.time > START_GRACE) moveBenjo(w, intent, dt);
  w.graceT = Math.max(0, w.graceT - dt);
  w.clock = Math.max(0, w.clock - dt);
  w.throwT -= dt;
  if (w.throwT <= 0) {
    throwBug(w);
    w.throwT = throwFor(w) * (1 + THROW_JITTER * (2 * w.random() - 1));
  }
  if (powers.magnet) pullOrbs(w, dt);
  for (const b of w.bugs) {
    if (!b.active) continue;
    moveBug(w, b, dt);
    if (!b.active) continue;
    hop(w, b);
    if (w.graceT > 0 || !touches(w, b.x, b.y, BUG_R - 2)) continue;
    if (powers.absorb?.()) {
      w.graceT = GRACE_T;
      continue;
    }
    loseLife(w, 'bug');
    return w;
  }
  for (const o of w.orbs) {
    if (!o.active || !touches(w, o.x, girderY(o.g, o.x) - ORB_R - 4, ORB_R)) continue;
    o.active = false;
    w.score += ORB_SCORE;
    w.events |= EVENT_ORB;
  }
  if (w.g === TOP && w.state === 'walk' && Math.abs(w.x - FILE_X) < 20) saveFile(w);
  else if (w.clock === 0) loseLife(w, 'time');
  return w;
}

/**
 * Fit a running world to a new canvas size. Everything is in level units, so only the layout
 * changes.
 * @param {World} w
 * @param {Area} size
 * @returns {World}
 */
export const resizeWorld = (w, size) => Object.assign(w, layout(size));
