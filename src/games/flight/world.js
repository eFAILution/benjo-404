// @ts-check
// The Benjo Flight world and its fixed step. No DOM, no host: tests drive it directly.
//
// Towers, pickups, and pops live at world x (the scroll distance at which they sit at the
// left edge), so the screen x is `x - scroll` and render interpolates with the scroll alone.
// Every pool is allocated once in createWorld, and stepWorld only mutates.

import {
  BENJO_H,
  BENJO_X_FRAC,
  BENJO_X_MAX,
  CEILING,
  CEILING_NARROW,
  EVENT_FLAP,
  EVENT_HIT,
  EVENT_PICKUP,
  EVENT_SCORE,
  FLAP_V,
  GAP_EDGE,
  GAP_MIN,
  GAP_SHIFT,
  GAP_START,
  GAP_STEP,
  GRAVITY,
  GROUND_FRAC,
  HIT_R,
  HOVER_AMP,
  HOVER_RATE,
  MAX_FALL,
  MIN_HEIGHT,
  MIN_WIDTH,
  NARROW_WIDTH,
  PICKUP_CHANCE,
  PICKUP_H,
  PICKUP_POOL,
  PICKUP_SCORE,
  PICKUP_SPREAD,
  POP_POOL,
  POP_T,
  REF_HEIGHT,
  SPEED_CAP,
  SPEED_CAP_REDUCED,
  SPEED_START,
  SPEED_STEP,
  START_GRACE,
  TOWER_POOL,
  TOWER_SPACING,
  TOWER_W,
  TOWERS_PER_SCREEN,
  UNIT_MAX,
  UNIT_MIN,
} from './tuning.js';

/** @typedef {{ width: number, height: number }} Area */
/** @typedef {{ active: boolean, x: number, gapY: number, gap: number, sprite: number, passed: boolean }} Tower */
/** @typedef {{ active: boolean, x: number, y: number, sprite: number }} Orb */
/** @typedef {{ active: boolean, x: number, y: number, t: number }} Pop */
/**
 * @typedef {object} World
 * @property {number} width
 * @property {number} height
 * @property {number} ceiling screen y Benjo cannot fly above, just below the HUD strip
 * @property {number} groundY screen y of the ground line
 * @property {number} unit
 * @property {number} benjoX screen x of Benjo's center
 * @property {number} benjoH
 * @property {number} spacing px between tower starts
 * @property {number} hitR
 * @property {number} by screen y of Benjo's center
 * @property {number} vy px/s, positive is down
 * @property {number} prevBy
 * @property {number} scroll
 * @property {number} prevScroll
 * @property {number} time seconds since start
 * @property {boolean} ready true until the first flap: Benjo hovers and nothing scrolls
 * @property {boolean} dead
 * @property {'tower' | 'ground' | null} hit what ended the run
 * @property {number} deadT
 * @property {number} score
 * @property {number} collected
 * @property {number} events EVENT_* bits raised by the last step
 * @property {number} nextTowerX world x of the next tower to spawn
 * @property {number} lastGapY
 * @property {number} towerCount
 * @property {boolean} reducedMotion
 * @property {() => number} random
 * @property {Tower[]} towers
 * @property {Orb[]} orbs
 * @property {Pop[]} pops
 */

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @param {Area} size */
function layout(size) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const unit = clamp(height / REF_HEIGHT, UNIT_MIN, UNIT_MAX);
  return {
    width,
    height,
    unit,
    ceiling: size.width < NARROW_WIDTH ? CEILING_NARROW : CEILING,
    groundY: Math.round(height * GROUND_FRAC),
    benjoX: Math.round(Math.min(width * BENJO_X_FRAC, BENJO_X_MAX * unit)),
    benjoH: BENJO_H * unit,
    spacing: Math.max(TOWER_SPACING * unit, width / TOWERS_PER_SCREEN),
  };
}

/**
 * Where Benjo hovers before the first flap: midway between the ceiling and the ground.
 * @param {{ ceiling: number, groundY: number }} l
 */
const restY = (l) => (l.ceiling + l.groundY) / 2;

/**
 * @template T
 * @param {number} n
 * @param {() => T} make
 * @returns {T[]}
 */
const pool = (n, make) => Array.from({ length: n }, make);

/**
 * @param {Area} size
 * @param {() => number} random
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {World}
 */
export function createWorld(size, random, options = {}) {
  const l = layout(size);
  const by = restY(l);
  return {
    ...l,
    hitR: l.benjoH * HIT_R,
    by,
    vy: 0,
    prevBy: by,
    scroll: 0,
    prevScroll: 0,
    time: 0,
    ready: true,
    dead: false,
    hit: null,
    deadT: 0,
    score: 0,
    collected: 0,
    events: 0,
    nextTowerX: 0,
    lastGapY: by,
    towerCount: 0,
    reducedMotion: Boolean(options.reducedMotion),
    random,
    towers: pool(TOWER_POOL, () => ({
      active: false,
      x: 0,
      gapY: 0,
      gap: 0,
      sprite: 0,
      passed: false,
    })),
    orbs: pool(PICKUP_POOL, () => ({ active: false, x: 0, y: 0, sprite: 0 })),
    pops: pool(POP_POOL, () => ({ active: false, x: 0, y: 0, t: 0 })),
  };
}

/**
 * Gap height for the current score: it starts wide and narrows to GAP_MIN.
 * @param {World} w
 */
export const gapFor = (w) => Math.max(GAP_MIN, GAP_START - GAP_STEP * w.score) * w.unit;

/** @param {World} w */
export function speedFor(w) {
  const cap = w.reducedMotion ? SPEED_CAP_REDUCED : SPEED_CAP;
  return Math.min(cap, SPEED_START + SPEED_STEP * w.score) * w.unit;
}

/** Lowest and highest gap center that keeps the whole gap clear of ceiling and ground. @param {World} w @param {number} gap */
function gapRange(w, gap) {
  const lo = w.ceiling + GAP_EDGE * w.unit + gap / 2;
  const hi = w.groundY - GAP_EDGE * w.unit - gap / 2;
  const mid = restY(w);
  return lo <= hi ? [lo, hi] : [mid, mid];
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
 * @param {World} w
 * @returns {boolean} false when the pool is full, so the caller stops spawning this step
 */
function spawnTower(w) {
  const tower = free(w.towers);
  if (!tower) return false;
  const gap = gapFor(w);
  const [lo, hi] = gapRange(w, gap);
  const shift = GAP_SHIFT * w.unit;
  const from = clamp(w.lastGapY - shift, lo, hi);
  const to = clamp(w.lastGapY + shift, lo, hi);
  const gapY = from + (to - from) * w.random();

  // A pickup on the way to this tower, near the line between the two gaps.
  const orb = w.towerCount > 0 && w.random() < PICKUP_CHANCE ? free(w.orbs) : null;
  if (orb) {
    orb.active = true;
    orb.x = w.nextTowerX - (w.spacing - TOWER_W * w.unit) / 2;
    const spread = (w.random() * 2 - 1) * gap * PICKUP_SPREAD;
    orb.y = clamp((w.lastGapY + gapY) / 2 + spread, lo, hi);
    orb.sprite = Math.floor(w.random() * 1000);
  }

  tower.active = true;
  tower.x = w.nextTowerX;
  tower.gapY = gapY;
  tower.gap = gap;
  tower.sprite = Math.floor(w.random() * 1000);
  tower.passed = false;
  w.lastGapY = gapY;
  w.towerCount += 1;
  w.nextTowerX += w.spacing;
  return true;
}

/**
 * Does a circle at (cx, cy) with radius r touch the rectangle?
 * @param {number} cx @param {number} cy @param {number} r
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 */
function circleHitsRect(cx, cy, r, x0, y0, x1, y1) {
  const dx = cx - clamp(cx, x0, x1);
  const dy = cy - clamp(cy, y0, y1);
  return dx * dx + dy * dy < r * r;
}

/** @param {World} w */
function hitsTower(w) {
  const towerW = TOWER_W * w.unit;
  for (let i = 0; i < w.towers.length; i++) {
    const t = w.towers[i];
    if (!t.active) continue;
    const x0 = t.x - w.scroll;
    if (x0 > w.benjoX + w.hitR || x0 + towerW < w.benjoX - w.hitR) continue;
    const top = t.gapY - t.gap / 2;
    const bottom = t.gapY + t.gap / 2;
    if (circleHitsRect(w.benjoX, w.by, w.hitR, x0, -w.height, x0 + towerW, top)) return true;
    if (circleHitsRect(w.benjoX, w.by, w.hitR, x0, bottom, x0 + towerW, w.groundY)) return true;
  }
  return false;
}

/** @param {World} w @param {number} x @param {number} y */
function pop(w, x, y) {
  const p = free(w.pops);
  if (!p) return;
  p.active = true;
  p.x = x;
  p.y = y;
  p.t = 0;
}

/** Score passed towers, collect pickups, and retire whatever left the screen. @param {World} w */
function scoreAndRetire(w) {
  const towerW = TOWER_W * w.unit;
  const margin = w.benjoH;
  for (let i = 0; i < w.towers.length; i++) {
    const t = w.towers[i];
    if (!t.active) continue;
    const x0 = t.x - w.scroll;
    if (!t.passed && x0 + towerW < w.benjoX - w.hitR) {
      t.passed = true;
      w.score += 1;
      w.events |= EVENT_SCORE;
    }
    if (x0 + towerW < -margin) t.active = false;
  }
  const reach = w.hitR + (PICKUP_H * w.unit) / 2;
  for (let i = 0; i < w.orbs.length; i++) {
    const orb = w.orbs[i];
    if (!orb.active) continue;
    const x = orb.x - w.scroll;
    const dx = x - w.benjoX;
    const dy = orb.y - w.by;
    if (dx * dx + dy * dy < reach * reach) {
      orb.active = false;
      w.score += PICKUP_SCORE;
      w.collected += 1;
      w.events |= EVENT_PICKUP;
      pop(w, orb.x, orb.y);
    } else if (x < -margin) {
      orb.active = false;
    }
  }
}

/** @param {World} w @param {number} dt */
function agePops(w, dt) {
  for (let i = 0; i < w.pops.length; i++) {
    const p = w.pops[i];
    if (!p.active) continue;
    p.t += dt;
    if (p.t >= POP_T) p.active = false;
  }
}

/** @param {World} w @param {'tower' | 'ground'} what */
function die(w, what) {
  w.dead = true;
  w.hit = what;
  w.deadT = 0;
  w.events |= EVENT_HIT;
}

/**
 * Advance the world one fixed step. Mutates and returns `w`.
 * @param {World} w
 * @param {boolean} flap the player flapped this step
 * @param {number} dt
 * @returns {World}
 */
export function stepWorld(w, flap, dt) {
  w.prevBy = w.by;
  w.prevScroll = w.scroll;
  w.events = 0;
  w.time += dt;
  agePops(w, dt);
  const live = w.time > START_GRACE;

  if (w.dead) {
    w.deadT += dt;
    w.vy = Math.min(MAX_FALL * w.unit, w.vy + GRAVITY * w.unit * dt);
    w.by = Math.min(w.groundY - w.hitR, w.by + w.vy * dt);
    return w;
  }

  if (w.ready) {
    if (!(live && flap)) {
      const rest = restY(w);
      w.by = w.reducedMotion ? rest : rest + Math.sin(w.time * HOVER_RATE) * HOVER_AMP * w.unit;
      return w;
    }
    w.ready = false;
    w.lastGapY = w.by;
    w.nextTowerX = w.width + TOWER_W * w.unit;
  }

  if (live && flap) {
    w.vy = -FLAP_V * w.unit;
    w.events |= EVENT_FLAP;
  }
  w.vy = Math.min(MAX_FALL * w.unit, w.vy + GRAVITY * w.unit * dt);
  w.by += w.vy * dt;
  if (w.by - w.hitR < w.ceiling) {
    w.by = w.ceiling + w.hitR;
    w.vy = Math.max(0, w.vy);
  }

  w.scroll += speedFor(w) * dt;
  while (w.nextTowerX - w.scroll < w.width + TOWER_W * w.unit && spawnTower(w));
  scoreAndRetire(w);

  if (w.by + w.hitR >= w.groundY) {
    w.by = w.groundY - w.hitR;
    die(w, 'ground');
  } else if (hitsTower(w)) {
    die(w, 'tower');
  }
  return w;
}

/**
 * Fit a running world to a new canvas size. Heights scale with the ground line and lengths
 * with the unit, so the run carries on where it was.
 * @param {World} w
 * @param {Area} size
 * @returns {World}
 */
export function resizeWorld(w, size) {
  const l = layout(size);
  const ky = l.groundY / w.groundY;
  const kx = l.unit / w.unit;
  w.by *= ky;
  w.prevBy *= ky;
  w.vy *= kx;
  w.lastGapY *= ky;
  w.scroll *= kx;
  w.prevScroll *= kx;
  w.nextTowerX *= kx;
  for (const t of w.towers) {
    t.x *= kx;
    t.gapY *= ky;
    t.gap *= kx;
  }
  for (const orb of w.orbs) {
    orb.x *= kx;
    orb.y *= ky;
  }
  for (const p of w.pops) {
    p.x *= kx;
    p.y *= ky;
  }
  Object.assign(w, l, { hitR: l.benjoH * HIT_R });
  w.by = clamp(w.by, w.ceiling + w.hitR, w.groundY - w.hitR);
  return w;
}
