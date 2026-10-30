// @ts-check
// Background music (ADR-0076). A track is note data, so no audio files ship. The host calls tick()
// once per animation frame while a run plays, and tick() schedules the next notes a fraction of a
// second ahead on the AudioContext clock, so the player needs no timer of its own.

import { FADE, SILENT } from './audio.js';

/** @typedef {import('../contracts').MusicTrack} MusicTrack */
/** @typedef {import('../contracts').MusicChannel} MusicChannel */
/** @typedef {{ context: AudioContext, master: GainNode }} AudioOutput */
/**
 * What music needs from the sound engine (audio.js).
 * @typedef {{ output(): AudioOutput | null }} MusicAudio
 */

/** Notes are scheduled this far ahead, in seconds, so a slow frame never leaves a gap. */
const LOOKAHEAD = 0.2;
/** Music plays at half the master volume, under the cues. */
const VOLUME = 0.5;
/** A note's attack, in seconds, so it starts without a click. */
const ATTACK = 0.005;
/** The longest a noise hit rings, in seconds; drums stay short whatever the hold. */
const NOISE_HIT = 0.12;
/** The shared noise buffer's length, in seconds. */
const NOISE_SECONDS = 0.5;
/** The fastest tempo played. A faster one would flood the scheduler with notes. */
const MAX_BPM = 1500;

/**
 * The MIDI note for one step's character, or -1 for a rest, a hold, or anything else.
 * 'A'..'Z' are MIDI 36..61 and 'a'..'z' are 62..87.
 * @param {string} char
 */
export function midiOf(char) {
  const code = char.charCodeAt(0);
  if (code >= 65 && code <= 90) return code - 29;
  if (code >= 97 && code <= 122) return code - 35;
  return -1;
}

/** @param {number} midi */
const hertz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** One step, a sixteenth note, in seconds. @param {MusicTrack} tune */
const stepSeconds = (tune) => 15 / tune.bpm;

/**
 * How many steps the note at `index` lasts: itself plus each '-' after it, wrapping round the loop.
 * @param {string} notes @param {number} index
 */
function heldSteps(notes, index) {
  let steps = 1;
  while (steps < notes.length && notes[(index + steps) % notes.length] === '-') steps += 1;
  return steps;
}

/** @param {MusicAudio} audio */
export function createMusic(audio) {
  /** @type {MusicTrack | null} */
  let track = null;
  let held = false;
  /** The next step to schedule, counted from the track's start, and when it sounds. */
  let step = 0;
  let nextTime = 0;
  /** This stretch of music's own gain. A stop or hold fades it and the next note makes a new one. */
  /** @type {GainNode | null} */
  let bus = null;
  /** The bus faded last, cut loose once the next one fades, so old nodes do not pile up. */
  /** @type {GainNode | null} */
  let faded = null;
  /** @type {AudioBuffer | null} */
  let noise = null;

  /** Fade out everything already scheduled. The next tick starts fresh on the context clock. */
  function quiet() {
    if (!bus) return;
    bus.gain.setTargetAtTime(0, bus.context.currentTime, FADE);
    faded?.disconnect();
    faded = bus;
    bus = null;
    nextTime = 0;
  }

  /** @param {AudioContext} context */
  function noiseBuffer(context) {
    if (noise) return noise;
    const length = Math.floor(context.sampleRate * NOISE_SECONDS);
    noise = context.createBuffer(1, length, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return noise;
  }

  /**
   * One note: a short attack, then a decay over its held length.
   * @param {AudioContext} context @param {GainNode} out @param {MusicChannel} channel
   * @param {number} midi @param {number} start @param {number} length seconds
   */
  function playNote(context, out, channel, midi, start, length) {
    const gain = context.createGain();
    /** @type {AudioScheduledSourceNode} */
    let source;
    if (channel.type === 'noise') {
      const hit = context.createBufferSource();
      hit.buffer = noiseBuffer(context);
      const filter = context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = hertz(midi);
      hit.connect(filter).connect(gain);
      source = hit;
    } else {
      const osc = context.createOscillator();
      osc.type = channel.type;
      osc.frequency.value = hertz(midi);
      osc.connect(gain);
      source = osc;
    }
    const end = start + (channel.type === 'noise' ? Math.min(length, NOISE_HIT) : length);
    gain.gain.setValueAtTime(SILENT, start);
    gain.gain.linearRampToValueAtTime(channel.g, start + ATTACK);
    gain.gain.exponentialRampToValueAtTime(SILENT, end);
    gain.connect(out);
    source.start(start);
    source.stop(end);
  }

  /**
   * Every channel's note for one step, at `time`.
   * @param {AudioContext} context @param {GainNode} out @param {MusicTrack} tune
   * @param {number} time
   */
  function playStep(context, out, tune, time) {
    const seconds = stepSeconds(tune);
    for (const channel of tune.channels) {
      const { notes } = channel;
      if (!notes) continue;
      const index = step % notes.length;
      const midi = midiOf(notes[index]);
      if (midi >= 0) playNote(context, out, channel, midi, time, heldSteps(notes, index) * seconds);
    }
  }

  /** Schedule every step that starts within the lookahead. Call once per animation frame. */
  function tick() {
    // A missing, zero, or runaway tempo plays nothing, so a bad track can never hang a frame.
    if (!track || held || !(track.bpm > 0 && track.bpm <= MAX_BPM)) return;
    const out = audio.output();
    if (!out) return quiet();
    const { context, master } = out;
    if (!bus) {
      bus = context.createGain();
      bus.gain.value = VOLUME;
      bus.connect(master);
    }
    const now = context.currentTime;
    // After a hold, a mute, or a slow tab, carry on from the same step instead of catching up.
    if (nextTime <= now) nextTime = now + ATTACK;
    const seconds = stepSeconds(track);
    while (nextTime < now + LOOKAHEAD) {
      playStep(context, bus, track, nextTime);
      step += 1;
      nextTime += seconds;
    }
  }

  return {
    tick,
    /** Start a looping track. The track already playing carries on; another switches at once. */
    play(/** @type {MusicTrack} */ next) {
      if (next === track) return;
      quiet();
      track = next;
      step = 0;
    },
    stop() {
      quiet();
      track = null;
      held = false;
    },
    /** Pause keeps the track and its place; the host holds it while the run is paused. */
    hold(/** @type {boolean} */ on) {
      held = on;
      if (on) quiet();
    },
  };
}
