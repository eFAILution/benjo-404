// @ts-check
// A deck's fixed art, drawn once per size and theme into a cached layer (draw.js). The hull deck
// sits inside the white USS Never Sleeps: its stern sweeps down to a rounded nose, with an engine
// fin down each side. Inside is a dark plated deck with chrome rails, a clear ramp, and the hangar.

import {
  bolt,
  disc,
  HULL_DARK,
  HULL_LIGHT,
  linear,
  radial,
  rail,
  STEEL,
  STEEL_DARK,
} from './art.js';
import { DECKS } from './decks.js';
import { TABLE_H, TABLE_W } from './tuning.js';

/** @typedef {import('../../contracts').ThemePack} ThemePack */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('./decks.js').Deck} Deck */
/** @typedef {import('./decks.js').DeckId} DeckId */
/** @typedef {import('../../contracts').HostContext['drawSprite']} DrawSprite */

const FONT = "'B404 Mono', monospace";
/** Deck floors: the hull's plated deck, the bridge's blue glass, the quarters' warm cabin. */
const FLOOR = {
  hull: ['#26324c', '#131a2b', '#070a12'],
  bridge: ['#1f4466', '#0e2238', '#060c16'],
  quarters: ['#40284a', '#1c1022', '#0a060c'],
};

/** @param {CanvasRenderingContext2D} ctx @param {number[][]} points */
export function path(ctx, points) {
  ctx.beginPath();
  for (const [x, y] of points) ctx.lineTo(x, y);
}

/** The ship's white body around the hull deck, with its fins and seams. @param {CanvasRenderingContext2D} ctx @param {Palette} p */
function shipBody(ctx, p) {
  ctx.beginPath();
  ctx.moveTo(202, -16);
  ctx.quadraticCurveTo(-46, -16, -42, 170);
  ctx.lineTo(-34, 400);
  ctx.quadraticCurveTo(-14, 570, 202, 664);
  ctx.quadraticCurveTo(418, 570, 438, 400);
  ctx.lineTo(446, 170);
  ctx.quadraticCurveTo(450, -16, 202, -16);
  ctx.fillStyle = linear(ctx, -46, 0, 450, 0, [
    [0, HULL_DARK],
    [0.18, HULL_LIGHT],
    [0.5, '#ffffff'],
    [0.82, HULL_LIGHT],
    [1, HULL_DARK],
  ]);
  ctx.fill();
  ctx.strokeStyle = STEEL_DARK;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40,48,60,0.22)';
  ctx.lineWidth = 1;
  for (const y of [90, 260, 430, 560]) {
    ctx.beginPath();
    ctx.moveTo(-40, y);
    ctx.lineTo(444, y);
    ctx.stroke();
  }
  for (const side of [1, -1]) {
    const x = (/** @type {number} */ v) => (side === 1 ? v : 404 - v);
    path(ctx, [
      [x(-2), 60],
      [x(-38), 116],
      [x(-40), 352],
      [x(-10), 304],
    ]);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, x(-40), 0, x(-2), 0, [
      [0, HULL_DARK],
      [1, '#ffffff'],
    ]);
    ctx.fill();
    ctx.strokeStyle = STEEL_DARK;
    ctx.stroke();
    // Engine glow at the back of each fin.
    ctx.save();
    ctx.fillStyle = p.glow;
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 18;
    disc(ctx, x(-20), 92, 6);
    ctx.fill();
    ctx.restore();
  }
}

/** Deck floor with plating and rivets, clipped to the deck. @param {CanvasRenderingContext2D} ctx @param {DeckId} id @param {Deck} deck */
function floor(ctx, id, deck) {
  const [hi, mid, lo] = FLOOR[id];
  ctx.save();
  path(ctx, id === 'hull' ? deck.outline : [...deck.outline, [270, 600], [130, 600]]);
  ctx.closePath();
  ctx.fillStyle = radial(ctx, 200, 300, 430, [
    [0, hi],
    [0.55, mid],
    [1, lo],
  ]);
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let v = 0; v <= TABLE_H; v += 40) {
    ctx.beginPath();
    ctx.moveTo(0, v);
    ctx.lineTo(TABLE_W, v);
    if (v <= TABLE_W) {
      ctx.moveTo(v, 0);
      ctx.lineTo(v, TABLE_H);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let x = 40; x < TABLE_W; x += 80)
    for (let y = 40; y < TABLE_H; y += 80) ctx.fillRect(x - 1, y - 1, 2, 2);
  ctx.restore();
}

/** The grated nose hatch the bugs crawl out of. @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number }} h */
function hatch(ctx, h) {
  ctx.fillStyle = radial(ctx, h.x, h.y, 74, [
    [0, 'rgba(0,0,0,0.6)'],
    [1, 'rgba(0,0,0,0.15)'],
  ]);
  disc(ctx, h.x, h.y, 74);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,200,215,0.28)';
  ctx.lineWidth = 2;
  for (const r of [24, 50, 74]) {
    disc(ctx, h.x, h.y, r);
    ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.moveTo(h.x + Math.cos(a) * 24, h.y + Math.sin(a) * 24);
    ctx.lineTo(h.x + Math.cos(a) * 74, h.y + Math.sin(a) * 74);
  }
  ctx.stroke();
}

/** The clear ramp up to the bridge, with chrome rails. @param {CanvasRenderingContext2D} ctx @param {Palette} p */
function ramp(ctx, p) {
  path(ctx, [
    [268, 252],
    [308, 252],
    [300, 126],
    [276, 126],
  ]);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, 252, 0, 126, [
    [0, 'rgba(255,255,255,0.18)'],
    [1, 'rgba(255,255,255,0.04)'],
  ]);
  ctx.fill();
  rail(
    ctx,
    () =>
      path(ctx, [
        [270, 252],
        [277, 126],
      ]),
    4,
  );
  rail(
    ctx,
    () =>
      path(ctx, [
        [306, 252],
        [299, 126],
      ]),
    4,
  );
  ctx.fillStyle = p.ink;
  ctx.globalAlpha = 0.7;
  ctx.font = `bold 8px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('BRIDGE', 288, 120);
  ctx.globalAlpha = 1;
}

/** The hangar saucer. @param {CanvasRenderingContext2D} ctx @param {Palette} p @param {{ x: number, y: number }} s */
function saucer(ctx, p, s) {
  ctx.fillStyle = radial(ctx, s.x + 3, s.y + 3, 14, [
    [0, '#000000'],
    [0.7, '#0b0d12'],
    [1, STEEL],
  ]);
  disc(ctx, s.x, s.y, 14);
  ctx.fill();
  ctx.strokeStyle = STEEL;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = p.muted;
  ctx.font = `bold 7px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('HANGAR', s.x, s.y - 20);
}

/** Slingshot plastics under the rubber. @param {CanvasRenderingContext2D} ctx @param {Palette} p */
function slingPlastics(ctx, p) {
  for (const pts of [
    [
      [80, 405],
      [114, 494],
      [80, 465],
    ],
    [
      [294, 405],
      [260, 494],
      [294, 465],
    ],
  ]) {
    path(ctx, pts);
    ctx.closePath();
    ctx.fillStyle = p.accent;
    ctx.globalAlpha = 0.45;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/**
 * Words and Benjo printed on the playfield.
 * @param {CanvasRenderingContext2D} ctx @param {ThemePack} theme @param {DeckId} id @param {DrawSprite} sprite
 */
function decals(ctx, theme, id, sprite) {
  const p = theme.palette;
  ctx.textAlign = 'center';
  ctx.fillStyle = p.ink;
  ctx.globalAlpha = 0.3;
  ctx.font = `bold 11px ${FONT}`;
  const text = {
    hull: 'USS  NEVER  SLEEPS',
    bridge: 'B R I D G E',
    quarters: "B E N J O ' S   Q U A R T E R S",
  }[id];
  ctx.fillText(text, id === 'hull' ? 187 : 200, id === 'hull' ? 166 : 470);
  ctx.globalAlpha = 1;
  const [bx, by, bh, ba] =
    id === 'hull' ? [187, 470, 78, 0.14] : [200, id === 'bridge' ? 70 : 210, 44, 1];
  sprite(theme.sprites.benjo, bx, by, bh, { alpha: ba });
}

/** The plunger lane's shooter housing. @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number }} pl */
function shooter(ctx, pl) {
  ctx.fillStyle = linear(ctx, pl.x - 14, 0, pl.x + 14, 0, [
    [0, STEEL_DARK],
    [0.5, STEEL],
    [1, STEEL_DARK],
  ]);
  ctx.fillRect(pl.x - 14, pl.y + 34, 28, 10);
}

/**
 * Draw a deck's fixed art in table units.
 * @param {CanvasRenderingContext2D} ctx @param {ThemePack} theme @param {DeckId} id
 * @param {DrawSprite} sprite draws a theme sprite onto `ctx`
 */
export function drawStatic(ctx, theme, id, sprite) {
  const p = theme.palette;
  const deck = DECKS[id];
  if (id === 'hull') shipBody(ctx, p);
  else {
    // The deck's steel rim, wider than its walls.
    rail(ctx, () => path(ctx, deck.outline), 12);
  }
  floor(ctx, id, deck);
  if (deck.hatch) hatch(ctx, deck.hatch);
  decals(ctx, theme, id, sprite);
  if (id === 'hull') {
    slingPlastics(ctx, p);
    ramp(ctx, p);
  }
  if (deck.saucer) saucer(ctx, p, deck.saucer);
  if (deck.plunger) shooter(ctx, deck.plunger);
  rail(ctx, () => {
    ctx.beginPath();
    for (const s of deck.segs) {
      if (s.k !== 'wall') continue;
      ctx.moveTo(s.ax, s.ay);
      ctx.lineTo(s.bx, s.by);
    }
  });
  for (const r of deck.rounds) if (r.k === 'post') bolt(ctx, r.x, r.y, r.r + 1.5);
}
