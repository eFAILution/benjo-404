// @ts-check
// Game sound (#11, A-8.4). Every cue is a few synthesized tones, so no audio files ship. The
// AudioContext is made on the player's first input, because browsers block sound before that.
// A game may bring its own named cues, and a voice limit keeps fast chains of them clear (ADR-0076).

/** @typedef {import('../contracts').AudioCue} AudioCue */
/** @typedef {import('../contracts').Tone} Tone */
/** @typedef {import('../contracts').GameStorage} GameStorage */

const MUTED_KEY = 'muted';
/** Master volume. Cues set their own gain under this. */
const VOLUME = 0.18;
/** Exponential ramps cannot reach zero, so tones fade to this instead. */
export const SILENT = 0.0001;
/** At most this many cue tones sound at once; a cue that would go over is skipped. */
const MAX_VOICES = 6;
/** A cue replayed sooner than this, in seconds, is skipped, so a bumper chain stays clear. */
const REPEAT = 0.04;
/** Mute fades the master over about this time constant, in seconds, so it stops at once. */
export const FADE = 0.015;

/**
 * Notes played one after another, `step` seconds apart, all with the same wave, length, and gain.
 * @param {Tone['type']} type @param {number[]} notes Hz @param {number} step
 * @param {number} d @param {number} g
 * @returns {Tone[]}
 */
const sequence = (type, notes, step, d, g) =>
  notes.map((f, i) => ({ type, f, at: i * step, d, g }));

/** @type {Record<AudioCue, Tone[]>} */
export const CUES = {
  jump: [{ type: 'square', f: 330, to: 660, d: 0.09, g: 0.25 }],
  shoot: [{ type: 'sawtooth', f: 900, to: 220, d: 0.08, g: 0.15 }],
  land: [{ type: 'triangle', f: 180, to: 90, d: 0.06, g: 0.4 }],
  turn: [{ type: 'square', f: 520, d: 0.03, g: 0.12 }],
  score: [{ type: 'triangle', f: 660, to: 990, d: 0.07, g: 0.35 }],
  pickup: [
    { type: 'square', f: 880, d: 0.06, g: 0.2 },
    { type: 'square', f: 1320, at: 0.06, d: 0.08, g: 0.2 },
  ],
  hit: [{ type: 'sawtooth', f: 220, to: 55, d: 0.3, g: 0.3 }],
  clear: sequence('square', [523, 659, 784, 1047], 0.08, 0.1, 0.18),
  best: sequence('triangle', [784, 988, 1175, 1568], 0.07, 0.12, 0.4),
  over: sequence('triangle', [392, 330, 262], 0.15, 0.18, 0.4),
};

/**
 * A cue by name, if the table holds one. A name like 'constructor' finds a function, not tones.
 * @param {Partial<Record<string, Tone[]>> | undefined} table @param {string} name
 */
const pick = (table, name) => {
  const tones = table?.[name];
  return Array.isArray(tones) ? tones : undefined;
};

/**
 * @param {{ storage: GameStorage, cues?: Partial<Record<string, Tone[]>> }} options
 *   cues from the theme pack replace the defaults, and a game's own cues, one cue at a time
 */
export function createAudio({ storage, cues }) {
  let muted = storage.getFlag(MUTED_KEY);
  /** @type {AudioContext | null} */
  let context = null;
  /** @type {GainNode | null} */
  let master = null;
  /** When each cue tone still in the air stops, on the context clock. */
  /** @type {number[]} */
  let voices = [];
  /** When each cue name last played, on the context clock. */
  /** @type {Map<string, number>} */
  const last = new Map();

  /** Call from an input handler. Makes the context on the first call and wakes it after. */
  function unlock() {
    if (context) {
      // iOS Safari parks the context in 'interrupted' as well as 'suspended'; both need a resume.
      const state = /** @type {string} */ (context.state);
      if (state === 'suspended' || state === 'interrupted') context.resume().catch(() => {});
      return;
    }
    const Context = globalThis.AudioContext;
    if (typeof Context !== 'function') return;
    try {
      context = new Context();
      master = context.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(context.destination);
    } catch {
      context = null;
    }
  }

  /**
   * @param {AudioContext} audio
   * @param {GainNode} out
   * @param {Tone} tone
   * @returns {number} when the tone stops
   */
  function playTone(audio, out, tone) {
    const start = audio.currentTime + (tone.at ?? 0);
    const stop = start + tone.d;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = tone.type ?? 'square';
    osc.frequency.setValueAtTime(tone.f, start);
    if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, stop);
    gain.gain.setValueAtTime(tone.g ?? 0.3, start);
    gain.gain.exponentialRampToValueAtTime(SILENT, stop);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(stop);
    return stop;
  }

  /** The running context and master gain, or null while muted or before the first input. */
  function output() {
    if (muted || !context || !master || context.state !== 'running') return null;
    return { context, master };
  }

  return {
    unlock,
    output,
    /**
     * The theme's cue by that name wins, then the game's, then the shared one.
     * @param {AudioCue | string} cue
     * @param {Partial<Record<string, Tone[]>>} [gameCues] the current game's own cues
     */
    play(cue, gameCues) {
      const out = output();
      const tones = pick(cues, cue) ?? pick(gameCues, cue) ?? pick(CUES, cue);
      if (!out || !tones) return;
      const now = out.context.currentTime;
      if (now - (last.get(cue) ?? Number.NEGATIVE_INFINITY) < REPEAT) return;
      voices = voices.filter((stop) => stop > now);
      if (voices.length + tones.length > MAX_VOICES) return;
      last.set(cue, now);
      for (const tone of tones) voices.push(playTone(out.context, out.master, tone));
    },
    get muted() {
      return muted;
    },
    /** Muting fades the master, so tones and music already playing stop too. @param {boolean} value */
    setMuted(value) {
      muted = value;
      storage.setFlag(MUTED_KEY, value);
      if (!context || !master) return;
      master.gain.setTargetAtTime(value ? 0 : VOLUME, context.currentTime, FADE);
    },
  };
}
