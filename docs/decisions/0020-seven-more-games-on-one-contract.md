# 0020. Seven more games on the same contract

- Status: Proposed
- Date: 2026-10-28
- Deciders: eFAILution

## Context

ADR-0008 made games plug-in folders, and ADR-0013 showed a second game fits the contract with no shell change. ADR-0014 added a picker that lists every bundled game. Issue #20 asks for seven more games in one pull request: Break the 404 (brick breaker), Dragon Tail (snake), Bug Zapper (space invaders), Whack-a-Bug (whack-a-mole), Fix the Link (pipe puzzle), Code Crossing (frogger), and Stack the Server (stacker).

Seven games built at once raise questions the first two did not. The games are built in parallel, so their file ownership must not overlap. The picker and the game over card were drawn for two games and must now hold nine. The page grows by roughly the sum of the games, and the Webflow embed (`dist/embed/benjo-404.js`) is already above the 50,000 character limit per embed (A-8.1, issue #10). The keyboard map in `src/shell/input.js` has seven actions, and some genres want more keys than that.

## Decision

1. **No shell change is needed to add a game.** Each game lives in `src/games/<id>/` and its tests in `tests/games/<id>/`, and nothing else. A game that needs a shell change is redesigned until it does not. The only shell changes in this PR are for the picker, the game over card, the config, and the README, and they are made by one integrator after the games land.

2. **Every game copies the Benjo Flight layout.** `tuning.js` holds every number, `world.js` is a pure fixed-step world with no DOM that takes `random` from the host, `controls.js` turns `InputState` into the game's own intent, `draw.js` only reads the world, and `index.js` wires them to the host. The pointer tracker that drops the host's tap echo is copied from flight, not imported. A `src/games/shared/` module is still a follow-up (ADR-0013), because a game may not import from another game (ADR-0008 section 5), and a shared module would need its own owner and budget.

3. **Games draw with the palette and the three sprite slots, never with text.** Bricks, pipes, code blocks, and lanes are drawn shapes in `palette` colors. Benjo is `sprites.benjo`, enemies are `sprites.hazards`, and collectibles are `sprites.pickups`, picked by index modulo length, so every existing theme pack works unchanged. Words go through `host.setStatus`, so no game needs a canvas font.

4. **Keys come only from the seven actions in `KEY_MAP`.** Whack-a-Bug uses five holes mapped to the four arrows and Space. Fix the Link rotates one way with Space. A game checks the direction actions before `primary`, because ArrowUp raises both.

5. **Every game keeps the top safe area that flight uses** (64 px, 96 px under 600 px wide), copied from the shell CSS as A-13.4 describes. A top inset on `Size` stays a follow-up.

6. **The budgets stay as they are.** The per-game budget is 16,000 bytes gzipped and the page total is 90,000. Each new game has a design target between 4 and 7 KB gzipped, and the seven together must stay under 42 KB, so the page lands near 80 KB. If a build exceeds the total, the largest game is trimmed before the budget moves.

7. **The embed split is left to issue #10.** `dist/embed/` is build output and is not committed. This PR makes the embed script about 107,000 characters, so the Webflow target will need three or more embeds. #10 owns that split and may trim the `games` list for the Webflow build.

8. **The game over card shows at most two switch buttons** plus an "All games" button that returns to the idle screen and its picker. Nine full-width buttons would push Return Home off a 320 px screen.

9. **The idle picker is a horizontal wheel** (`src/shell/wheel.js`). The chosen game sits in the middle with an accent border, its neighbors shrink and fade toward both ends, and the list wraps around. Arrow buttons, a sideways swipe, or the Left and Right keys spin it, and a counter such as `06 / 09` shows where you are. It takes one row at every width, so nine games never push Return Home down. Spinning or tapping a neighbor only selects, as ADR-0014 asks. Pressing the game already in the middle plays it, so Space on the focused wheel starts a run the same way the play prompt does. The arrow buttons never take focus, so Space after clicking one still plays.

10. **Every game has sound, and so does the end of a run.** That is issue #11's own decision, recorded in ADR-0011 (#36). This PR is where it was built.

## Alternatives considered

- **One PR per game.** Cleaner history and smaller reviews, but the owner asked for one PR, and the seven games share no files, so the diff is seven independent folders plus a small integration commit.
- **Add actions to `KEY_MAP`** such as number keys for Whack-a-Bug. It would change the shell and the input tests while seven builders work, and five holes are enough for a 45 second round.
- **Raise the page budget now.** The sum of the targets fits, and a budget that is never close to failing stops meaning anything. Raising it waits for a real need, such as sound (#11).
- **A `<select>` picker on phones.** Most compact, but it does not match the page's look, and the native menu looks different on every phone.
- **Wrapped rows of buttons, or one row that scrolls sideways.** The first version of this PR did this. Nine buttons took three rows on desktop, and on phones the scrolling row hid most games with no hint that more were there.
- **Split the embed in this PR.** It is a build change with its own issue and its own tests, and the standalone `dist/404.html` is unaffected.

## Consequences

- The page ships nine games. The picker lists them in config order, and a visit starts on a random one (ADR-0014).
- The built page is 137,205 bytes raw and 56,265 bytes gzipped, well under the 90,000 total, because the seven games came in at 2.9 to 4.0 KB gzipped each. No budget changed.
- Seven more copies of the pointer tracker and the safe area numbers exist. The follow-ups from ADR-0013 and A-13.4 now have nine callers and are worth doing.
- Fairness tests pin each game's feel: an autopilot or solver must survive or solve across five screen sizes, with and without reduced motion. Tuning changes must keep them green.
- The Webflow embed cannot ship until #10 splits it. Until then the standalone page is the only deploy target.
