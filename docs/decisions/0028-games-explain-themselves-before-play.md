# 0028. Games explain themselves before play

- Status: Proposed
- Date: 2026-10-28
- Deciders: eFAILution

## Context

ADR-0008 gave every game a `controls` pair: one keyboard hint and one touch hint, each up to 40 characters, shown in the HUD during a run. With nine games (ADR-0020) that is not enough. Play-testing (#28) found that Whack-a-Bug never says Space whacks the center hole, or that whacking a feature costs points. The other games never explain their obstacles, pickups, scoring, or how a run ends. Visitors land on a 404 page by accident, so they have never seen these games before.

## Decision

- **Contract.** `GameModule` gains an optional `howTo`: a `goal` (140 characters), `keys` and `touch` lines that pair an input with what it does (24 and 48 characters), and `things` on the board, each with a `name` (24) and a `tip` (72). Each thing shows either a theme sprite (`{ set: 'benjo' }`, or `hazards` or `pickups` with the `index` the game draws) or a `swatch` in a palette color, for things the game draws as shapes. It is optional in the type so older or third-party games still build. `tests/games/howto.test.js` requires it for every bundled game.
- **When it shows.** Pressing play on a game the visitor has not seen shows a How to play card, with **Got it, play** and **Back**. Seen games are remembered per game in `localStorage` under the `howto` namespace. A **How to play** button on the start screen and on the paused card reopens it at any time. From the paused card, it resumes or goes back to the paused card.
- **Theme art.** Icons are drawn from the active theme with the shell's `drawSprite`, so a holiday pack's pumpkins show as pumpkins. The card has its own opaque background, because on the start screen the 404 message sits right behind it.
- **Numbers come from tuning.** Each game's `howto.js` builds scores, times, and lives from its own `tuning.js` constants, so retuning a game cannot leave the card wrong.
- **Only the visitor's controls (#64).** Play-testing on a phone found the keyboard column was noise there. The card shows touch lines or key lines, not both. Before any input the shell guesses from `(pointer: coarse)`, then follows the last input the visitor used (`src/shell/device.js`, A-64.1). A run's first HUD hint starts from the same guess. A game with no lines for that device falls back to the other kind.
- **Power-ups (#64).** Below the board, the card lists the power-ups the game can drop (ADR-0022 section 7): Cache Hit and Breakpoint, then `GameModule.powers`. Each line shows its HUD badge, its name and run time, and a tip, with one sentence on how a power-up drops and how to fire it on this device. `HowTo.powers` words what Digital Twin, Garbage Collector, and Load Balancer do in this game (72 characters each). The shell words Cache Hit, Breakpoint, Rollback, and any power a game leaves out. `tests/games/howto.test.js` requires a tip for each of those three powers a game drops.

## Alternatives considered

- **A panel under the game wheel, always shown.** No extra click, but it would push Return Home and the message down on phones. The owner picked the card.
- **Longer HUD hints.** The strip has no room, and the hint fades after a few seconds.
- **Text only, no icons.** Smaller, but "leave the features alone" is ambiguous when a holiday theme redraws the features.
- **Show both input kinds on every device.** The first version did this, because touch is only known after the first input. On a phone the keyboard column was noise, and a wrong guess is put right by the visitor's first tap or key (#64).
- **Explain power-ups in the HUD when one drops.** The status strip is short and already holds the game's hint, and a visitor reads the card before the first run anyway.

## Consequences

- The first run of each game takes one more press. A returning visitor never sees the card again unless they ask for it. A private window or a new device shows it again (A-28.1).
- The shell grows by about 2 KB gzipped (16.1 KB of its 24 KB). Each game grows by about 0.3 KB. The power-up section and the device guess add about 0.6 KB more to the shell (26.2 KB of its 28 KB, #64).
- The card's text is hand-written from each game's code. A rule change, such as a new obstacle, needs a matching `howTo` edit. The test only checks shape and length (A-28.2).
