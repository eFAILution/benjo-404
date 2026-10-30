# 0011. Game sound from synthesized cues

- Status: Proposed
- Date: 2026-10-29
- Deciders: eFAILution

## Context

Issue #11 asks for game sound with a mute toggle: "play named cues (jump, pickup, hit, new best)", with mute one tap away (A-8.4). The sound was built in PR #21, alongside the seven games of #20, and it was first recorded as item 10 of ADR-0020. ADR-0000 keeps one decision record per issue, so this record holds #11's decision, and ADR-0020 points here (#36).

## Decision

- **Synthesized, not files.** `src/shell/audio.js` builds every cue from a few Web Audio tones (`Tone`: wave, frequency, optional slide, delay, length, gain). No audio files ship, and the page stays one self-contained file within its budget.
- **Ten named cues, shared by every game:** `jump`, `shoot`, `land`, `turn`, `score`, `pickup`, `hit`, `clear`, `best`, and `over`. A game plays one cue per step through the optional `host.audio`, picked from its own world events. The host plays `best` when a run raises the stored best, the first score included (#36), and `over` otherwise.
- **Theme packs may restyle any cue.** `ThemePack.cues` replaces the defaults one cue at a time, so holidays sound different in every game at once.
- **Silent until the player acts.** The AudioContext is made on the first tap or key press, because browsers block sound before that. It is resumed from `suspended` or `interrupted`, for iOS Safari. The idle page never plays a sound.
- **Mute.** A speaker button next to pause, and the M key, toggle sound. The choice is stored in `localStorage` under the `audio` namespace. Sound is on by default, at a master volume of 0.18 (A-20.3).

## Alternatives considered

- **Audio files (MP3 or OGG).** Richer sounds, but they would need inlining as `data:` URLs, which costs kilobytes per cue and a CSP `media-src`.
- **Per-game sound sets.** More flavor, but ten shared cues keep the shell small, and a theme can restyle all of them in one place.
- **Off by default.** Quieter for an office visitor, but #11 asks for sound, and nothing plays until the visitor starts a game.

## Consequences

- A new game gets sound for free by playing named cues. A new cue name is a contract change in `AudioCue`.
- The shell grows by a few hundred bytes gzipped for the cue table and the audio wrapper.
- Phones on silent mode play nothing, which is noted in the README.
