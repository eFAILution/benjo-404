// @ts-check
// Benjo Pinball's own cues and music (ADR-0076 section 6). Cues are a few synthesized tones each;
// a theme pack can restyle any of them by name. Tracks are note strings for the shell's music
// player: one character per sixteenth note, '.' a rest, '-' a held note, and 'A' is C2.

/** @typedef {import('../../contracts').Tone} Tone */
/** @typedef {import('../../contracts').MusicTrack} MusicTrack */

/**
 * Notes one after another, `step` seconds apart.
 * @param {Tone['type']} type @param {number[]} notes Hz @param {number} step @param {number} g
 * @returns {Tone[]}
 */
const run = (type, notes, step, g) =>
  notes.map((f, i) => ({ type, f, at: i * step, d: step * 1.4, g }));

/** @type {Record<string, Tone[]>} */
export const CUES = {
  flip: [{ type: 'square', f: 150, to: 90, d: 0.035, g: 0.14 }],
  bumper: [
    { type: 'square', f: 540, to: 270, d: 0.07, g: 0.22 },
    { type: 'triangle', f: 1080, d: 0.05, g: 0.12 },
  ],
  sling: [{ type: 'sawtooth', f: 320, to: 160, d: 0.05, g: 0.18 }],
  spin: [{ type: 'square', f: 1700, d: 0.018, g: 0.07 }],
  lane: [{ type: 'triangle', f: 880, to: 1320, d: 0.06, g: 0.25 }],
  target: [
    { type: 'square', f: 660, d: 0.05, g: 0.18 },
    { type: 'square', f: 990, at: 0.05, d: 0.06, g: 0.18 },
  ],
  ramp: [{ type: 'sawtooth', f: 220, to: 880, d: 0.25, g: 0.16 }],
  repair: run('square', [523, 659, 784, 1047, 1319], 0.06, 0.16),
  lock: [
    { type: 'triangle', f: 200, to: 60, d: 0.3, g: 0.4 },
    { type: 'square', f: 400, at: 0.1, d: 0.08, g: 0.14 },
  ],
  twin: run('square', [392, 523, 659, 784, 1047, 1319], 0.07, 0.16),
  jackpot: run('triangle', [784, 988, 1175, 1568, 1175, 1568], 0.06, 0.32),
  extra: run('triangle', [523, 784, 1047, 1568], 0.09, 0.32),
  tilt: [
    { type: 'sawtooth', f: 110, d: 0.4, g: 0.25 },
    { type: 'sawtooth', f: 117, d: 0.4, g: 0.25 },
  ],
  drain: [{ type: 'triangle', f: 440, to: 110, d: 0.6, g: 0.32 }],
  launch: [{ type: 'sawtooth', f: 120, to: 900, d: 0.18, g: 0.18 }],
  squash: [{ type: 'square', f: 220, to: 70, d: 0.07, g: 0.24 }],
  nudge: [{ type: 'triangle', f: 90, to: 55, d: 0.08, g: 0.35 }],
};

/** The hull: a steady space groove in A minor. @type {MusicTrack} */
export const HULL_TRACK = {
  bpm: 112,
  channels: [
    {
      type: 'triangle',
      g: 0.5,
      notes: 'J..J..J.J..J..J.J..J..J.J..J..Q.F..F..F.F..F..R.H..H..H.H..H..T.',
    },
    {
      type: 'square',
      g: 0.07,
      notes: 'h.k.o.k.h.k.o.k.h.k.o.t.o.k.h.k.d.h.k.h.d.h.k.h.f.j.m.j.f.j.m.r.',
    },
    { type: 'noise', g: 0.05, notes: '..w...w...w...w.' },
  ],
};

/** The bridge: faster and brighter, in E minor. @type {MusicTrack} */
export const BRIDGE_TRACK = {
  bpm: 136,
  channels: [
    { type: 'triangle', g: 0.5, notes: 'Q...Q.Q.Q...Q.Q.M...M.M.O...O.O.' },
    { type: 'square', g: 0.07, notes: 'c.f.j.f.c.f.j.o.Y.c.f.c.a.e.h.e.' },
    { type: 'noise', g: 0.05, notes: 'w.w.w.w.w.w.w.w.' },
  ],
};

/** Twin Mode: the most intense, with a drum line. @type {MusicTrack} */
export const TWIN_TRACK = {
  bpm: 156,
  channels: [
    { type: 'sawtooth', g: 0.16, notes: 'JVJVJVJVHTHTFRFR' },
    { type: 'square', g: 0.08, notes: 'h..h..k.o..m.k..h..h..k.r..o.m..' },
    { type: 'noise', g: 0.16, notes: 'A...k...A.A.k...' },
    { type: 'noise', g: 0.04, notes: '.w.w.w.w.w.w.w.w' },
  ],
};
