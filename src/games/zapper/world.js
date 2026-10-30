// @ts-check
// The Bug Zapper world and its fixed step. No DOM, no host: tests drive it directly.
//
// Bugs keep a logical column and row; their screen spot is the formation origin plus the
// column and row steps (formation.js). Pools are allocated once in createWorld, and stepWorld
// only mutates.

import {
  biteSpeedFor,
  bugX,
  bugY,
  layout,
  liftFormation,
  moveFormation,
  nextBiter,
  resetFormation,
} from './formation.js';
import {
  BENJO_SPEED,
  BITE_H,
  BITE_POOL,
  BITE_W,
  BOLT_H,
  BOLT_POOL,
  BOLT_SPEED,
  BOLT_W,
  BUG_BOX,
  BUG_SCORE,
  COLS,
  EVENT_FIRE,
  EVENT_HIT,
  EVENT_KILL,
  EVENT_WAVE,
  FIRE_COOLDOWN,
  GRACE_T,
  HIT_T,
  LIVES,
  POINTER_SPEED,
  POP_POOL,
  POP_T,
  ROWS,
  START_GRACE,
  WAVE_BONUS,
  WAVE_PAUSE,
} from './tuning.js';

/** @typedef {{ width: number, height: number }} Area */
/** @typedef {{ move: number, targetX: number | null, fire: boolean, firing: boolean }} Intent */
/** @typedef {{ alive: boolean, col: number, row: number }} Bug */
/** @typedef {{ active: boolean, x: number, y: number, prevY: number }} Shot */
/** @typedef {{ active: boolean, x: number, y: number, prevY: number, t: number }} Pop */
/**
 * Power-up help from the host (#22), read during a step.
 * @typedef {{ absorb: () => boolean }} Aid
 */
/**
 * @typedef {object} World
 * @property {number} width
 * @property {number} height
 * @property {number} unit
 * @property {number} ceiling top of the play rect, just below the HUD strip
 * @property {number} left
 * @property {number} right
 * @property {number} bottom
 * @property {number} benjoH
 * @property {number} benjoY screen y of Benjo's center
 * @property {number} hitR
 * @property {number} bugH
 * @property {number} colStep
 * @property {number} rowStep
 * @property {number} bx screen x of Benjo's center
 * @property {number} prevBx
 * @property {number} originX center x of column 0
 * @property {number} originY center y of row 0
 * @property {number} prevOriginX
 * @property {number} prevOriginY
 * @property {number} dir 1 moving right, -1 moving left
 * @property {number} alive living bugs in the formation
 * @property {number} wave
 * @property {number} lives
 * @property {number} score
 * @property {number} time seconds since start
 * @property {number} cooldown seconds until Benjo may fire again
 * @property {number} biteT seconds until the next bite drops
 * @property {number} waveT seconds until the next formation, 0 while one is out
 * @property {number} hitT hit stop left after a bite, 0 when playing
 * @property {boolean} dead
 * @property {'bite' | 'reached' | null} hit what ended the run
 * @property {number} deadT
 * @property {number} graceT seconds left of the Digital Twin's grace, 0 when none
 * @property {number} events EVENT_* bits raised by the last step
 * @property {boolean} reducedMotion
 * @property {() => number} random
 * @property {Bug[]} bugs row * COLS + col
 * @property {Shot[]} bolts
 * @property {Shot[]} bites
 * @property {Pop[]} pops
 */

/** No power-ups: what a step gets from a host without them. @type {Aid} */
export const NO_AID = { absorb: () => false };

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @template T
 * @param {number} n
 * @param {(i: number) => T} make
 * @returns {T[]}
 */
const pool = (n, make) => Array.from({ length: n }, (_, i) => make(i));

/**
 * @template {{ active: boolean }} T
 * @param {T[]} list
 * @returns {T | null}
 */
function free(list) {
  for (let i = 0; i < list.length; i++) if (!list[i].active) return list[i];
  return null;
}

/** @param {Shot | Pop} s @param {number} x @param {number} y */
function launch(s, x, y) {
  s.active = true;
  s.x = x;
  s.y = y;
  s.prevY = y;
}

/**
 * @param {Area} size
 * @param {() => number} random
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {World}
 */
export function createWorld(size, random, options = {}) {
  const l = layout(size);
  const bx = (l.left + l.right) / 2;
  const shot = () => ({ active: false, x: 0, y: 0, prevY: 0 });
  /** @type {World} */
  const w = {
    ...l,
    bx,
    prevBx: bx,
    originX: 0,
    originY: 0,
    prevOriginX: 0,
    prevOriginY: 0,
    dir: 1,
    alive: 0,
    wave: 1,
    lives: LIVES,
    score: 0,
    time: 0,
    cooldown: 0,
    biteT: 0,
    waveT: 0,
    hitT: 0,
    dead: false,
    hit: null,
    deadT: 0,
    graceT: 0,
    events: 0,
    reducedMotion: Boolean(options.reducedMotion),
    random,
    bugs: pool(ROWS * COLS, (i) => ({ alive: true, col: i % COLS, row: Math.floor(i / COLS) })),
    bolts: pool(BOLT_POOL, shot),
    bites: pool(BITE_POOL, shot),
    pops: pool(POP_POOL, () => ({ ...shot(), t: 0 })),
  };
  resetFormation(w);
  return w;
}

/** Keys move at a fixed speed; otherwise Benjo chases the pointer, bounded. @param {World} w @param {Intent} intent @param {number} dt */
function moveBenjo(w, intent, dt) {
  if (intent.move) w.bx += intent.move * BENJO_SPEED * w.unit * dt;
  else if (intent.targetX !== null) {
    const step = POINTER_SPEED * w.unit * dt;
    w.bx += clamp(intent.targetX - w.bx, -step, step);
  }
  w.bx = clamp(w.bx, w.left + w.benjoH / 2, w.right - w.benjoH / 2);
}

/** @param {World} w @param {Intent} intent */
function tryFire(w, intent) {
  if (!(intent.fire || intent.firing) || w.cooldown > 0) return;
  const bolt = free(w.bolts);
  if (!bolt) return;
  launch(bolt, w.bx, w.benjoY - w.benjoH / 2);
  w.cooldown = FIRE_COOLDOWN;
  w.events |= EVENT_FIRE;
}

/** @param {World} w @param {Bug} b @param {Shot} bolt */
function kill(w, b, bolt) {
  bolt.active = false;
  squash(w, b);
}

/** A bug dies for points; the last one clears the wave. @param {World} w @param {Bug} b */
function squash(w, b) {
  b.alive = false;
  w.alive -= 1;
  w.score += BUG_SCORE * w.wave;
  w.events |= EVENT_KILL;
  const p = free(w.pops);
  if (p) {
    launch(p, bugX(w, b), bugY(w, b));
    p.t = 0;
  }
  if (w.alive > 0) return;
  w.score += WAVE_BONUS * w.wave;
  w.wave += 1;
  w.waveT = WAVE_PAUSE;
  w.events |= EVENT_WAVE;
}

/**
 * Garbage Collector: every bug and bite on screen goes at once. Bugs score as kills, so the
 * wave clears as usual.
 * @param {World} w
 * @returns {number} hazards cleared
 */
export function sweep(w) {
  let n = 0;
  for (const s of w.bites) {
    if (!s.active) continue;
    s.active = false;
    n += 1;
  }
  for (const b of w.bugs) {
    if (!b.alive) continue;
    squash(w, b);
    n += 1;
  }
  return n;
}

/**
 * True when the grace, or a fresh twin, takes a hit. A fresh twin starts the grace.
 * @param {World} w @param {Aid} aid
 */
function shielded(w, aid) {
  if (w.graceT > 0) return true;
  if (!aid.absorb()) return false;
  w.graceT = GRACE_T;
  return true;
}

/** The lowest living bug a bolt swept through this step, or null. @param {World} w @param {Shot} s */
function bugHit(w, s) {
  const half = (BUG_BOX * w.bugH) / 2;
  const top = s.y - (BOLT_H * w.unit) / 2;
  const bottom = s.prevY + (BOLT_H * w.unit) / 2;
  const reach = half + (BOLT_W * w.unit) / 2;
  for (let i = w.bugs.length - 1; i >= 0; i--) {
    const b = w.bugs[i];
    if (!b.alive || Math.abs(bugX(w, b) - s.x) > reach) continue;
    const y = bugY(w, b);
    if (y + half >= top && y - half <= bottom) return b;
  }
  return null;
}

/** @param {World} w @param {number} dt */
function moveBolts(w, dt) {
  for (const s of w.bolts) {
    if (!s.active) continue;
    s.y -= BOLT_SPEED * w.unit * dt;
    const b = w.alive > 0 ? bugHit(w, s) : null;
    if (b) kill(w, b, s);
    else if (s.y + (BOLT_H * w.unit) / 2 < w.ceiling) s.active = false;
  }
}

/** A bite the twin takes vanishes; any other costs a life. @param {World} w @param {number} dt @param {Aid} aid */
function moveBites(w, dt, aid) {
  const halfW = (BITE_W * w.unit) / 2;
  const halfH = (BITE_H * w.unit) / 2;
  for (const s of w.bites) {
    if (!s.active) continue;
    s.y += biteSpeedFor(w) * dt;
    const dx = w.bx - clamp(w.bx, s.x - halfW, s.x + halfW);
    const dy = w.benjoY - clamp(w.benjoY, s.prevY - halfH, s.y + halfH);
    if (dx * dx + dy * dy < w.hitR * w.hitR) {
      if (!shielded(w, aid)) return bitten(w);
      s.active = false;
      continue;
    }
    if (s.y - halfH > w.height) s.active = false;
  }
}

/** A bite costs a life and clears the air; the last one ends the run. @param {World} w */
function bitten(w) {
  w.lives -= 1;
  w.events |= EVENT_HIT;
  for (const s of w.bolts) s.active = false;
  for (const s of w.bites) s.active = false;
  if (w.lives <= 0) die(w, 'bite');
  else w.hitT = HIT_T;
}

/** @param {World} w @param {'bite' | 'reached'} what */
function die(w, what) {
  w.dead = true;
  w.hit = what;
  w.deadT = 0;
  w.events |= EVENT_HIT;
}

/**
 * Move the formation, or wait out the pause between waves. Bugs that reach Benjo's row end the
 * run, unless the twin pushes them back up.
 * @param {World} w @param {number} dt @param {Aid} aid
 */
function stepFormation(w, dt, aid) {
  if (w.waveT > 0) {
    w.waveT -= dt;
    if (w.waveT <= 0) {
      w.waveT = 0;
      resetFormation(w);
    }
    return;
  }
  if (moveFormation(w, dt)) {
    if (!shielded(w, aid)) return die(w, 'reached');
    liftFormation(w);
    return;
  }
  const biter = nextBiter(w, dt);
  const bite = biter ? free(w.bites) : null;
  if (biter && bite) launch(bite, bugX(w, biter), bugY(w, biter) + w.bugH / 2);
}

/**
 * Advance the world one fixed step. Mutates and returns `w`.
 * @param {World} w
 * @param {Intent} intent
 * @param {number} dt
 * @param {Aid} [aid] power-up help; none by default
 * @returns {World}
 */
export function stepWorld(w, intent, dt, aid = NO_AID) {
  w.prevBx = w.bx;
  w.prevOriginX = w.originX;
  w.prevOriginY = w.originY;
  for (const s of w.bolts) s.prevY = s.y;
  for (const s of w.bites) s.prevY = s.y;
  w.events = 0;
  w.time += dt;
  for (const p of w.pops) {
    p.t += dt;
    if (p.t >= POP_T) p.active = false;
  }
  if (w.dead) {
    w.deadT += dt;
    return w;
  }
  w.graceT = Math.max(0, w.graceT - dt);
  if (w.hitT > 0) {
    w.hitT = Math.max(0, w.hitT - dt);
    return w;
  }

  w.cooldown = Math.max(0, w.cooldown - dt);
  if (w.time > START_GRACE) {
    moveBenjo(w, intent, dt);
    tryFire(w, intent);
  }
  moveBolts(w, dt);
  stepFormation(w, dt, aid);
  if (!w.dead) moveBites(w, dt, aid);
  return w;
}

export { resizeWorld } from './formation.js';
