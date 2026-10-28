// @ts-check
// Benjo's trail for one run (#22): the Digital Twin a beat behind him, and the ghost of the best
// run, recorded at 4 Hz and kept in the game's storage.
/** @typedef {import('../contracts').GameStorage} GameStorage */
/** @typedef {import('../contracts').Size} Size */

// URL-safe base64: one char per 6-bit axis, so a sample is 2 chars.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LEVELS = 63;
/** Updates between ghost samples: 4 Hz at 60 updates a second. */
export const SAMPLE_TICKS = 15;
// Storage values max out at 256 chars (storage.js), so a ghost spans up to 8 keys.
const CHUNK = 256;
const CHUNKS = 8;
export const MAX_SAMPLES = (CHUNK * CHUNKS) / 2;
const MIN_SAMPLES = 8;
// The twin trails Benjo by 0.25 s of updates.
const TWIN_LAG = 15;
const GHOST_ALPHA = 0.25;
const TWIN_ALPHA = 0.45;

/** @param {number} value 0 to 1 */
const quantize = (value) => Math.round(Math.min(Math.max(value, 0), 1) * LEVELS) || 0;

/**
 * One sample, as a fraction of the canvas size.
 * @param {number} x
 * @param {number} y
 */
export const encodePoint = (x, y) => ALPHABET[quantize(x)] + ALPHABET[quantize(y)];

/**
 * Flat [x0, y0, x1, y1, ...] in 0..1, or null for anything that is not a whole, valid ghost.
 * @param {unknown} text
 * @returns {number[] | null}
 */
export function decodeGhost(text) {
  if (typeof text !== 'string' || text.length % 2 !== 0) return null;
  if (text.length < MIN_SAMPLES * 2 || text.length > MAX_SAMPLES * 2) return null;
  const codes = [...text].map((char) => ALPHABET.indexOf(char));
  return codes.includes(-1) ? null : codes.map((code) => code / LEVELS);
}

/**
 * `ghostn` holds the sample count and goes last, so a half-written ghost fails the length check.
 * @param {GameStorage} storage
 */
export function loadGhost(storage) {
  const samples = storage.getNumber('ghostn', 0);
  if (!Number.isInteger(samples) || samples < MIN_SAMPLES || samples > MAX_SAMPLES) return null;
  const keys = Math.ceil((samples * 2) / CHUNK);
  const text = Array.from({ length: keys }, (_, i) => storage.get(`ghost${i}`) ?? '').join('');
  return text.length === samples * 2 ? decodeGhost(text) : null;
}

/**
 * @param {GameStorage} storage
 * @param {string} text encoded samples
 */
export function saveGhost(storage, text) {
  if (decodeGhost(text) === null) return false;
  storage.set('ghostn', '0');
  const chunks = text.match(/.{1,256}/g) ?? [];
  const saved = chunks.every((chunk, i) => storage.set(`ghost${i}`, chunk));
  return saved && storage.set('ghostn', String(text.length / 2));
}

/**
 * Where the ghost is `f` samples into the run, interpolated; null once it runs out.
 * @param {number[]} points from decodeGhost
 * @param {number} f
 * @returns {[number, number] | null}
 */
export function ghostAt(points, f) {
  const i = Math.floor(f);
  if (i < 0 || i * 2 + 3 >= points.length) return null;
  const t = f - i;
  const at = (/** @type {number} */ k) => points[k] + (points[k + 2] - points[k]) * t;
  return [at(i * 2), at(i * 2 + 1)];
}

/** About 8% of the short side, clamped to 24-48 px. @param {Size} size */
export const avatarSize = (size) =>
  Math.min(Math.max(Math.min(size.width, size.height) * 0.08, 24), 48);

/**
 * @param {GameStorage} storage
 * @param {Size} size live canvas size
 */
export function createTrail(storage, size) {
  const ghost = loadGhost(storage);
  /** @type {[number, number] | null} */
  let pos = null;
  /** @type {Array<[number, number]>} */
  let recent = [];
  let trace = '';

  return {
    /** True when this run races a saved ghost. */
    racing: ghost !== null,
    /** @param {number} x @param {number} y canvas CSS px */
    track(x, y) {
      if (Number.isFinite(x) && Number.isFinite(y)) pos = [x, y];
    },
    /** After each update. `tick` counts updates from 0. @param {number} tick */
    step(tick) {
      if (!pos) return;
      recent = [...recent.slice(-TWIN_LAG), pos];
      if (tick % SAMPLE_TICKS !== 0 || trace.length >= MAX_SAMPLES * 2) return;
      trace += encodePoint(pos[0] / size.width, pos[1] / size.height);
    },
    /**
     * @param {number} tick updates so far
     * @param {boolean} twin
     * @param {(x: number, y: number, alpha: number) => void} paint
     */
    draw(tick, twin, paint) {
      const at = ghost && ghostAt(ghost, tick / SAMPLE_TICKS);
      if (at) paint(at[0] * size.width, at[1] * size.height, GHOST_ALPHA);
      if (twin && recent.length > 0) paint(recent[0][0], recent[0][1], TWIN_ALPHA);
    },
    /** Keep this run as the ghost to beat. False when it is too short or storage failed. */
    save: () => saveGhost(storage, trace),
  };
}

/** @typedef {ReturnType<typeof createTrail>} Trail */
