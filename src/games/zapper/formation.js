// @ts-check
// Layout and the bug formation: the play rect for a canvas size, how big each wave's block is,
// where each bug sits, how the block slides and drops, who bites, and how a running world fits a
// new size.
// Pure helpers over the World from world.js; nothing here reads the host.

import {
  AIM_MAX,
  AIM_STEP,
  BENJO_H,
  BENJO_RISE,
  BITE_SPEED,
  BITE_SPEED_CAP,
  BITE_SPEED_WAVE,
  BITE_T,
  BITE_T_JITTER,
  BITE_T_MIN,
  BITE_T_STEP,
  BLOCK_SHARE,
  BOTTOM_PAD,
  BUG_H,
  BURST_GAP,
  BURST_MAX,
  BURST_STEP,
  CEILING,
  CEILING_NARROW,
  COL_STEP,
  COLS,
  COLS_MAX,
  DROP,
  DROPS_CLEAR,
  FORM_INSET,
  FORM_SPEED,
  FORM_SPEED_CAP,
  FORM_SPEED_CAP_REDUCED,
  FORM_SPEED_RAMP,
  FORM_SPEED_WAVE,
  FORM_TOP,
  GROW_EVERY,
  HIT_R,
  MIN_HEIGHT,
  MIN_WIDTH,
  NARROW_WIDTH,
  REF_HEIGHT,
  ROW_STEP,
  ROWS,
  ROWS_MAX,
  SIDE_PAD,
  UNIT_MAX,
  UNIT_MIN,
} from './tuning.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {import('./world.js').Bug} Bug */
/** @typedef {import('./world.js').Area} Area */

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Column spacing for a block `cols` wide: the full step when it fits, else squeezed so the block
 * keeps the same share of the width at any column count.
 * @param {{ right: number, unit: number }} l @param {number} cols
 */
const colStepFor = (l, cols) =>
  Math.min(COL_STEP * l.unit, (l.right - SIDE_PAD - 2 * FORM_INSET) / cols);

/** @param {Area} size @param {number} [cols] columns in the current wave */
export function layout(size, cols = COLS) {
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
    colStep: colStepFor({ right, unit }, cols),
    rowStep: ROW_STEP * unit,
  };
}

/** Living columns and lowest row, refilled by extent(); one scratch object, no allocation. */
const span = { minCol: 0, maxCol: 0, maxRow: 0 };

/** @param {World} w */
function extent(w) {
  span.minCol = COLS_MAX;
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
  return Math.min(cap, base * (1 + FORM_SPEED_RAMP * (1 - w.alive / w.total))) * w.unit;
}

/**
 * The block for a wave (#83): COLS x ROWS at first, then a column and a row every GROW_EVERY
 * waves, up to COLS_MAX x ROWS_MAX. Extra columns are only added while the block spans at most
 * BLOCK_SHARE of the play width, and extra rows while its lowest row starts at least
 * DROPS_CLEAR drops above the front line, so a small screen keeps room to play.
 * @param {World} w
 */
export function blockFor(w) {
  /** @param {number} n */
  const span = (n) => (n - 1) * colStepFor(w, n) + w.bugH;
  const roomX = Math.max(span(COLS), BLOCK_SHARE * (w.right - w.left));
  let cols = Math.min(COLS_MAX, COLS + Math.floor(w.wave / GROW_EVERY));
  while (cols > COLS && span(cols) > roomX) cols -= 1;
  const want = Math.min(ROWS_MAX, ROWS + Math.floor((w.wave - 1) / GROW_EVERY));
  const room = w.benjoY - w.bugH - DROPS_CLEAR * DROP * w.unit - (w.ceiling + FORM_TOP * w.unit);
  const fit = Math.floor(room / w.rowStep) + 1;
  return { cols, rows: Math.max(Math.min(ROWS, want), Math.min(want, fit)) };
}

/** @param {World} w */
export const biteSpeedFor = (w) =>
  Math.min(BITE_SPEED_CAP, BITE_SPEED + BITE_SPEED_WAVE * (w.wave - 1)) * w.unit;

/** Seconds between bites. @param {World} w */
export const biteIntervalFor = (w) => Math.max(BITE_T_MIN, BITE_T - BITE_T_STEP * (w.wave - 1));

/** Put the wave's full formation at the start spot. @param {World} w */
export function resetFormation(w) {
  const { cols, rows } = blockFor(w);
  w.cols = cols;
  w.rows = rows;
  w.colStep = colStepFor(w, cols);
  for (const b of w.bugs) b.alive = b.col < cols && b.row < rows;
  w.total = cols * rows;
  w.alive = w.total;
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
  for (let row = w.rows - 1; row >= 0; row--) {
    const b = w.bugs[row * COLS_MAX + col];
    if (b.alive) return b;
  }
  return null;
}

/** Share of bites aimed at Benjo: none in wave 1, then more each wave. @param {World} w */
export const aimChanceFor = (w) => Math.min(AIM_MAX, AIM_STEP * (w.wave - 1));
/** Chance that a bite starts a burst: none before wave 3. @param {World} w */
export const burstChanceFor = (w) => Math.min(BURST_MAX, BURST_STEP * Math.max(0, w.wave - 2));

/** The lowest bug of a random column that has living bugs. @param {World} w */
function randomBiter(w) {
  let columns = 0;
  for (let c = 0; c < w.cols; c++) if (lowest(w, c)) columns += 1;
  let pick = Math.floor(w.random() * columns);
  for (let c = 0; c < w.cols; c++) {
    const b = lowest(w, c);
    if (b && pick-- === 0) return b;
  }
  return null;
}

/** The lowest bug of the living column nearest Benjo. @param {World} w */
function aimedBiter(w) {
  /** @type {Bug | null} */
  let best = null;
  for (let c = 0; c < w.cols; c++) {
    const b = lowest(w, c);
    if (b && (!best || Math.abs(bugX(w, b) - w.bx) < Math.abs(bugX(w, best) - w.bx))) best = b;
  }
  return best;
}

/**
 * Count down to the next bite. When it is due, pick who bites: the column nearest Benjo for an
 * aimed bite, else a random column. The next gap is jittered around the wave's interval, or
 * short when this bite starts a burst (#83).
 * @param {World} w
 * @param {number} dt
 * @returns {Bug | null} the lowest bug of that column, which drops the bite
 */
export function nextBiter(w, dt) {
  w.biteT -= dt;
  if (w.biteT > 0) return null;
  const burst = w.random() < burstChanceFor(w);
  const jitter = 1 + BITE_T_JITTER * (2 * w.random() - 1);
  w.biteT += burst ? BURST_GAP : biteIntervalFor(w) * jitter;
  return w.random() < aimChanceFor(w) ? aimedBiter(w) : randomBiter(w);
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
  const l = layout(size, w.cols);
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
