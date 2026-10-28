// @ts-check
// The Whack-a-Bug world and its fixed step. No DOM, no host: tests drive it directly.
//
// Five holes are logical and fixed; only the layout (cell size and hole centers) follows the
// canvas. Each hole holds at most one thing, which rises, waits, then sinks.

import {
  BOTTOM_PAD,
  BUG_SCORE,
  CEILING,
  CEILING_NARROW,
  CELL_MAX,
  COMBO_BONUS,
  COMBO_MAX,
  DECOY_CHANCE,
  DECOY_COST,
  EVENT_DECOY,
  EVENT_MISS,
  EVENT_SQUASH,
  EVENT_WHIFF,
  HOLE_COL,
  HOLE_ROW,
  MAX_UP_CAP,
  MAX_UP_START,
  MAX_UP_STEP_T,
  MIN_HEIGHT,
  MIN_WIDTH,
  NARROW_WIDTH,
  POP_T,
  REF_HEIGHT,
  ROUND_T,
  SHAKE_T,
  SIDE_PAD,
  SPAWN_T_MIN,
  SPAWN_T_START,
  START_GRACE,
  STOMP_T,
  TIMER_ROOM,
  TWIN_GRACE,
  UNIT_MAX,
  UNIT_MIN,
  UP_T_MIN,
  UP_T_START,
} from './tuning.js';

/** @typedef {{ width: number, height: number }} Area */
/** @typedef {{ hole: number }} Intent */
/**
 * What the host's power-ups ask of a step (#22). The world never calls the host itself.
 * magnet: bugs pop up next to Benjo and features keep away. absorb: the Digital Twin.
 * @typedef {{ absorb?: () => boolean, magnet?: boolean }} Assist
 */
/**
 * @typedef {object} Hole
 * @property {'bug' | 'decoy' | null} kind
 * @property {number} id spawn number, so tests can tell one visit from the next
 * @property {number} t seconds since it spawned
 * @property {number} upT seconds it stays up before sinking on its own
 * @property {boolean} sinking
 * @property {number} sinkT
 * @property {boolean} squashed
 * @property {number} sprite
 * @property {number} lift 0 hidden to 1 fully up
 * @property {number} prevLift
 */
/**
 * @typedef {object} World
 * @property {number} width
 * @property {number} height
 * @property {number} unit
 * @property {number} ceiling screen y just below the HUD strip
 * @property {number} playX left edge of the play rect
 * @property {number} playW
 * @property {number} cell side of one grid cell
 * @property {number[]} holeX screen x of each hole's center
 * @property {number[]} holeY screen y of each hole's center
 * @property {number} time seconds since start
 * @property {number} prevTime
 * @property {number} spawnClock
 * @property {number} spawned
 * @property {boolean} dead true once the clock runs out
 * @property {number} deadT
 * @property {number} score
 * @property {number} hits
 * @property {number} missed bugs that sank unsquashed
 * @property {number} combo
 * @property {number} events EVENT_* bits raised by the last step
 * @property {number} lastHole where Benjo hovers
 * @property {number} stompT
 * @property {number} oopsT time left on the decoy shake
 * @property {number} grace seconds left of the twin's save, while mistakes cost nothing
 * @property {boolean} reducedMotion
 * @property {() => number} random
 * @property {Hole[]} holes
 */

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @param {Area} size */
function layout(size) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const unit = clamp(height / REF_HEIGHT, UNIT_MIN, UNIT_MAX);
  const ceiling = width < NARROW_WIDTH ? CEILING_NARROW : CEILING;
  const playW = width - SIDE_PAD * 2;
  const room = height - BOTTOM_PAD - ceiling - TIMER_ROOM * unit;
  const cell = Math.max(1, Math.min(playW / 3, room / 3, CELL_MAX * unit));
  const gridX = SIDE_PAD + (playW - cell * 3) / 2;
  const gridY = ceiling + TIMER_ROOM * unit + (room - cell * 3) / 2;
  return {
    width,
    height,
    unit,
    ceiling,
    playX: SIDE_PAD,
    playW,
    cell,
    holeX: HOLE_COL.map((c) => gridX + (c + 0.5) * cell),
    holeY: HOLE_ROW.map((r) => gridY + (r + 0.5) * cell),
  };
}

/**
 * @param {Area} size
 * @param {() => number} random
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {World}
 */
export function createWorld(size, random, options = {}) {
  return {
    ...layout(size),
    time: 0,
    prevTime: 0,
    spawnClock: 0,
    spawned: 0,
    dead: false,
    deadT: 0,
    score: 0,
    hits: 0,
    missed: 0,
    combo: 0,
    events: 0,
    lastHole: 0,
    stompT: 0,
    oopsT: 0,
    grace: 0,
    reducedMotion: Boolean(options.reducedMotion),
    random,
    holes: HOLE_COL.map(() => ({
      kind: null,
      id: 0,
      t: 0,
      upT: 0,
      sinking: false,
      sinkT: 0,
      squashed: false,
      sprite: 0,
      lift: 0,
      prevLift: 0,
    })),
  };
}

/** How far through the round, 0 to 1. @param {World} w */
const progress = (w) => Math.min(1, w.time / ROUND_T);

/** Seconds between spawns: shrinks toward SPAWN_T_MIN over the round. @param {World} w */
export const spawnGapFor = (w) => SPAWN_T_START + (SPAWN_T_MIN - SPAWN_T_START) * progress(w);

/** Seconds a thing stays up: shrinks toward UP_T_MIN over the round. @param {World} w */
export const upTimeFor = (w) => UP_T_START + (UP_T_MIN - UP_T_START) * progress(w);

/** @param {World} w */
export const maxUpFor = (w) =>
  Math.min(MAX_UP_CAP, MAX_UP_START + Math.floor(w.time / MAX_UP_STEP_T));

/**
 * Which hole's cell holds this point, or -1.
 * @param {World} w @param {number} x @param {number} y
 */
export function holeAt(w, x, y) {
  const half = w.cell / 2;
  for (let i = 0; i < w.holes.length; i++) {
    if (Math.abs(x - w.holeX[i]) <= half && Math.abs(y - w.holeY[i]) <= half) return i;
  }
  return -1;
}

/** @param {World} w @param {Hole} hole */
function startSink(w, hole) {
  hole.sinking = true;
  hole.sinkT = 0;
  if (w.reducedMotion) hole.kind = null;
}

/** @type {Assist} */
const NO_ASSIST = {};

/**
 * A mistake that would cost points or a combo: true when the twin's grace or the twin takes it.
 * @param {World} w @param {Assist} assist
 */
function forgiven(w, assist) {
  if (w.grace > 0) return true;
  if (!assist.absorb?.()) return false;
  w.grace = TWIN_GRACE;
  return true;
}

/** Age every thing: rise, time out, sink, clear. @param {World} w @param {number} dt @param {Assist} assist */
function ageHoles(w, dt, assist) {
  for (const hole of w.holes) {
    if (!hole.kind) continue;
    hole.t += dt;
    if (hole.sinking) {
      hole.sinkT += dt;
      if (hole.sinkT >= POP_T) hole.kind = null;
    } else if (hole.t >= hole.upT) {
      if (hole.kind === 'bug') {
        // A missed bug only costs the combo, so with no combo it never spends the twin.
        if (w.combo > 0 && !forgiven(w, assist)) w.combo = 0;
        w.missed += 1;
        w.events |= EVENT_MISS;
      }
      startSink(w, hole);
    }
  }
}

/** @param {World} w @param {number} h hole id @param {Assist} assist */
function whack(w, h, assist) {
  const hole = w.holes[h];
  w.lastHole = h;
  w.stompT = STOMP_T;
  if (hole.kind === 'bug' && !hole.sinking) {
    hole.squashed = true;
    startSink(w, hole);
    w.hits += 1;
    w.combo += 1;
    w.score += BUG_SCORE + Math.min(COMBO_BONUS * (w.combo - 1), COMBO_MAX);
    w.events |= EVENT_SQUASH;
  } else if (hole.kind === 'decoy' && !hole.sinking) {
    startSink(w, hole);
    if (forgiven(w, assist)) return;
    w.score = Math.max(0, w.score - DECOY_COST);
    w.combo = 0;
    w.oopsT = SHAKE_T;
    w.events |= EVENT_DECOY;
  } else {
    if (w.combo > 0 && !forgiven(w, assist)) w.combo = 0;
    w.events |= EVENT_WHIFF;
  }
}

/**
 * Every spawn gap, put a bug or a decoy in a random empty hole. Under the magnet the bug goes to
 * the empty hole nearest Benjo and the decoy to the farthest.
 * @param {World} w @param {number} dt @param {boolean} magnet
 */
function spawn(w, dt, magnet) {
  w.spawnClock += dt;
  if (w.spawnClock < spawnGapFor(w)) return;
  w.spawnClock = 0;
  let up = 0;
  let empty = 0;
  for (const hole of w.holes) {
    if (hole.kind && !hole.sinking) up += 1;
    if (!hole.kind) empty += 1;
  }
  if (up >= maxUpFor(w) || empty === 0) return;
  if (magnet) {
    const decoy = rollDecoy(w);
    fill(w, w.holes[pulledHole(w, decoy)], decoy);
    return;
  }
  let pick = Math.floor(w.random() * empty);
  for (const hole of w.holes) {
    if (hole.kind || pick-- > 0) continue;
    fill(w, hole, rollDecoy(w));
    return;
  }
}

/** The first thing is always a bug, so the player learns what to hit before a decoy shows. @param {World} w */
const rollDecoy = (w) => w.random() < DECOY_CHANCE && w.spawned > 0;

/**
 * The empty hole nearest Benjo for a bug, or farthest for a decoy. Ties go to the lower index.
 * @param {World} w @param {boolean} decoy
 */
function pulledHole(w, decoy) {
  const bx = w.holeX[w.lastHole];
  const by = w.holeY[w.lastHole];
  let best = -1;
  let bestD = 0;
  for (let i = 0; i < w.holes.length; i++) {
    if (w.holes[i].kind) continue;
    const d = (w.holeX[i] - bx) ** 2 + (w.holeY[i] - by) ** 2;
    if (best < 0 || (decoy ? d > bestD : d < bestD)) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/** @param {World} w @param {Hole} hole an empty hole @param {boolean} decoy */
function fill(w, hole, decoy) {
  w.spawned += 1;
  hole.kind = decoy ? 'decoy' : 'bug';
  hole.id = w.spawned;
  hole.t = 0;
  hole.upT = upTimeFor(w);
  hole.sinking = false;
  hole.sinkT = 0;
  hole.squashed = false;
  hole.sprite = Math.floor(w.random() * 1000);
}

/** @param {World} w */
function updateLift(w) {
  for (const hole of w.holes) {
    if (!hole.kind) hole.lift = 0;
    else if (w.reducedMotion) hole.lift = 1;
    else if (hole.sinking) hole.lift = Math.max(0, 1 - hole.sinkT / POP_T);
    else hole.lift = Math.min(1, hole.t / POP_T);
  }
}

/**
 * Advance the world one fixed step. Mutates and returns `w`.
 * @param {World} w
 * @param {Intent} intent the hole the player whacked this step, or -1
 * @param {number} dt
 * @param {Assist} [assist] power-up hooks from the host; none in plain play
 * @returns {World}
 */
export function stepWorld(w, intent, dt, assist = NO_ASSIST) {
  w.prevTime = w.time;
  for (const hole of w.holes) hole.prevLift = hole.lift;
  w.events = 0;
  w.time += dt;
  w.stompT = Math.max(0, w.stompT - dt);
  w.oopsT = Math.max(0, w.oopsT - dt);
  w.grace = Math.max(0, w.grace - dt);
  ageHoles(w, dt, assist);

  if (w.dead) {
    w.deadT += dt;
  } else if (w.time >= ROUND_T) {
    // Time's up: everything still showing crawls back in without counting as a miss.
    w.dead = true;
    w.deadT = 0;
    for (const hole of w.holes) if (hole.kind && !hole.sinking) startSink(w, hole);
  } else {
    if (w.time > START_GRACE && intent.hole >= 0) whack(w, intent.hole, assist);
    spawn(w, dt, Boolean(assist.magnet));
  }
  updateLift(w);
  return w;
}

/**
 * Garbage Collector: squash every bug that is up, for its base points. Features stay. Returns
 * how many it squashed; none once the clock has run out.
 * @param {World} w
 * @returns {number}
 */
export function zapBugs(w) {
  if (w.dead) return 0;
  let zapped = 0;
  for (const hole of w.holes) {
    if (hole.kind !== 'bug' || hole.sinking) continue;
    hole.squashed = true;
    startSink(w, hole);
    w.hits += 1;
    w.score += BUG_SCORE;
    zapped += 1;
  }
  return zapped;
}

/**
 * Fit a running world to a new canvas size. Holes are logical, so only the layout changes.
 * @param {World} w
 * @param {Area} size
 * @returns {World}
 */
export function resizeWorld(w, size) {
  return Object.assign(w, layout(size));
}
