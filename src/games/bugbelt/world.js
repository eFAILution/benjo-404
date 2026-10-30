// @ts-check
// The Bug Belt world and its fixed step (#94). No DOM, no host: tests drive it directly.
//
// The ship turns, thrusts, coasts, and wraps around the field like everything else in it. It
// fires shots that split the bugs (belt.js). A lost ship comes back in the middle once that is
// clear of bugs, and blinks through a short grace. Pools are allocated once in createWorld, and
// stepWorld only mutates.

import { wrap } from '../../shell/wrap.js';
import {
  addPop,
  apart2,
  bugR,
  crowded,
  drift,
  free,
  spawnWave,
  splitBug,
  stepBelt,
  stepOrbs,
} from './belt.js';
import {
  BOTTOM_PAD,
  BUG_HIT,
  BUG_POOL,
  CEILING,
  CEILING_NARROW,
  DRAG,
  EVENT_HIT,
  EVENT_SHOT,
  EVENT_WAVE,
  FIRE_GAP,
  GRACE_T,
  LIVES,
  MAX_V,
  MIN_HEIGHT,
  MIN_WIDTH,
  NARROW_WIDTH,
  ORB_POOL,
  POP_POOL,
  REF_HEIGHT,
  RESPAWN_T,
  SAFE_R,
  SAFE_SHARE,
  SHAKE_T,
  SHIP_H,
  SHIP_HIT,
  SHOT_LIFE,
  SHOT_POOL,
  SHOT_R,
  SHOT_V,
  START_GRACE,
  THRUST,
  THRUST_NEAR,
  TURN_RATE,
  UNIT_MAX,
  UNIT_MIN,
  WAVE_BONUS,
  WAVE_PAUSE,
} from './tuning.js';

/** @typedef {{ width: number, height: number }} Area */
/** @typedef {import('./belt.js').Motion} Motion */
/** @typedef {import('./belt.js').Body} Body */
/** @typedef {import('./belt.js').Bug} Bug */
/** @typedef {import('./belt.js').Orb} Orb */
/** @typedef {import('./belt.js').Pop} Pop */
/** @typedef {Body & { life: number }} Shot */
/**
 * What the player asks for this step. `turn` is -1 to 1, + clockwise. `fire` is a fresh press,
 * `firing` a held one. While a pointer steers, `px` and `py` are where it is in canvas px.
 * @typedef {{ turn: number, thrust: boolean, fire: boolean, firing: boolean,
 *   px: number | null, py: number | null }} Intent
 */
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
 * @property {number} ceiling top of the field, just below the HUD strip
 * @property {number} bottom
 * @property {number} shipH drawn ship height, px
 * @property {number} shipR ship hit radius, px
 * @property {number} safeR how far new bugs and a returning ship keep apart, px
 * @property {number} x ship center
 * @property {number} y
 * @property {number} a heading, radians, 0 pointing right
 * @property {number} vx
 * @property {number} vy
 * @property {number} prevX
 * @property {number} prevY
 * @property {number} prevA
 * @property {boolean} alive false while a lost ship waits to come back
 * @property {boolean} thrusting
 * @property {number} respawnT seconds the ship has been gone
 * @property {number} graceT seconds left of grace, 0 when none
 * @property {number} fireT seconds until a held fire shoots again
 * @property {number} wave
 * @property {number} waveT seconds left before the next wave, 0 when one is on
 * @property {number} spawned bugs made so far, for picking sprites
 * @property {number} lives
 * @property {number} score
 * @property {number} time seconds since start
 * @property {boolean} dead
 * @property {number} deadT
 * @property {number} shakeT
 * @property {number} events EVENT_* bits raised by the last step
 * @property {boolean} reducedMotion
 * @property {() => number} random
 * @property {Shot[]} shots
 * @property {Bug[]} bugs
 * @property {Orb[]} orbs
 * @property {Pop[]} pops
 */

/** No power-ups: what a step gets from a host without them. @type {Powers} */
const NO_POWERS = {};
const TAU = Math.PI * 2;
/** A held pointer thrusts only once the nose is this close to pointing at it, radians. */
const AIMED = 1;
/** Shots leave from this share of the ship's height ahead of its center. */
const NOSE = 0.6;

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @returns {Body} */
const body = () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, prevX: 0, prevY: 0 });

/** @param {Area} size */
export function layout(size) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const unit = clamp(height / REF_HEIGHT, UNIT_MIN, UNIT_MAX);
  const ceiling = size.width < NARROW_WIDTH ? CEILING_NARROW : CEILING;
  const bottom = height - BOTTOM_PAD;
  const shipH = SHIP_H * unit;
  const safeR = Math.min(SAFE_R * unit, SAFE_SHARE * Math.min(width, bottom - ceiling));
  return { width, height, unit, ceiling, bottom, shipH, shipR: SHIP_HIT * shipH, safeR };
}

/**
 * @param {Area} size
 * @param {() => number} random
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {World}
 */
export function createWorld(size, random, options = {}) {
  const lay = layout(size);
  const x = lay.width / 2;
  const y = (lay.ceiling + lay.bottom) / 2;
  /** @type {World} */
  const w = {
    ...lay,
    x,
    y,
    a: -Math.PI / 2,
    vx: 0,
    vy: 0,
    prevX: x,
    prevY: y,
    prevA: -Math.PI / 2,
    alive: true,
    thrusting: false,
    respawnT: 0,
    graceT: 0,
    fireT: 0,
    wave: 1,
    waveT: 0,
    spawned: 0,
    lives: LIVES,
    score: 0,
    time: 0,
    dead: false,
    deadT: 0,
    shakeT: 0,
    events: 0,
    reducedMotion: Boolean(options.reducedMotion),
    random,
    shots: Array.from({ length: SHOT_POOL }, () => ({ ...body(), life: 0 })),
    bugs: Array.from({ length: BUG_POOL }, () => ({
      ...body(),
      size: 0,
      rot: 0,
      prevRot: 0,
      spin: 0,
      sprite: 0,
    })),
    orbs: Array.from({ length: ORB_POOL }, () => ({ ...body(), life: 0, sprite: 0 })),
    pops: Array.from({ length: POP_POOL }, () => ({ active: false, x: 0, y: 0, t: 0, r: 0 })),
  };
  spawnWave(w);
  return w;
}

/** The short way from angle `a` to `b`, -PI to PI. @param {number} a @param {number} b */
const turnTo = (a, b) => wrap(b - a + Math.PI, TAU) - Math.PI;

/**
 * Keys turn and thrust. A held pointer turns the nose toward it, and thrusts there once the nose
 * points its way and it is farther than THRUST_NEAR; nearer, the ship only aims. Keys win.
 * @param {World} w @param {Intent} intent @param {number} dt
 */
function steer(w, intent, dt) {
  const turn = TURN_RATE * dt;
  w.thrusting = intent.thrust;
  if (intent.turn) {
    w.a += intent.turn * turn;
  } else if (intent.px !== null && intent.py !== null) {
    const dx = intent.px - w.x;
    const dy = intent.py - w.y;
    const off = turnTo(w.a, Math.atan2(dy, dx));
    w.a += clamp(off, -turn, turn);
    const far = Math.hypot(dx, dy) > THRUST_NEAR * w.unit;
    w.thrusting ||= far && Math.abs(off) < AIMED;
  }
  w.a = wrap(w.a, TAU);
  if (w.thrusting) {
    w.vx += Math.cos(w.a) * THRUST * w.unit * dt;
    w.vy += Math.sin(w.a) * THRUST * w.unit * dt;
  }
  const k = Math.exp(-DRAG * dt);
  w.vx *= k;
  w.vy *= k;
  const v = Math.hypot(w.vx, w.vy);
  const max = MAX_V * w.unit;
  if (v > max) {
    w.vx *= max / v;
    w.vy *= max / v;
  }
  drift(w, w, dt);
}

/** A shot from the nose, on the ship's own speed plus SHOT_V. @param {World} w */
function shoot(w) {
  const s = /** @type {Shot | null} */ (free(w.shots));
  if (!s) return;
  const cos = Math.cos(w.a);
  const sin = Math.sin(w.a);
  const x = wrap(w.x + cos * w.shipH * NOSE, w.width);
  const y = w.y + sin * w.shipH * NOSE;
  Object.assign(s, { active: true, x, y, prevX: x, prevY: y, life: SHOT_LIFE });
  s.vx = w.vx + cos * SHOT_V * w.unit;
  s.vy = w.vy + sin * SHOT_V * w.unit;
  w.fireT = FIRE_GAP;
  w.events |= EVENT_SHOT;
}

/** Shots fly, run out, and split the first bug they touch. @param {World} w @param {number} dt */
function stepShots(w, dt) {
  const r = SHOT_R * w.unit;
  for (const s of w.shots) {
    if (!s.active) continue;
    drift(w, s, dt);
    s.life -= dt;
    if (s.life <= 0) {
      s.active = false;
      continue;
    }
    for (const b of w.bugs) {
      if (!b.active) continue;
      const reach = bugR(w, b.size) * BUG_HIT + r;
      if (apart2(w, s.x, s.y, b) >= reach * reach) continue;
      s.active = false;
      splitBug(w, b, true);
      break;
    }
  }
}

/**
 * A bug that touches the ship costs a life and splits, unless the ship is in its grace or the
 * Digital Twin takes the hit. The last life ends the run.
 * @param {World} w @param {Powers} powers
 */
function collide(w, powers) {
  if (!w.alive || w.graceT > 0) return;
  for (const b of w.bugs) {
    if (!b.active) continue;
    const reach = bugR(w, b.size) * BUG_HIT + w.shipR;
    if (apart2(w, w.x, w.y, b) >= reach * reach) continue;
    if (powers.absorb?.()) {
      w.graceT = GRACE_T;
      return;
    }
    splitBug(w, b, false);
    addPop(w, w.x, w.y, w.shipH);
    w.alive = false;
    w.thrusting = false;
    w.respawnT = 0;
    w.lives -= 1;
    w.shakeT = SHAKE_T;
    w.events |= EVENT_HIT;
    if (w.lives <= 0) {
      w.dead = true;
      w.deadT = 0;
    }
    return;
  }
}

/** A lost ship comes back in the middle, still and pointing up, once the middle is clear. @param {World} w @param {number} dt */
function respawn(w, dt) {
  w.respawnT += dt;
  const x = w.width / 2;
  const y = (w.ceiling + w.bottom) / 2;
  if (w.respawnT < RESPAWN_T || crowded(w, x, y)) return;
  Object.assign(w, { alive: true, x, y, prevX: x, prevY: y, vx: 0, vy: 0, graceT: GRACE_T });
  w.a = -Math.PI / 2;
  w.prevA = w.a;
}

/** A cleared belt scores a bonus; the next wave comes after a short pause. @param {World} w @param {number} dt */
function stepWave(w, dt) {
  if (w.waveT > 0) {
    w.waveT -= dt;
    if (w.waveT > 0) return;
    w.waveT = 0;
    w.wave += 1;
    spawnWave(w);
    w.events |= EVENT_WAVE;
    return;
  }
  if (w.bugs.some((b) => b.active)) return;
  w.score += WAVE_BONUS;
  w.waveT = WAVE_PAUSE;
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
  w.prevA = w.a;
  w.events = 0;
  w.time += dt;
  w.shakeT = Math.max(0, w.shakeT - dt);
  stepBelt(w, dt);
  if (w.dead) {
    w.deadT += dt;
    return w;
  }
  w.graceT = Math.max(0, w.graceT - dt);
  w.fireT = Math.max(0, w.fireT - dt);
  if (!w.alive) respawn(w, dt);
  else if (w.time > START_GRACE) {
    steer(w, intent, dt);
    if (intent.fire || (intent.firing && w.fireT === 0)) shoot(w);
  }
  stepShots(w, dt);
  stepOrbs(w, dt, Boolean(powers.magnet));
  collide(w, powers);
  stepWave(w, dt);
  return w;
}

/**
 * Fit a running world to a new canvas size. Everything keeps its share of the field, and speeds
 * scale with the unit.
 * @param {World} w
 * @param {Area} size
 * @returns {World}
 */
export function resizeWorld(w, size) {
  const old = { width: w.width, ceiling: w.ceiling, fieldH: w.bottom - w.ceiling, unit: w.unit };
  Object.assign(w, layout(size));
  const fieldH = w.bottom - w.ceiling;
  const v = w.unit / old.unit;
  /** @param {Motion} b */
  const fit = (b) => {
    b.x = (b.x / old.width) * w.width;
    b.y = w.ceiling + ((b.y - old.ceiling) / old.fieldH) * fieldH;
    b.prevX = b.x;
    b.prevY = b.y;
    b.vx *= v;
    b.vy *= v;
  };
  fit(w);
  for (const list of [w.shots, w.bugs, w.orbs]) for (const b of list) fit(b);
  for (const p of w.pops) p.active = false;
  return w;
}
