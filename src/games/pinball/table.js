// @ts-check
// The table's moving parts: balls, flippers, plunger, drop targets, spinner, saucer, ramp, bugs,
// and the moves between decks. Scoring and missions live in rules.js; this file reports hits.
// Pure: no DOM, no host. The world is plain data, so Rollback can copy it.

import { DECKS } from './decks.js';
import { makeBall, moveBall, restAngle, swing } from './physics.js';
import { hit, startRules, tick } from './rules.js';
import {
  AUTO_PULL,
  BALL_R,
  BUG_EVERY,
  BUG_MAX,
  BUG_SPEED,
  DECK_SLIDE_T,
  DRAIN_Y,
  DROP_RESET_T,
  LAUNCH_MAX,
  LAUNCH_MIN,
  NUDGE_V,
  PULL_T,
  RAMP_T,
  SAUCER_GRAB,
  SAUCER_HOLD,
  SPIN_DECAY,
  SPIN_PER_SPEED,
  STILL_SPEED,
  STILL_T,
  SUBSTEPS,
  TARGET_COOLDOWN,
} from './tuning.js';

/** @typedef {import('./decks.js').DeckId} DeckId */
/** @typedef {import('./decks.js').Deck} Deck */
/** @typedef {import('./physics.js').Ball} Ball */
/** @typedef {import('./physics.js').Flipper} Flipper */
/** @typedef {import('./rules.js').Rules} Rules */
/**
 * @typedef {{ left: boolean, right: boolean, pull: boolean, nudge: boolean,
 *   leftPressed: boolean, rightPressed: boolean }} Intent
 * @typedef {{ x: number, y: number, a: number, t: number }} Bug
 * @typedef {{ x: number, y: number, text: string, t: number }} Pop
 * @typedef {Rules & {
 *   random: () => number, reducedMotion: boolean, time: number, deck: DeckId,
 *   slide: { from: DeckId, t: number } | null, balls: Ball[], flippers: Flipper[],
 *   pull: number, autoT: number, drops: boolean[], dropT: number, cool: Record<string, number>,
 *   spinA: number, spinV: number, bugs: Bug[], cues: string[], pops: Pop[],
 *   shake: number, flash: number }} World
 */

/** @param {DeckId} id */
const restFlippers = (id) => DECKS[id].flippers.map((s) => ({ a: restAngle(s.side), w: 0 }));

/**
 * @param {() => number} random
 * @param {{ reducedMotion?: boolean }} [options]
 * @returns {World}
 */
export function createWorld(random, { reducedMotion = false } = {}) {
  /** @type {World} */
  const world = /** @type {World} */ (
    /** @type {unknown} */ ({
      random,
      reducedMotion,
      time: 0,
      deck: 'hull',
      slide: null,
      balls: [],
      flippers: restFlippers('hull'),
      pull: 0,
      autoT: -1,
      drops: [false, false, false],
      dropT: 0,
      cool: {},
      spinA: 0,
      spinV: 0,
      bugs: [],
      cues: [],
      pops: [],
      shake: 0,
      flash: 0,
    })
  );
  startRules(world);
  serveBall(world);
  return world;
}

/** Put a fresh ball on the plunger. `auto` fires it on its own after a beat. @param {World} w @param {boolean} [auto] */
export function serveBall(w, auto = false) {
  const { plunger } = DECKS.hull;
  if (!plunger) return;
  w.balls.push(makeBall(plunger.x, plunger.y));
  w.autoT = auto ? 0.5 : -1;
  w.pull = 0;
}

/** Is a ball resting on the plunger? @param {World} w */
export const ballOnPlunger = (w) =>
  w.deck === 'hull' ? w.balls.find((b) => b.state === 'play' && b.x > 364 && b.y > 560) : undefined;

/** @param {World} w @param {number} pull 0 to 1 */
function fire(w, pull) {
  const ball = ballOnPlunger(w);
  w.pull = 0;
  w.autoT = -1;
  if (!ball || Math.abs(ball.vy) > 60) return;
  ball.vy = -(LAUNCH_MIN + (LAUNCH_MAX - LAUNCH_MIN) * pull);
  hit(w, 'launch', 0, ball);
}

/**
 * Move every ball to another deck, sliding the view there.
 * @param {World} w @param {DeckId} to
 */
export function goToDeck(w, to) {
  const { entry } = DECKS[to];
  w.slide = w.reducedMotion ? null : { from: w.deck, t: 0 };
  w.deck = to;
  w.flippers = restFlippers(to);
  for (const b of w.balls) {
    Object.assign(b, {
      x: entry.x,
      y: entry.y,
      px: entry.x,
      py: entry.y,
      vx: entry.vx,
      vy: entry.vy,
    });
    Object.assign(b, { state: 'play', t: 0, in: 0 });
  }
}

/** Is this drop target still standing? @param {World} w */
const standing = (w) => (/** @type {import('./decks.js').Seg} */ s) => !w.drops[s.id];

/**
 * A hit from the physics, after the per-target cooldown. Drop targets fall here.
 * @param {World} w @param {string} kind @param {number} id @param {Ball} ball
 */
function onHit(w, kind, id, ball) {
  const key = `${kind}${id}`;
  if ((w.cool[key] ?? 0) > w.time) return;
  w.cool[key] = w.time + TARGET_COOLDOWN;
  if (kind === 'drop') {
    w.drops[id] = true;
    if (w.drops.every(Boolean)) w.dropT = DROP_RESET_T;
  }
  hit(w, kind, id, ball);
}

/** Zones the ball just rolled into. @param {World} w @param {Deck} deck @param {Ball} b */
function crossZones(w, deck, b) {
  deck.zones.forEach((z, i) => {
    const bit = 1 << i;
    const inside = b.x > z.x && b.x < z.x + z.w && b.y > z.y && b.y < z.y + z.h;
    const entered = inside && !(b.in & bit);
    b.in = inside ? b.in | bit : b.in & ~bit;
    if (!entered || (z.dir && Math.sign(b.vy) !== z.dir)) return;
    if (z.k === 'spin') w.spinV += Math.abs(b.vy) * SPIN_PER_SPEED;
    else if (z.k === 'ramp') rampShot(w, b);
    else hit(w, z.k, z.id, b);
  });
}

/** The ramp takes the ball up to the bridge, or round and back to the inlane in Twin Mode. @param {World} w @param {Ball} b */
function rampShot(w, b) {
  hit(w, 'ramp', 0, b);
  if (w.twin || w.tilted) {
    Object.assign(b, { state: 'ramp', t: RAMP_T });
    return;
  }
  goToDeck(w, 'bridge');
}

/** @param {World} w @param {Deck} deck @param {Ball} b */
function trySaucer(w, deck, b) {
  const s = deck.saucer;
  if (!s || b.t > 0 || Math.hypot(b.x - s.x, b.y - s.y) > 10) return;
  if (Math.hypot(b.vx, b.vy) > SAUCER_GRAB) return;
  Object.assign(b, { state: 'held', t: SAUCER_HOLD, x: s.x, y: s.y, vx: 0, vy: 0 });
  hit(w, 'lock', 0, b);
}

/** Held and ramp balls count down, then come back into play. @param {World} w @param {Ball} b @param {number} dt */
function waitBall(w, b, dt) {
  b.t -= dt;
  if (b.t > 0) return;
  if (b.state === 'held') {
    const s = DECKS.hull.saucer;
    Object.assign(b, { state: 'play', t: 0.6, vx: s?.kx ?? 0, vy: s?.ky ?? 0 });
    hit(w, 'kick', 0, b);
    return;
  }
  const { entry } = DECKS.hull;
  Object.assign(b, { state: 'play', t: 0, x: entry.x, y: entry.y, px: entry.x, py: entry.y });
  Object.assign(b, { vx: entry.vx, vy: entry.vy });
}

/** Bugs crawl out of the nose hatch as the score climbs, and wander. @param {World} w @param {number} dt */
function moveBugs(w, dt) {
  const { hatch } = DECKS.hull;
  if (!hatch || w.deck !== 'hull') return;
  const want = Math.min(BUG_MAX, Math.floor(w.score / BUG_EVERY));
  if (w.bugs.length + w.squashed < want) {
    w.bugs.push({ x: hatch.x, y: hatch.y, a: w.random() * Math.PI * 2, t: 0 });
  }
  for (const bug of w.bugs) {
    bug.t += dt;
    bug.a += (w.random() - 0.5) * 4 * dt;
    bug.x += Math.cos(bug.a) * BUG_SPEED * dt;
    bug.y += Math.sin(bug.a) * BUG_SPEED * dt;
    if (bug.x < 70 || bug.x > 300 || bug.y < 140 || bug.y > 420) bug.a += Math.PI;
    bug.x = Math.min(300, Math.max(70, bug.x));
    bug.y = Math.min(420, Math.max(140, bug.y));
  }
  w.bugs = w.bugs.filter((bug) => {
    const ball = w.balls.find(
      (b) => b.state === 'play' && Math.hypot(b.x - bug.x, b.y - bug.y) < BALL_R + 8,
    );
    if (ball) hit(w, 'bug', 0, ball);
    return !ball;
  });
}

/** @param {World} w @param {Intent} intent @param {number} dt */
function plunger(w, intent, dt) {
  if (w.autoT >= 0) {
    w.autoT -= dt;
    w.pull = Math.min(AUTO_PULL, w.pull + dt / PULL_T);
    if (w.autoT < 0) fire(w, AUTO_PULL);
    return;
  }
  if (intent.pull && ballOnPlunger(w)) w.pull = Math.min(1, w.pull + dt / PULL_T);
  else if (w.pull > 0) fire(w, w.pull);
}

/** @param {World} w @param {number} dt */
function spin(w, dt) {
  const before = Math.floor(w.spinA * 2);
  w.spinA += w.spinV * dt;
  w.spinV *= Math.exp(-SPIN_DECAY * dt);
  if (w.spinV < 0.05) w.spinV = 0;
  for (let n = Math.floor(w.spinA * 2) - before; n > 0; n--) hit(w, 'spin', 0, null);
}

/** Nudge every ball, as a player shoves the cabinet. @param {World} w */
function nudge(w) {
  for (const b of w.balls) {
    if (b.state !== 'play') continue;
    b.vx += (w.random() - 0.5) * 2 * NUDGE_V;
    b.vy -= NUDGE_V;
  }
  hit(w, 'nudge', 0, null);
}

/**
 * Ball search: a ball that sits still with no flipper holding it gets bumped loose.
 * @param {World} w @param {Ball} b @param {boolean} holding @param {number} dt
 */
function search(w, b, holding, dt) {
  const still = !holding && Math.hypot(b.vx, b.vy) < STILL_SPEED && !ballOnPlunger(w);
  b.still = still ? b.still + dt : 0;
  if (b.still < STILL_T) return;
  b.still = 0;
  b.vx = (w.random() - 0.5) * 300;
  b.vy = -320;
}

/** Balls that fell past the bottom of the deck. @param {World} w */
function drains(w) {
  const gone = w.balls.filter((b) => b.y > DRAIN_Y);
  if (!gone.length) return;
  if (w.deck === 'quarters') return goToDeck(w, 'bridge');
  if (w.deck === 'bridge') return goToDeck(w, 'hull');
  w.balls = w.balls.filter((b) => b.y <= DRAIN_Y);
  for (const b of gone) hit(w, 'drain', 0, b);
}

/** Carry out what the rules asked for: a deck change, a served ball, Twin Mode's balls. @param {World} w @param {number} dt */
function follow(w, dt) {
  if (w.gotoDeck) {
    goToDeck(w, w.gotoDeck);
    w.gotoDeck = null;
  }
  if (w.serveT > 0) {
    w.serveT -= dt;
    if (w.serveT <= 0) serveBall(w, w.serveAuto);
  }
  if (w.addBalls <= 0) return;
  w.addBalls = 0;
  serveBall(w, true);
  const s = DECKS.hull.saucer;
  if (s) w.balls.push({ ...makeBall(s.x, s.y), state: 'held', t: SAUCER_HOLD + 1 });
}

/**
 * One fixed step. The view slide freezes play while it runs.
 * @param {World} w @param {Intent} intent @param {number} dt
 */
export function stepWorld(w, intent, dt) {
  w.cues.length = 0;
  w.time += dt;
  w.shake = Math.max(0, w.shake - dt);
  w.flash = Math.max(0, w.flash - dt);
  for (const p of w.pops) p.t -= dt;
  w.pops = w.pops.filter((p) => p.t > 0);
  if (w.slide) {
    w.slide.t += dt / DECK_SLIDE_T;
    if (w.slide.t >= 1) w.slide = null;
    return;
  }
  tick(w, intent, dt);
  const deck = DECKS[w.deck];
  const live = !w.tilted && w.phase === 'play';
  if (live && intent.nudge) nudge(w);
  if (w.dropT > 0) {
    w.dropT -= dt;
    if (w.dropT <= 0) w.drops.fill(false);
  }
  if (w.deck === 'hull') plunger(w, live ? intent : { ...intent, pull: false }, dt);
  spin(w, dt);
  for (const b of w.balls) {
    b.px = b.x;
    b.py = b.y;
    if (b.state !== 'play') waitBall(w, b, dt);
    else if (b.t > 0) b.t -= dt;
  }
  const h = dt / SUBSTEPS;
  const isUp = standing(w);
  const report = (/** @type {string} */ kind, /** @type {number} */ id, /** @type {Ball} */ b) =>
    onHit(w, kind, id, b);
  for (let i = 0; i < SUBSTEPS && !w.slide; i++) {
    deck.flippers.forEach((spot, n) => {
      const held = live && (spot.side === 1 ? intent.left : intent.right);
      swing(w.flippers[n], spot.side, held, h);
    });
    for (const b of w.balls) {
      if (b.state !== 'play') continue;
      moveBall(b, deck, w.flippers, isUp, h, report);
      if (w.slide) break;
      crossZones(w, deck, b);
      if (w.slide) break;
      trySaucer(w, deck, b);
    }
  }
  for (const b of w.balls) if (b.state === 'play') search(w, b, intent.left || intent.right, dt);
  moveBugs(w, dt);
  drains(w);
  follow(w, dt);
}
