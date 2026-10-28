// @ts-check
// The Stack the Server world and its fixed step. No DOM, no host: tests drive it directly.
//
// Blocks sit on whole levels (the base is level 0), so a block's height on screen comes from its
// level, the block height, and the camera, and only x and width are stored. The camera counts
// levels the stack has been shifted down. Pools are allocated once; stepWorld only mutates.

import {
  BASE_W,
  BASE_W_FRAC,
  BENJO_EASE,
  BLOCK_H,
  BLOCK_H_MIN,
  BOTTOM_PAD,
  CAM_FRAC,
  CAM_SPARE,
  CAM_T,
  CEILING,
  CEILING_NARROW,
  CUT_GRAVITY,
  CUT_POOL,
  CUT_T,
  DROP_T,
  EVENT_LAND,
  EVENT_MISS,
  EVENT_PERFECT,
  EVENT_WIDEN,
  MAX_BLOCKS,
  MIN_HEIGHT,
  MIN_WIDTH,
  NARROW_WIDTH,
  PERFECT_MIN,
  PERFECT_STREAK,
  PERFECT_TOL,
  REF_HEIGHT,
  SIDE_PAD,
  SLIDE_CAP,
  SLIDE_CAP_REDUCED,
  SLIDE_START,
  SLIDE_STEP,
  START_GRACE,
  TWIN_GRACE,
  UNIT_MAX,
  UNIT_MIN,
  WIDEN,
} from './tuning.js';

/** @typedef {{ width: number, height: number }} Area */
/** @typedef {{ level: number, x: number, w: number }} Block */
/** @typedef {{ active: boolean, level: number, x: number, w: number, fall: number, vy: number, t: number }} Cut */
/**
 * What the host's power-ups ask of a step (#22). The world never calls the host itself.
 * @typedef {{ absorb?: () => boolean }} Assist
 */
/**
 * @typedef {object} World
 * @property {number} width
 * @property {number} height
 * @property {number} unit
 * @property {number} ceiling screen y of the top of the play rect, just below the HUD strip
 * @property {number} left
 * @property {number} right
 * @property {number} bottom screen y the base block stands on
 * @property {number} playW
 * @property {number} playH
 * @property {number} blockH
 * @property {number} baseW
 * @property {number} perfectTol px a drop may miss by and still count as perfect
 * @property {number} keep levels shown before the camera follows
 * @property {Block[]} blocks ring indexed by level % MAX_BLOCKS
 * @property {Cut[]} cuts
 * @property {number} x left edge of the moving block
 * @property {number} prevX
 * @property {number} bw width of the moving block
 * @property {number} dir 1 sliding right, -1 sliding left
 * @property {number} benjoX screen x of Benjo's center
 * @property {number} prevBenjoX
 * @property {number} hold seconds Benjo still waits over the landed block
 * @property {number} grace seconds left of the twin's save: the mover waits and drops are ignored
 * @property {number} cam levels the stack is shifted down
 * @property {number} prevCam
 * @property {number} camTarget
 * @property {number} dropT seconds since the last landing
 * @property {number} streak perfects in a row
 * @property {number} perfects
 * @property {number} time seconds since start
 * @property {boolean} dead
 * @property {'miss' | null} hit what ended the run
 * @property {number} deadT
 * @property {number} score height: blocks landed on the base
 * @property {number} events EVENT_* bits raised by the last step
 * @property {boolean} reducedMotion
 * @property {() => number} random
 */

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @param {Area} size */
function layout(size) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const unit = clamp(height / REF_HEIGHT, UNIT_MIN, UNIT_MAX);
  const ceiling = width < NARROW_WIDTH ? CEILING_NARROW : CEILING;
  const bottom = height - BOTTOM_PAD;
  const playW = width - SIDE_PAD * 2;
  const playH = bottom - ceiling;
  const blockH = Math.max(BLOCK_H_MIN, BLOCK_H * unit);
  return {
    width,
    height,
    unit,
    ceiling,
    left: SIDE_PAD,
    right: width - SIDE_PAD,
    bottom,
    playW,
    playH,
    blockH,
    baseW: Math.min(BASE_W * unit, playW * BASE_W_FRAC),
    perfectTol: Math.max(PERFECT_MIN, PERFECT_TOL * unit),
    keep: clamp(Math.floor((playH * CAM_FRAC) / blockH), 1, MAX_BLOCKS - CAM_SPARE),
  };
}

/**
 * @template T
 * @param {number} n
 * @param {() => T} make
 * @returns {T[]}
 */
const pool = (n, make) => Array.from({ length: n }, make);

/** The block on top of the stack. @param {World} w */
export const topBlock = (w) => w.blocks[w.score % MAX_BLOCKS];

/** Camera levels that keep the stack inside CAM_FRAC of the play height. @param {World} w */
const camFor = (w) => Math.max(0, w.score + 1 - w.keep);

/** Put a fresh moving block one level up, odd levels from the left edge. @param {World} w */
function spawnMover(w) {
  const fromLeft = (w.score + 1) % 2 === 1;
  w.bw = topBlock(w).w;
  w.x = fromLeft ? w.left : w.right - w.bw;
  w.prevX = w.x;
  w.dir = fromLeft ? 1 : -1;
}

/**
 * @param {Area} size
 * @param {() => number} random
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {World}
 */
export function createWorld(size, random, options = {}) {
  const l = layout(size);
  /** @type {World} */
  const w = {
    ...l,
    blocks: pool(MAX_BLOCKS, () => ({ level: -1, x: 0, w: 0 })),
    cuts: pool(CUT_POOL, () => ({ active: false, level: 0, x: 0, w: 0, fall: 0, vy: 0, t: 0 })),
    x: 0,
    prevX: 0,
    bw: 0,
    dir: 1,
    benjoX: 0,
    prevBenjoX: 0,
    hold: 0,
    grace: 0,
    cam: 0,
    prevCam: 0,
    camTarget: 0,
    dropT: DROP_T,
    streak: 0,
    perfects: 0,
    time: 0,
    dead: false,
    hit: null,
    deadT: 0,
    score: 0,
    events: 0,
    reducedMotion: Boolean(options.reducedMotion),
    random,
  };
  Object.assign(w.blocks[0], { level: 0, x: l.left + (l.playW - l.baseW) / 2, w: l.baseW });
  spawnMover(w);
  w.benjoX = w.prevBenjoX = w.x + w.bw / 2;
  return w;
}

/** Slide speed for the current height, px/s. @param {World} w */
export function speedFor(w) {
  const cap = w.reducedMotion ? SLIDE_CAP_REDUCED : SLIDE_CAP;
  return Math.min(cap, (SLIDE_START + SLIDE_STEP * w.score) * w.unit);
}

/** @param {World} w @param {number} dt */
function slide(w, dt) {
  const maxX = w.right - w.bw;
  w.x += w.dir * speedFor(w) * dt;
  if (w.x >= maxX) {
    w.x = maxX;
    w.dir = -1;
  } else if (w.x <= w.left) {
    w.x = w.left;
    w.dir = 1;
  }
}

/** A falling cut piece; none with reduced motion. @param {World} w @param {number} level @param {number} x @param {number} width */
function spawnCut(w, level, x, width) {
  if (w.reducedMotion || width <= 0) return;
  for (let i = 0; i < w.cuts.length; i++) {
    const c = w.cuts[i];
    if (c.active) continue;
    c.active = true;
    c.level = level;
    c.x = x;
    c.w = width;
    c.fall = 0;
    c.vy = 0;
    c.t = 0;
    return;
  }
}

/** Every PERFECT_STREAK perfects the block grows back toward the base width. @param {World} w @param {Block} b */
function widen(w, b) {
  const grown = Math.max(b.w, Math.min(w.baseW, b.w + WIDEN * w.unit));
  if (grown === b.w) return;
  b.x = clamp(b.x - (grown - b.w) / 2, w.left, w.right - grown);
  b.w = grown;
  w.events |= EVENT_WIDEN;
}

/** @type {Assist} */
const NO_ASSIST = {};

/** Drop the moving block onto the stack. @param {World} w @param {Assist} assist */
function land(w, assist) {
  const top = topBlock(w);
  const level = w.score + 1;
  const lo = Math.max(w.x, top.x);
  const hi = Math.min(w.x + w.bw, top.x + top.w);
  const next = w.blocks[level % MAX_BLOCKS];
  if (hi - lo <= 0) {
    if (assist.absorb?.()) {
      // The Digital Twin catches the block: it lands square on the stack, no perfect, no cut.
      next.level = level;
      next.x = top.x;
      next.w = top.w;
      w.streak = 0;
      w.grace = TWIN_GRACE;
      settle(w, level);
      return;
    }
    spawnCut(w, level, w.x, w.bw);
    w.dead = true;
    w.hit = 'miss';
    w.deadT = 0;
    w.events |= EVENT_MISS;
    return;
  }
  next.level = level;
  if (Math.abs(w.x - top.x) <= w.perfectTol) {
    next.x = top.x;
    next.w = top.w;
    w.streak += 1;
    w.perfects += 1;
    w.events |= EVENT_PERFECT;
    if (w.streak % PERFECT_STREAK === 0) widen(w, next);
  } else {
    next.x = lo;
    next.w = hi - lo;
    w.streak = 0;
    spawnCut(w, level, w.x, lo - w.x);
    spawnCut(w, level, hi, w.x + w.bw - hi);
  }
  settle(w, level);
}

/** The landed block is the new top: score it, move the camera, send the next one. @param {World} w @param {number} level */
function settle(w, level) {
  w.score = level;
  w.events |= EVENT_LAND;
  w.dropT = 0;
  w.hold = DROP_T;
  w.camTarget = camFor(w);
  if (w.reducedMotion) w.cam = w.camTarget;
  spawnMover(w);
}

/** @param {World} w @param {number} dt */
function ageCuts(w, dt) {
  for (let i = 0; i < w.cuts.length; i++) {
    const c = w.cuts[i];
    if (!c.active) continue;
    c.t += dt;
    c.vy += CUT_GRAVITY * w.unit * dt;
    c.fall += c.vy * dt;
    if (c.t >= CUT_T) c.active = false;
  }
}

/** Benjo waits over the landed block, then glides to the moving one. @param {World} w @param {number} dt */
function followBenjo(w, dt) {
  const top = topBlock(w);
  const target = w.hold > 0 ? top.x + top.w / 2 : w.x + w.bw / 2;
  const ease = w.reducedMotion ? 1 : Math.min(1, BENJO_EASE * dt);
  w.benjoX += (target - w.benjoX) * ease;
}

/**
 * Advance the world one fixed step. Mutates and returns `w`.
 * @param {World} w
 * @param {boolean} drop the player dropped the block this step
 * @param {number} dt
 * @param {Assist} [assist] power-up hooks from the host; none in plain play
 * @returns {World}
 */
export function stepWorld(w, drop, dt, assist = NO_ASSIST) {
  w.prevX = w.x;
  w.prevCam = w.cam;
  w.prevBenjoX = w.benjoX;
  w.events = 0;
  w.time += dt;
  w.dropT += dt;
  w.hold = Math.max(0, w.hold - dt);
  const resting = w.grace > 0;
  w.grace = Math.max(0, w.grace - dt);
  ageCuts(w, dt);
  w.cam = w.reducedMotion ? w.camTarget : Math.min(w.camTarget, w.cam + dt / CAM_T);
  if (w.dead) {
    w.deadT += dt;
    return w;
  }
  // During the twin's grace the next block waits at its edge, so a panicked tap is not a miss.
  if (resting) {
    followBenjo(w, dt);
    return w;
  }
  if (drop && w.time > START_GRACE) land(w, assist);
  else slide(w, dt);
  followBenjo(w, dt);
  return w;
}

/**
 * Fit a running world to a new canvas size. x and widths scale with the play width, heights
 * follow the new block height, and the camera is re-fit so the stack stays in the play rect.
 * @param {World} w
 * @param {Area} size
 * @returns {World}
 */
export function resizeWorld(w, size) {
  const l = layout(size);
  const kx = l.playW / w.playW;
  const ky = l.blockH / w.blockH;
  /** @param {number} x */
  const mapX = (x) => l.left + (x - w.left) * kx;
  for (const b of w.blocks) {
    b.x = mapX(b.x);
    b.w *= kx;
  }
  for (const c of w.cuts) {
    c.x = mapX(c.x);
    c.w *= kx;
    c.fall *= ky;
    c.vy *= ky;
  }
  w.x = mapX(w.x);
  w.bw *= kx;
  w.benjoX = mapX(w.benjoX);
  Object.assign(w, l);
  for (const b of w.blocks) b.x = clamp(b.x, w.left, w.right - b.w);
  w.x = w.prevX = clamp(w.x, w.left, w.right - w.bw);
  w.prevBenjoX = w.benjoX;
  w.camTarget = camFor(w);
  w.cam = w.prevCam = w.camTarget;
  return w;
}
