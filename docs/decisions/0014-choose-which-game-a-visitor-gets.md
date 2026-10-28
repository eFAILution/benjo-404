# 0014. Choose which game a visitor gets

- Status: Proposed
- Date: 2026-10-25
- Deciders: eFAILution, pending the team

## Context

ADR-0008 lets the build bundle several games, but the shell always started the first entry in `games`, and only `?game=` changed that. With Benjo Flight (#13) next to Benjo Run, the page needs a rule for which game a visitor gets, and maybe a way to switch. Issue #14 asks the team to decide between three approaches. The owner asked for all three to be written up here, with option 1 built for now so it can be tried.

Constraints from ADR-0008 and the README still hold. The 404 message and Return Home stay visible and are never covered. Everything works with keyboard and touch. A failing game must not take the page down.

## Options

1. **Random start plus a picker.** Each visit starts on a random bundled game. The idle screen shows a picker under the play prompt, and the game over card offers "Play <other game>" next to "Play again".
2. **Picker only.** The visit starts on the first game in `games`, with the same picker and game over buttons.
3. **Random only.** A random game per visit, with no picker. The player sees another game on a later visit.

## Decision

Build option 1 as the default, and make all three options a configuration choice, so the team can switch without touching code:

| Option | `startGame` | `gamePicker` |
|--------|-------------|--------------|
| 1. Random start plus a picker (default) | `"random"` | `true` |
| 2. Picker only | `"first"` | `true` |
| 3. Random only | `"random"` | `false` |

Both fields are optional in `benjo.config.json`, and `build/entry.js` validates them. With them left out, the page behaves as option 1. `?game=<id>` still pins a game for testing, and `?game=none` still turns games off.

How it works:

- `resolve()` in `src/shell/boot.js` stays pure. `pickGame()` takes the bundled games, the config, the query, and a `random()` function, which tests seed. `resolve` also returns the full list of games and whether the picker shows. The picker shows only when it is on, at least two games are bundled, and games are not turned off.
- `src/shell/main.js` builds one host per game and swaps it only while idle or on the game over card, never during a run. Each game keeps its own best score namespace.
- The picker is a group of toggle buttons (`aria-pressed`) inside the message's prompt slot, so it sits below Return Home and hides during a run with the rest of the prompt. Picking a game only selects it; the play prompt or Space starts it. The game over card's switch buttons start the other game at once.
- The host's HUD port is unchanged. `main.js` passes the host a HUD whose `showOver` adds the switch buttons, so `host.js` still knows only its own game.

## Alternatives considered

- **Build only the chosen option, without configuration.** Less code, but the team asked to decide later, and a switch in config is cheaper than a second PR. Two small fields cover all three options.
- **A picker that starts the game on click.** One click fewer, but a stray tap would launch a game, and keyboard users tabbing through the options would not expect a run to start. Selecting and then pressing play matches the existing prompt.
- **Rotate games by date instead of random.** Predictable for repeat visitors, but everyone on the same day gets the same game, and it overlaps with what holiday themes already do by date.
- **Remember the last game picked in `localStorage`.** It may come later. For now each visit follows the rule above, which keeps storage to the best scores (A-14.2).

## Consequences

- With one game bundled, the page looks and behaves exactly as before: no picker and no switch buttons.
- Random start makes the first screen differ between visits. Testers use `?game=` for a fixed game.
- The team's final choice is a change to two lines in `benjo.config.json`, and to this ADR's status.
