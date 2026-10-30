// @ts-check
// A deck's live pieces, drawn every frame over its cached fixed art: light inserts, targets,
// bumpers, slingshot rubbers, the spinner, the plunger, and the flippers. Reads the world only.

import {
  bolt,
  bumperCap,
  disc,
  glowText,
  insert,
  linear,
  SHADOW,
  SHADOW_X,
  SHADOW_Y,
  SHINE,
  STEEL,
  STEEL_DARK,
} from './art.js';
import { DECKS } from './decks.js';
import { path } from './draw-static.js';
import { tipOf } from './physics.js';
import { activeSystem, eggLit } from './score.js';
import { BALL_R, FLIP_BASE_R, FLIP_TIP_R } from './tuning.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./decks.js').Deck} Deck */
/** @typedef {import('./decks.js').DeckId} DeckId */
/** @typedef {import('./decks.js').Seg} Seg */
/** @typedef {import('./table.js').World} World */

const FONT = "'B404 Mono', monospace";
const LETTERS = 'BENJO';
const SHIP = 'SHIP';

/** Arrow inserts in front of each shot, by the mission kind they light for. @type {Record<DeckId, Record<string, number[][]>>} */
const SHOTS = {
  hull: {
    loop: [
      [28, 330],
      [346, 330],
    ],
    loopL: [[28, 352]],
    drop: [[187, 396]],
    bumper: [[187, 334]],
    spin: [[28, 242]],
    lock: [[96, 268]],
    ramp: [[288, 270]],
    sling: [
      [97, 470],
      [277, 470],
    ],
    stand: [
      [60, 300],
      [314, 300],
    ],
    inlane: [
      [62, 455],
      [312, 455],
    ],
  },
  bridge: { chair: [[200, 196]], spin: [[43, 300]], loop: [[358, 300]] },
  quarters: {},
};

/** Is a piece lit from a recent hit? @param {World} w @param {string} key */
const glowing = (w, key) => (w.cool[key] ?? 0) > w.time;

/** @param {World} w @param {number} [speed] */
const blink = (w, speed = 12) => Math.sin(w.time * speed) > 0;

/** An arrow insert pointing up the table. @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y */
const arrowAt = (ctx, x, y) => () =>
  path(ctx, [
    [x, y - 10],
    [x + 8, y + 5],
    [x, y + 1],
    [x - 8, y + 5],
    [x, y - 10],
  ]);

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} r */
const roundAt = (ctx, x, y, r) => () => disc(ctx, x, y, r);

/** Mission arrows: dim at every shot, lit where the offline system's shot is. @param {CanvasRenderingContext2D} ctx @param {World} w @param {Palette} p @param {DeckId} id */
function arrows(ctx, w, p, id) {
  const kind = activeSystem(w).kind;
  for (const [k, spots] of Object.entries(SHOTS[id])) {
    for (const [x, y] of spots) insert(ctx, arrowAt(ctx, x, y), p.accent, k === kind && blink(w));
  }
  if (id === 'hull' && w.twin) insert(ctx, arrowAt(ctx, 288, 236), p.glow, blink(w, 20));
}

/** S-H-I-P lane lights with their letters, the skill shot, and the save lights. @param {CanvasRenderingContext2D} ctx @param {World} w @param {Palette} p */
function hullLights(ctx, w, p) {
  ctx.font = `bold 9px ${FONT}`;
  ctx.textAlign = 'center';
  w.lanes.forEach((on, i) => {
    const x = 131 + i * 38;
    const skill = w.skillT > 0 && i === w.skillLane && blink(w, 18);
    insert(ctx, roundAt(ctx, x, 128, 8), skill ? p.accent : p.pickup, on || skill);
    ctx.fillStyle = on ? '#1a1206' : p.ink;
    ctx.fillText(SHIP[i], x, 131);
  });
  insert(ctx, roundAt(ctx, 187, 586, 6), p.pickup, w.saveT > 0 && (w.saveT > 3 || blink(w)));
  ctx.fillStyle = p.ink;
  ctx.font = `6px ${FONT}`;
  ctx.fillText('SAVE', 187, 576);
  for (const x of [28, 346]) insert(ctx, roundAt(ctx, x, 520, 5), p.glow, w.outSave > 0);
  const s = DECKS.hull.saucer;
  if (!s) return;
  for (const i of [0, 1]) {
    insert(ctx, roundAt(ctx, s.x - 7 + i * 14, s.y + 22, 4), p.glow, w.locks > i || w.twin);
  }
}

/**
 * A target block along its segment: a raised face with a shadow, glowing when lit.
 * @param {CanvasRenderingContext2D} ctx @param {Seg} s @param {string} color @param {boolean} lit
 */
function target(ctx, s, color, lit) {
  const trace = () =>
    path(ctx, [
      [s.ax, s.ay],
      [s.bx, s.by],
    ]);
  ctx.lineCap = 'butt';
  ctx.save();
  ctx.translate(SHADOW_X, SHADOW_Y);
  ctx.strokeStyle = SHADOW;
  ctx.lineWidth = 8;
  trace();
  ctx.stroke();
  ctx.restore();
  ctx.save();
  if (lit) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  trace();
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  trace();
  ctx.stroke();
}

/** A B-E-N-J-O target and its lettered insert. @param {CanvasRenderingContext2D} ctx @param {World} w @param {Palette} p @param {Seg} s */
function letter(ctx, w, p, s) {
  const on = w.letters[s.id];
  target(ctx, s, on ? p.glow : p.pickup, on);
  const mx = (s.ax + s.bx) / 2;
  const x = mx + (200 - mx) * 0.18;
  const y = (s.ay + s.by) / 2 + 24;
  insert(ctx, roundAt(ctx, x, y, 9), p.glow, on);
  ctx.fillStyle = on ? '#1a1206' : p.ink;
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(LETTERS[s.id], x, y + 4);
}

/** A slingshot's rubber band, which flares when it kicks. @param {CanvasRenderingContext2D} ctx @param {Palette} p @param {Seg} s @param {boolean} lit */
function rubber(ctx, p, s, lit) {
  ctx.save();
  if (lit) {
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 18;
  }
  ctx.strokeStyle = lit ? p.glow : SHINE;
  ctx.lineWidth = lit ? 5 : 4;
  ctx.lineCap = 'round';
  path(ctx, [
    [s.ax, s.ay],
    [s.bx, s.by],
  ]);
  ctx.stroke();
  ctx.restore();
}

/** Targets and slingshot rubbers. @param {CanvasRenderingContext2D} ctx @param {World} w @param {Palette} p @param {Deck} deck */
function targets(ctx, w, p, deck) {
  for (const s of deck.segs) {
    const lit = glowing(w, `${s.k}${s.id}`);
    if (s.k === 'drop' && w.drops[s.id]) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      path(ctx, [
        [s.ax, s.ay],
        [s.bx, s.by],
      ]);
      ctx.stroke();
    } else if (s.k === 'drop' || s.k === 'stand') target(ctx, s, p.pickup, lit);
    else if (s.k === 'egg') {
      target(ctx, s, eggLit(w) && blink(w, 8) ? p.glow : p.muted, eggLit(w));
    } else if (s.k === 'letter') letter(ctx, w, p, s);
    else if (s.k === 'sling') rubber(ctx, p, s, lit);
  }
}

/** Bumper caps, with the theme's pickup art inside, so a holiday restyles them. @param {HostContext} host @param {World} w @param {Deck} deck */
function bumpers(host, w, deck) {
  const p = host.theme.palette;
  const { pickups } = host.theme.sprites;
  for (const r of deck.rounds) {
    if (r.k === 'post') continue;
    bumperCap(host.ctx, r.x, r.y, r.r, p.hazard, p.glow, glowing(w, `${r.k}${r.id}`));
    host.drawSprite(pickups[r.id % pickups.length], r.x, r.y - 1, r.r * 0.95, { alpha: 0.9 });
  }
}

/** Spinners flip with the ball's speed. @param {CanvasRenderingContext2D} ctx @param {World} w @param {Deck} deck */
function spinners(ctx, w, deck) {
  for (const z of deck.zones) {
    if (z.k !== 'spin') continue;
    const y = z.y + z.h / 2;
    const half = Math.abs(Math.cos(w.spinA * Math.PI)) * 4 + 0.6;
    ctx.fillStyle = linear(ctx, 0, y - half, 0, y + half, [
      [0, SHINE],
      [1, STEEL_DARK],
    ]);
    ctx.fillRect(z.x + 2, y - half, z.w - 4, half * 2);
    bolt(ctx, z.x, y, 2.5);
    bolt(ctx, z.x + z.w, y, 2.5);
  }
}

/** The plunger rod, drawn back as it is pulled. @param {CanvasRenderingContext2D} ctx @param {World} w @param {Deck} deck */
function plunger(ctx, w, deck) {
  if (!deck.plunger) return;
  const { x, y } = deck.plunger;
  const top = y + BALL_R + w.pull * 26;
  ctx.fillStyle = linear(ctx, x - 9, 0, x + 9, 0, [
    [0, STEEL_DARK],
    [0.45, SHINE],
    [1, STEEL_DARK],
  ]);
  ctx.fillRect(x - 9, top, 18, 5);
  ctx.fillRect(x - 3, top + 5, 6, 40);
  ctx.strokeStyle = STEEL;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    ctx.lineTo(x + (i % 2 ? 7 : -7), top + 6 + i * ((34 - w.pull * 20) / 6));
  }
  ctx.stroke();
}

/** White flippers with red rubber, a shadow, and a chrome pivot. @param {CanvasRenderingContext2D} ctx @param {World} w @param {Palette} p @param {Deck} deck */
function flippers(ctx, w, p, deck) {
  deck.flippers.forEach((spot, i) => {
    const [tx, ty] = tipOf(spot, w.flippers[i]);
    const a = Math.atan2(ty - spot.y, tx - spot.x);
    const trace = () => {
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, FLIP_BASE_R, a + Math.PI / 2, a - Math.PI / 2);
      ctx.arc(tx, ty, FLIP_TIP_R, a - Math.PI / 2, a + Math.PI / 2);
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(SHADOW_X * 1.4, SHADOW_Y * 1.4);
    ctx.fillStyle = SHADOW;
    trace();
    ctx.fill();
    ctx.restore();
    const nx = -Math.sin(a) * FLIP_BASE_R;
    const ny = Math.cos(a) * FLIP_BASE_R;
    ctx.fillStyle = linear(ctx, spot.x - nx, spot.y - ny, spot.x + nx, spot.y + ny, [
      [0, '#ffffff'],
      [0.6, '#dfe3e8'],
      [1, '#a9b0b8'],
    ]);
    trace();
    ctx.fill();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    bolt(ctx, spot.x, spot.y, 3.5);
  });
}

/** The Quarters clock. @param {CanvasRenderingContext2D} ctx @param {World} w @param {Palette} p */
function clock(ctx, w, p) {
  ctx.font = `bold 30px ${FONT}`;
  ctx.textAlign = 'center';
  const left = Math.max(0, Math.ceil(w.quartersT));
  glowText(ctx, String(left), 200, 400, left <= 5 && blink(w, 10) ? p.accent : p.glow, 14);
}

/**
 * One deck's live pieces, in table units, over its fixed art.
 * @param {HostContext} host @param {World} w @param {DeckId} id
 */
export function drawLive(host, w, id) {
  const { ctx } = host;
  const p = host.theme.palette;
  const deck = DECKS[id];
  arrows(ctx, w, p, id);
  if (id === 'hull') hullLights(ctx, w, p);
  if (id === 'quarters') clock(ctx, w, p);
  spinners(ctx, w, deck);
  targets(ctx, w, p, deck);
  bumpers(host, w, deck);
  plunger(ctx, w, deck);
  flippers(ctx, w, p, deck);
}
