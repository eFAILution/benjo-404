// @ts-check
// Game sound (#11, A-8.4). Every cue is a few synthesized tones, so no audio files ship. The
// AudioContext is made on the player's first input, because browsers block sound before that.

/** @typedef {import('../contracts').AudioCue} AudioCue */
/** @typedef {import('../contracts').Tone} Tone */
/** @typedef {import('../contracts').GameStorage} GameStorage */

const MUTED_KEY = 'muted';
/** Master volume. Cues set their own gain under this. */
const VOLUME = 0.18;
/** Exponential ramps cannot reach zero, so tones fade to this instead. */
const SILENT = 0.0001;

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
  clear: [523, 659, 784, 1047].map((f, i) => ({
    type: 'square',
    f,
    at: i * 0.08,
    d: 0.1,
    g: 0.18,
  })),
  best: [784, 988, 1175, 1568].map((f, i) => ({
    type: 'triangle',
    f,
    at: i * 0.07,
    d: 0.12,
    g: 0.4,
  })),
  over: [392, 330, 262].map((f, i) => ({ type: 'triangle', f, at: i * 0.15, d: 0.18, g: 0.4 })),
};

/**
 * @param {{ storage: GameStorage, cues?: Partial<Record<AudioCue, Tone[]>> }} options
 *   cues from the theme pack replace the defaults one cue at a time
 */
export function createAudio({ storage, cues = {} }) {
  const table = { ...CUES, ...cues };
  let muted = storage.getFlag(MUTED_KEY);
  /** @type {AudioContext | null} */
  let context = null;
  /** @type {GainNode | null} */
  let master = null;

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
      master.gain.value = VOLUME;
      master.connect(context.destination);
    } catch {
      context = null;
    }
  }

  /**
   * @param {AudioContext} audio
   * @param {GainNode} out
   * @param {Tone} tone
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
  }

  return {
    unlock,
    /** @param {AudioCue} cue */
    play(cue) {
      if (muted || !context || !master || context.state !== 'running') return;
      for (const tone of table[cue] ?? []) playTone(context, master, tone);
    },
    get muted() {
      return muted;
    },
    /** @param {boolean} value */
    setMuted(value) {
      muted = value;
      storage.setFlag(MUTED_KEY, value);
    },
  };
}
