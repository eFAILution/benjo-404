# 0013. Benjo Flight, a one-button flapper

- Status: Proposed
- Date: 2026-10-25
- Deciders: eFAILution

## Context

ADR-0008 set up a shell that any game can plug into, and `docs/game-styles.md` lists candidate styles. Issue #13 asks for the second game: style 2, "One-button flapper". Benjo flies through gaps between towers, held up by one button. It is the smallest fun loop in the catalog and the first game after Benjo Run, so it also tests whether the `GameModule` and `ThemePack` contracts really fit more than one genre.

## Decision

Benjo Flight lives in `src/games/flight/` and implements `GameModule` with no shell or contract changes. The layout copies Benjo Run: `tuning.js` holds every number, `world.js` is a pure fixed-step world with no DOM, `controls.js` turns `InputState` into one flap per step, `draw.js` only reads the world, and `index.js` wires them to the host.

- **One world, mutated in place.** The world keeps its previous Benjo height and scroll, so `render(alpha)` interpolates without the runner's two buffers. Towers, pickups, and pops are pools allocated once, and they sit at world x, so screen x is `x - scroll`.
- **Ready state.** After `start()`, Benjo hovers and nothing scrolls until the first flap. The press that started the run is ignored for 0.12 s, so it never drops Benjo into a tower.
- **The game draws its own towers.** Each tower is a column of bricks in `palette.hazard`. A hazard sprite caps each side of the gap, and pickup sprites float between towers. Theme packs need no tower art, so every existing pack works unchanged.
- **Scale.** Lengths and speeds scale with canvas height (`unit`). Tower spacing is the larger of a fixed distance and one sixth of the width, so a fixed pool of ten towers always covers the screen.
- **Difficulty.** The gap narrows from 170 to 135 px and the speed rises from 170 to 260 px/s (210 with reduced motion) as the score grows. A gap center moves at most 150 px from one tower to the next.
- **Fairness is tested.** `tests/games/flight/fairness.test.js` flies a simple autopilot for 90 s at five screen sizes, with and without reduced motion, across eight seeds. The flap height (about 55 px) was tuned down until the autopilot survived at the narrowest gap.
- **Score.** One point for each tower passed and two for each pickup. The ceiling stops Benjo without ending the run; the ground and the towers end it. The ceiling sits just below the HUD strip, which the game copies from the shell CSS, because the contract has no safe area yet (A-13.4).

## Alternatives considered

- **Ask theme packs for tower sprites.** Better holiday flavor, but every pack would need new art, and a missing sprite would break the game. Packs can still style the towers through `palette.hazard` and their hazard sprites.
- **Share input and backdrop code with Benjo Run** in a `src/games/shared/` module. It removes about 30 lines of near-copy (`readFlap` and the runner's `readIntent` drop the same tap echo). It would also mean editing the runner in this PR and coupling two games' budgets. Left as a follow-up, to do once a third game shows what is really shared.
- **Let the ceiling end the run.** Harsher, and on short landscape phones the ceiling is close. Clamping keeps the challenge in the gaps.
- **Double-buffered worlds as in Benjo Run.** The flight world is small enough that two saved fields cover interpolation.

## Consequences

- The page ships two games. Which one a visitor gets is issue #14; until then the first entry in `games` (Benjo Run) wins, and `?game=flight` picks this one.
- The game costs about 3.4 KB gzipped of its 16 KB budget, which leaves room for sound (#11) and more feedback.
- The fairness test pins the feel. Changing `FLAP_V`, `GRAVITY`, or `GAP_MIN` in `tuning.js` must keep the autopilot alive.
