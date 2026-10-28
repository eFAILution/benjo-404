// @ts-check
// Layout and the bug formation: the play rect for a canvas size, where each bug sits, how the
// block slides and drops, who bites, and how a running world fits a new size.
// Pure helpers over the World from world.js; nothing here reads the host.

import {
  BENJO_H,
  BENJO_RISE,
  BITE_SPEED,
  BITE_SPEED_CAP,
  BITE_SPEED_WAVE,
  BITE_T,
  BITE_T_MIN,
  BITE_T_STEP,
  BOTTOM_PAD,
  BUG_H,
  CEILING,
  CEILING_NARROW,
  COL_STEP,
  COLS,
  DROP,
  FORM_INSET,
  FORM_SPEED,
  FORM_SPEED_CAP,
  FORM_SPEED_CAP_REDUCED,
  FORM_SPEED_RAMP,
  FORM_SPEED_WAVE,
  FORM_TOP,
  HIT_R,
  MIN_HEIGHT,
  MIN_WIDTH,
  NARROW_WIDTH,
  REF_HEIGHT,
  ROW_STEP,
  ROWS,
  SIDE_PAD,
  UNIT_MAX,
  UNIT_MIN,
} from './tuning.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {import('./world.js').Bug} Bug */
/** @typedef {import('./world.js').Area} Area */

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @param {Area} size */
export function layout(size) {
  const width = Math.max(MIN_WIDTH, size.width || 0);
  const height = Math.max(MIN_HEIGHT, size.height || 0);
  const unit = clamp(height / REF_HEIGHT, UNIT_MIN, UNIT_MAX);
  const right = width - SIDE_PAD;
  const bottom = height - BOTTOM_PAD;
  return {
    width,
    height,
    unit,
    ceiling: size.width < NARROW_WIDTH ? CEILING_NARROW : CEILING,
    left: SIDE_PAD,
    right,
    bottom,
    benjoH: BENJO_H * unit,
    benjoY: bottom - BENJO_RISE * unit,
    hitR: BENJO_H * unit * HIT_R,
    bugH: BUG_H * unit,
    colStep: Math.min(COL_STEP * unit, (right - SIDE_PAD - 2 * FORM_INSET) / COLS),
    rowStep: ROW_STEP * unit,
  };
}

/** Living columns and lowest row, refilled by extent(); one scratch object, no allocation. */
const span = { minCol: 0, maxCol: 0, maxRow: 0 };

/** @param {World} w */
function extent(w) {
  span.minCol = COLS;
  span.maxCol = -1;
  span.maxRow = -1;
  for (const b of w.bugs) {
    if (!b.alive) continue;
    span.minCol = Math.min(span.minCol, b.col);
    span.maxCol = Math.max(span.maxCol, b.col);
    span.maxRow = Math.max(span.maxRow, b.row);
  }
  return span;
}

/** @param {World} w @param {Bug} b */
export const bugX = (w, b) => w.originX + b.col * w.colStep;
/** @param {World} w @param {Bug} b */
export const bugY = (w, b) => w.originY + b.row * w.rowStep;

/** Formation speed: faster each wave and as bugs die, up to the cap. @param {World} w */
export function speedFor(w) {
  const cap = w.reducedMotion ? FORM_SPEED_CAP_REDUCED : FORM_SPEED_CAP;
  const base = FORM_SPEED + FORM_SPEED_WAVE * (w.wave - 1);
  return Math.min(cap, base * (1 + FORM_SPEED_RAMP * (1 - w.alive / w.bugs.length))) * w.unit;
}

/** @param {World} w */
export const biteSpeedFor = (w) =>
  Math.min(BITE_SPEED_CAP, BITE_SPEED + BITE_SPEED_WAVE * (w.wave - 1)) * w.unit;

/** Seconds between bites. @param {World} w */
export const biteIntervalFor = (w) => Math.max(BITE_T_MIN, BITE_T - BITE_T_STEP * (w.wave - 1));

/** Put a full formation at the start spot. @param {World} w */
export function resetFormation(w) {
  for (const b of w.bugs) b.alive = true;
  w.alive = w.bugs.length;
  w.originX = w.left + Math.max(FORM_INSET, w.bugH / 2);
  w.originY = w.ceiling + FORM_TOP * w.unit;
  w.prevOriginX = w.originX;
  w.prevOriginY = w.originY;
  w.dir = 1;
  w.biteT = biteIntervalFor(w);
}

/** Push the formation back up to its start height, keeping who is alive. @param {World} w */
export function liftFormation(w) {
  w.originY = w.ceiling + FORM_TOP * w.unit;
  w.prevOriginY = w.originY;
}

/**
 * Slide the formation; at an edge it turns and drops instead.
 * @param {World} w
 * @param {number} dt
 * @returns {boolean} true when the lowest living bug reached Benjo's row
 */
export function moveFormation(w, dt) {
  const { minCol, maxCol, maxRow } = extent(w);
  const half = w.bugH / 2;
  const x = w.originX + w.dir * speedFor(w) * dt;
  if (x + minCol * w.colStep - half < w.left || x + maxCol * w.colStep + half > w.right) {
    w.dir = -w.dir;
    w.originY += DROP * w.unit;
  } else {
    w.originX = x;
  }
  return w.originY + maxRow * w.rowStep >= w.benjoY - w.bugH;
}

/** @param {World} w @param {number} col @returns {Bug | null} */
export function lowest(w, col) {
  for (let row = ROWS - 1; row >= 0; row--) {
    const b = w.bugs[row * COLS + col];
    if (b.alive) return b;
  }
  return null;
}

/**
 * Count down to the next bite. When it is due, pick a random column that has living bugs.
 * @param {World} w
 * @param {number} dt
 * @returns {Bug | null} the lowest bug of that column, which drops the bite
 */
export function nextBiter(w, dt) {
  w.biteT -= dt;
  if (w.biteT > 0) return null;
  w.biteT += biteIntervalFor(w);
  let columns = 0;
  for (let c = 0; c < COLS; c++) if (lowest(w, c)) columns += 1;
  let pick = Math.floor(w.random() * columns);
  for (let c = 0; c < COLS; c++) {
    const b = lowest(w, c);
    if (b && pick-- === 0) return b;
  }
  return null;
}

/** Shift the formation so its living bugs sit inside the play rect, above Benjo's row. @param {World} w */
function fitFormation(w) {
  const { minCol, maxCol, maxRow } = extent(w);
  const half = w.bugH / 2;
  w.originX = Math.min(w.originX, w.right - half - maxCol * w.colStep);
  w.originX = Math.max(w.originX, w.left + half - minCol * w.colStep);
  w.originY = Math.min(w.originY, w.benjoY - w.bugH - maxRow * w.rowStep - 1);
  w.originY = Math.max(w.originY, w.ceiling + half);
}

/**
 * Fit a running world to a new canvas size. Positions keep their place in the play rect, then
 * the formation is nudged back inside it, so the run carries on where it was.
 * @param {World} w
 * @param {Area} size
 * @returns {World}
 */
export function resizeWorld(w, size) {
  const l = layout(size);
  const kx = (l.right - l.left) / (w.right - w.left);
  const ky = (l.benjoY - l.ceiling) / (w.benjoY - w.ceiling);
  /** @param {number} x */
  const sx = (x) => clamp(l.left + (x - w.left) * kx, l.left, l.right);
  /** @param {number} y */
  const sy = (y) => clamp(l.ceiling + (y - w.ceiling) * ky, 0, l.height);
  w.bx = sx(w.bx);
  w.originX = l.left + (w.originX - w.left) * kx;
  w.originY = sy(w.originY);
  for (const s of [...w.bolts, ...w.bites, ...w.pops]) {
    s.x = sx(s.x);
    s.y = sy(s.y);
  }
  Object.assign(w, l);
  w.bx = clamp(w.bx, w.left + w.benjoH / 2, w.right - w.benjoH / 2);
  if (w.alive > 0) fitFormation(w);
  w.prevBx = w.bx;
  w.prevOriginX = w.originX;
  w.prevOriginY = w.originY;
  for (const s of [...w.bolts, ...w.bites]) s.prevY = s.y;
  return w;
}
