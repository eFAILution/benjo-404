// @ts-check
// Save codes (#22): the progress packed as varints with a 16-bit checksum, written in lower-case
// Crockford base32 and split into 7-character groups so it reads like a row of commit hashes.
// A code is untrusted input, so decoding checks everything and never throws.

/**
 * Every game a code can carry a best for, in a fixed order. New games append; never reorder.
 */
export const KNOWN_GAMES = /** @type {const} */ ([
  'runner',
  'flight',
  'stack',
  'tail',
  'breakout',
  'crossing',
  'zapper',
  'whack',
  'links',
  'muncher',
  'pinball',
  'neversleeps',
  'savefile',
  'tower',
  'bugbelt',
  'benjotower',
  'memleak',
  'crackhash',
]);

/** The progress fields a code carries, in order, after the format number. */
export const SAVE_FIELDS = /** @type {const} */ ([
  'xp',
  'trophies',
  'look',
  'streak',
  'nightlyDay',
  'runs',
  'seq',
  'closed',
  'played',
  'powers',
]);

/** @typedef {Record<(typeof SAVE_FIELDS)[number], number> & { bests: number[] }} SaveData */

const FORMAT = 1;
const MAX_VALUE = 1e9;
const MAX_BESTS = 64;
const MAX_CODE = 200;
const GROUPS = /.{1,7}/g;
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** @param {number[]} bytes */
function checksum(bytes) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
  return (hash ^ (hash >>> 16)) & 0xffff;
}

/**
 * @param {number[]} out
 * @param {number} value
 */
function pushVarint(out, value) {
  let left = Math.min(MAX_VALUE, Math.max(0, Math.floor(Number(value) || 0)));
  while (left >= 0x80) {
    out.push((left & 0x7f) | 0x80);
    left >>>= 7;
  }
  out.push(left);
}

/** @param {SaveData} data */
export function encodeSave(data) {
  /** @type {number[]} */
  const bytes = [];
  for (const value of [FORMAT, ...SAVE_FIELDS.map((key) => data[key]), data.bests.length]) {
    pushVarint(bytes, value);
  }
  for (const best of data.bests) pushVarint(bytes, best);
  const sum = checksum(bytes);
  bytes.push(sum >>> 8, sum & 0xff);
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >>> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out.match(GROUPS)?.join('-') ?? '';
}

/**
 * Base32 text to bytes. Crockford reads o as 0 and i or l as 1. Null on a bad character or
 * nonzero padding bits.
 * @param {string} code
 * @returns {number[] | null}
 */
function toBytes(code) {
  const clean = code.toLowerCase().replace(/[\s-]/g, '').replace(/o/g, '0').replace(/[il]/g, '1');
  if (clean.length === 0 || clean.length > MAX_CODE) return null;
  /** @type {number[]} */
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) return null;
    buffer = ((buffer << 5) | value) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }
  return bits < 5 && (buffer & ((1 << bits) - 1)) === 0 ? bytes : null;
}

/**
 * @param {unknown} code
 * @returns {SaveData | null}
 */
export function decodeSave(code) {
  const bytes = typeof code === 'string' ? toBytes(code) : null;
  if (!bytes || bytes.length < 3) return null;
  const body = bytes.slice(0, -2);
  const [high, low] = bytes.slice(-2);
  if (checksum(body) !== high * 256 + low) return null;
  let at = 0;
  const read = () => {
    let value = 0;
    for (let shift = 0; shift < 35 && at < body.length; shift += 7) {
      const byte = body[at++];
      value += (byte & 0x7f) * 2 ** shift;
      if (byte < 0x80) return value <= MAX_VALUE ? value : -1;
    }
    return -1;
  };
  const values = Array.from({ length: SAVE_FIELDS.length + 2 }, read);
  const count = values[values.length - 1];
  if (values[0] !== FORMAT || values.includes(-1) || count > MAX_BESTS) return null;
  const bests = Array.from({ length: count }, read);
  if (bests.includes(-1) || at !== body.length) return null;
  return /** @type {SaveData} */ ({
    ...Object.fromEntries(SAVE_FIELDS.map((key, index) => [key, values[index + 1]])),
    bests,
  });
}

/**
 * The streak goes with its day, so a stale code cannot pass off an old streak as today's: the
 * later nightly day keeps its streak, and on the same day the longer streak stands.
 * @param {SaveData} mine @param {SaveData} theirs @param {number} today
 */
function mergeStreak(mine, theirs, today) {
  const a = Math.min(mine.nightlyDay, today);
  const b = Math.min(theirs.nightlyDay, today);
  if (a === b) return { streak: Math.max(mine.streak, theirs.streak), nightlyDay: a };
  return a > b ? { streak: mine.streak, nightlyDay: a } : { streak: theirs.streak, nightlyDay: b };
}

/**
 * Restore never takes progress away: numbers keep the larger value and masks keep every bit. The
 * streak is the one exception, since it belongs to a day (mergeStreak).
 * @param {SaveData} mine
 * @param {SaveData} theirs already decoded and range checked
 * @param {{ today: number, trophies: number, powers: number, games: number, looks: number }} limits
 * @returns {SaveData}
 */
export function mergeSave(mine, theirs, limits) {
  const max = (/** @type {(typeof SAVE_FIELDS)[number]} */ key) => Math.max(mine[key], theirs[key]);
  const or = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ all) =>
    (a | b) & all;
  return {
    xp: max('xp'),
    trophies: or(mine.trophies, theirs.trophies, limits.trophies),
    look: Math.min(mine.look || theirs.look, limits.looks),
    ...mergeStreak(mine, theirs, limits.today),
    runs: max('runs'),
    seq: max('seq'),
    closed: max('closed'),
    played: or(mine.played, theirs.played, limits.games),
    powers: or(mine.powers, theirs.powers, limits.powers),
    bests: mine.bests.map((best, index) => Math.max(best, theirs.bests[index] ?? 0)),
  };
}
