// @ts-check
// Renders a world onto the host canvas. Fits the 400 by 600 table under the HUD, draws each
// deck's fixed art from a cached layer and its live pieces on top, slides between decks, and
// puts a backbox with a dot-matrix display and the twin health board beside the table.
// Reads the world, never changes it.

import { drawSprite } from '../../shell/sprite.js';
import { chromeBall, disc, glowText, linear, STEEL } from './art.js';
import { drawLive } from './draw-deck.js';
import { drawStatic } from './draw-static.js';
import { activeSystem } from './score.js';
import {
  BALL_R,
  BOARD_W,
  CEILING,
  CEILING_NARROW,
  NARROW_WIDTH,
  PAD,
  POP_T,
  SHAKE_PX,
  SYSTEMS,
  TABLE_H,
  TABLE_W,
} from './tuning.js';

/** @typedef {import('../../contracts').HostContext} HostContext */
/** @typedef {import('../../contracts').Palette} Palette */
/** @typedef {import('../../contracts').Size} Size */
/** @typedef {import('./decks.js').DeckId} DeckId */
/** @typedef {import('./table.js').World} World */
/** @typedef {{ scale: number, x: number, y: number, board: boolean }} Fit */

const FONT = "'B404 Mono', monospace";
/** How far the ship's hull art reaches past the table's edges, in table units. */
const OVER = 48;
/** Decks stack bottom to top, so a move up slides the view up. */
const LEVEL = { hull: 0, bridge: 1, quarters: 2 };
/** Cached fixed art per deck, theme, and scale. */
/** @type {Map<string, HTMLCanvasElement>} */
const layers = new Map();

/**
 * Where the table goes on the canvas. A wide canvas also has room for the backbox.
 * @param {Size} size
 * @returns {Fit}
 */
export function fitTable(size) {
  const top = size.width < NARROW_WIDTH ? CEILING_NARROW : CEILING;
  const height = Math.max(1, size.height - top - PAD);
  const scale = Math.max(0.1, Math.min(height / TABLE_H, (size.width - PAD * 2) / TABLE_W));
  const x = (size.width - TABLE_W * scale) / 2;
  const board = x >= BOARD_W + PAD * 2 + OVER * scale;
  return { scale, x, y: top + (height - TABLE_H * scale) / 2, board };
}

/** @param {number} n */
const commas = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Deterministic value in [0,1) for an index. @param {number} n */
function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * A deck's fixed art drawn once into its own canvas. Null where there is no DOM (tests), and
 * the caller then draws the art straight onto the frame.
 * @param {HostContext} host @param {DeckId} id @param {number} scale
 */
function layerFor(host, id, scale) {
  const doc = globalThis.document;
  if (!doc?.createElement) return null;
  const k = scale * (host.size.dpr || 1);
  const key = `${id}|${host.theme.id}|${k}`;
  const cached = layers.get(key);
  if (cached) return cached;
  if (layers.size > 5) layers.clear();
  const layer = doc.createElement('canvas');
  layer.width = Math.ceil((TABLE_W + OVER * 2) * k);
  layer.height = Math.ceil((TABLE_H + OVER * 2) * k);
  const c = layer.getContext('2d');
  if (!c) return null;
  c.setTransform(k, 0, 0, k, OVER * k, OVER * k);
  drawStatic(c, host.theme, id, (s, x, y, h, o) =>
    drawSprite(c, host.theme.palette, s, x, y, h, o),
  );
  layers.set(key, layer);
  return layer;
}

/** Stars across the whole canvas, twinkling. @param {CanvasRenderingContext2D} ctx @param {Size} size @param {Palette} p @param {number} time */
function stars(ctx, size, p, time) {
  ctx.fillStyle = p.ink;
  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = 0.12 + 0.4 * hash(i * 7.1) * (0.6 + 0.4 * Math.sin(time * 1.3 + i));
    const r = hash(i * 3.3) > 0.9 ? 2 : 1.2;
    ctx.fillRect(hash(i) * size.width, hash(i + 99) * size.height, r, r);
  }
  ctx.globalAlpha = 1;
}

/** @param {CanvasRenderingContext2D} ctx @param {World} w @param {Palette} p @param {number} alpha */
function balls(ctx, w, p, alpha) {
  for (const b of w.balls) {
    if (b.state === 'ramp') continue;
    const x = b.px + (b.x - b.px) * alpha;
    const y = b.py + (b.y - b.py) * alpha;
    const dx = b.x - b.px;
    const dy = b.y - b.py;
    if (dx * dx + dy * dy > 64) {
      ctx.strokeStyle = linear(ctx, x - dx * 2, y - dy * 2, x, y, [
        [0, 'rgba(255,255,255,0)'],
        [1, p.glow],
      ]);
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = BALL_R * 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - dx * 2, y - dy * 2);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    chromeBall(ctx, x, y, BALL_R);
  }
}

/** Bugs are the theme's hazard sprites, so they change with the holidays. @param {HostContext} host @param {World} w */
function bugs(host, w) {
  const { hazards } = host.theme.sprites;
  w.bugs.forEach((bug, i) => {
    host.drawSprite(hazards[i % hazards.length], bug.x, bug.y, 16, { rotate: bug.a + Math.PI / 2 });
  });
}

/** Points that float up from big hits, and the big words: TILT, TWIN MODE. @param {CanvasRenderingContext2D} ctx @param {World} w @param {Palette} p */
function words(ctx, w, p) {
  ctx.textAlign = 'center';
  ctx.font = `bold 14px ${FONT}`;
  for (const pop of w.pops) {
    ctx.globalAlpha = Math.min(1, pop.t / (POP_T / 2));
    glowText(ctx, commas(Number(pop.text)), pop.x, pop.y - (POP_T - pop.t) * 40, p.glow, 10);
  }
  ctx.globalAlpha = 1;
  const text = w.tilted ? 'TILT' : w.twin ? 'TWIN MODE' : '';
  if (!text) return;
  ctx.font = `bold 34px ${FONT}`;
  ctx.globalAlpha = 0.45 + 0.3 * Math.sin(w.time * 6);
  glowText(ctx, text, TABLE_W / 2, TABLE_H * 0.62, w.tilted ? p.accent : p.glow, 22);
  ctx.globalAlpha = 1;
}

/**
 * The dot-matrix display: score and the latest call-out, with a dot grid laid over them.
 * @param {CanvasRenderingContext2D} ctx @param {World} w @param {Palette} p
 * @param {number} x @param {number} y @param {number} width @param {number} height
 */
function dmd(ctx, w, p, x, y, width, height) {
  ctx.fillStyle = '#050302';
  ctx.fillRect(x, y, width, height);
  ctx.textAlign = 'center';
  ctx.font = `bold 20px ${FONT}`;
  glowText(ctx, commas(w.score), x + width / 2, y + height * 0.48, p.glow, 8);
  ctx.font = `10px ${FONT}`;
  ctx.fillStyle = p.glow;
  ctx.fillText((w.say || `BALL ${w.ballNo}`).slice(0, 22), x + width / 2, y + height * 0.82);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (let i = x; i < x + width; i += 3) ctx.fillRect(i, y, 1, height);
  for (let j = y; j < y + height; j += 3) ctx.fillRect(x, j, width, 1);
  ctx.strokeStyle = STEEL;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);
}

/** One status light on the health board. @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {string} color @param {boolean} lit */
function led(ctx, x, y, color, lit) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = lit ? 1 : 0.35;
  if (lit) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
  }
  disc(ctx, x, y, 4);
  ctx.fill();
  ctx.restore();
}

/**
 * The backbox beside the table, or on a narrow screen a row of lights in the table's corner.
 * @param {CanvasRenderingContext2D} ctx @param {World} w @param {Palette} p @param {Fit} fit
 */
function backbox(ctx, w, p, fit) {
  const blink = Math.sin(w.time * 8) > 0;
  const now = w.order[w.active];
  const color = (/** @type {number} */ i) =>
    w.online[i] ? p.pickup : i === now ? p.accent : p.hazard;
  ctx.textAlign = 'left';
  if (!fit.board) {
    ctx.save();
    ctx.translate(fit.x, fit.y);
    ctx.scale(fit.scale, fit.scale);
    ctx.font = `bold 9px ${FONT}`;
    glowText(ctx, activeSystem(w).name.toUpperCase(), 4, 12, p.accent, 6);
    w.online.forEach((on, i) => {
      led(ctx, 8 + i * 9, 22, color(i), on || (i === now && blink));
    });
    ctx.restore();
    return;
  }
  const x = Math.max(PAD, fit.x - OVER * fit.scale - BOARD_W - PAD);
  const y = fit.y;
  ctx.fillStyle = linear(ctx, x, y, x + BOARD_W, y, [
    [0, '#14181f'],
    [1, '#232a35'],
  ]);
  ctx.fillRect(x, y, BOARD_W, 410);
  ctx.strokeStyle = STEEL;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, BOARD_W, 410);
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
  glowText(ctx, 'USS NEVER SLEEPS', x + BOARD_W / 2, y + 20, p.accent, 8);
  dmd(ctx, w, p, x + 8, y + 30, BOARD_W - 16, 62);
  ctx.textAlign = 'left';
  ctx.font = `10px ${FONT}`;
  ctx.fillStyle = p.muted;
  ctx.fillText('DIGITAL TWIN HEALTH', x + 10, y + 114);
  SYSTEMS.forEach((system, i) => {
    const ly = y + 134 + i * 19;
    const on = w.online[i];
    led(ctx, x + 15, ly - 3, color(i), on || (i === now && blink));
    ctx.fillStyle = on ? p.ink : i === now ? p.accent : p.muted;
    ctx.fillText(system.name.toUpperCase(), x + 26, ly);
  });
  ctx.fillStyle = p.ink;
  ctx.fillText(`BALL ${Math.min(w.ballNo, 9)}   BONUS ${w.mult}X`, x + 10, y + 380);
  ctx.fillText(`REPAIRS ${w.repaired}   LOCKS ${w.locks}`, x + 10, y + 398);
}

/**
 * Draw one deck at a vertical offset, in table units.
 * @param {HostContext} host @param {World} w @param {Fit} fit @param {DeckId} id @param {number} dy
 * @param {number} alpha
 */
function deckAt(host, w, fit, id, dy, alpha) {
  const { ctx } = host;
  const p = host.theme.palette;
  const sx = w.shake > 0 && !w.reducedMotion ? Math.sin(w.time * 97) * SHAKE_PX : 0;
  ctx.save();
  ctx.translate(fit.x + sx, fit.y + dy * fit.scale);
  ctx.scale(fit.scale, fit.scale);
  // The HUD strip covers the canvas above the table, so nothing draws above its top edge.
  ctx.beginPath();
  ctx.rect(-OVER, -PAD, TABLE_W + OVER * 2, TABLE_H + OVER);
  ctx.clip();
  const layer = layerFor(host, id, fit.scale);
  if (layer) ctx.drawImage(layer, -OVER, -OVER, TABLE_W + OVER * 2, TABLE_H + OVER * 2);
  else drawStatic(ctx, host.theme, id, host.drawSprite);
  drawLive(host, w, id);
  if (id === w.deck) {
    if (id === 'hull') bugs(host, w);
    balls(ctx, w, p, alpha);
    words(ctx, w, p);
  }
  ctx.restore();
}

/**
 * @param {HostContext} host
 * @param {World} w
 * @param {number} alpha
 */
export function drawFrame(host, w, alpha) {
  const { ctx, size } = host;
  const p = host.theme.palette;
  const fit = fitTable(size);
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, size.width, size.height);
  stars(ctx, size, p, w.time);
  if (w.slide) {
    const up = LEVEL[w.deck] > LEVEL[w.slide.from] ? 1 : -1;
    const t = 1 - (1 - w.slide.t) ** 3;
    deckAt(host, w, fit, w.slide.from, up * t * TABLE_H, alpha);
    deckAt(host, w, fit, w.deck, -up * (1 - t) * TABLE_H, alpha);
  } else deckAt(host, w, fit, w.deck, 0, alpha);
  if (w.flash > 0 && !w.reducedMotion) {
    ctx.fillStyle = p.accentSoft;
    ctx.fillRect(0, 0, size.width, size.height);
  }
  backbox(ctx, w, p, fit);
}
