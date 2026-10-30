# 0094. Bug Belt, a rock shooter

- Status: Proposed
- Date: 2026-10-30
- Deciders: eFAILution

## Context

The owner asked for an asteroids game and picked the name Bug Belt (#94). Thirteen games already share the `GameModule` contract (ADR-0008, ADR-0020, ADR-0076). Every game gets a How to play card (ADR-0028) and power-ups (ADR-0022). Never Sleeps Run (ADR-0088) already has Benjo flying the USS Never Sleeps, so this game reuses that ship.

## Decision

Bug Belt lives in `src/games/bugbelt/` with the usual split, plus `belt.js` for the bugs and the field's wrap-around, and `ship.js` for the ship's art. It needs no shell or contract change. It is the fourteenth entry in `games` and in the save code's `KNOWN_GAMES`, after Save the File (ADR-0092).

- **A wrap-around field.** The field is the canvas below the HUD strip. The ship, the bugs, the shots and the orbs all leave one edge and come back at the other, and every distance is measured the short way around. A bug near an edge is drawn on both sides.
- **The ship turns, thrusts and coasts.** It has drag and a top speed, so it slows down on its own. Shots leave from the nose on the ship's own speed, five at most, and last 0.7 s.
- **Bugs split.** A big bug splits into two medium ones, a medium one into two small ones, and a small one pops. They score 5, 10 and 20. A quarter of the small ones leave an orb worth 10 that floats for 6 s.
- **Waves.** Wave 1 has 4 big bugs and each wave adds one, up to 10. Bugs get 8% faster each wave, up to 1.6 times as fast, or 1.3 with reduced motion. A cleared belt scores 50.
- **Lives.** Three ships. A bump costs a ship and splits the bug for nothing. A lost ship waits at least 1 s, then until the middle is clear of bugs, and comes back there with 2 s of grace.
- **Keys.** Left/Right or A/D turn, Up or W thrusts, Space fires and keeps firing while held. Up and W also raise `primary`, so a `primary` that comes with `up` is thrust, not a shot.
- **Touch** (A-94.1). Holding a finger turns the nose toward it and fires. When the finger is more than 90 px away and the nose points its way, the ship thrusts there. So a finger beside the ship aims, and a finger across the screen flies.
- **The ship is a stand-in** (A-88.1). `ship.js` draws the USS Never Sleeps from above in the same colors as the rear view, and Benjo sits in its cockpit.
- **No Atari names or look-alike art.** The rocks are the theme's hazard sprite, so each holiday restyles them.
- **Power-ups.** Digital Twin takes a bump and gives the same grace as a new ship. Rollback rewinds the loss of the last ship. Garbage Collector pops every bug on screen for its points, without splitting. Load Balancer slides nearby orbs onto the ship.
- **Fairness.** `tests/games/bugbelt/fairness.test.js` checks that every wave's bugs start well away from the ship and head ways that miss a ship that sits still for 3 s, at five sizes, with and without reduced motion, on eight seeds and seven waves. A turret that never moves, aims at the nearest bug and holds fire lasts 60 s at every size, never comes back into a bug, and clears wave 1 on every screen up to 1440 px wide.

## Alternatives considered

- **Hyperspace on Down or Shift.** The classic panic button. It adds a control to learn on a page people find by accident, and a random jump is hard to make fair. Left out.
- **Separate on-screen buttons for turn, thrust and fire.** Close to the arcade, but four buttons crowd a phone and cover the field. One held finger does all three.
- **Bugs that start anywhere.** Simpler, but a wave could open with a bug heading straight at the ship. Each new bug tries up to 40 spots and headings, and keeps the first one that stays clear.

## Consequences

- The page ships fourteen games. With Save the File it is 106.1 KB gzipped of the 110 KB that ADR-0076 set, so about 3.9 KB is left: not enough for another game this size without a budget decision. This game is about 5.7 KB of its own 16 KB budget.
- A save code from before this game still decodes. The Full Stack trophy now asks for one run of this game too.
- When the real ship art arrives, `ship.js` here changes along with Never Sleeps Run's.
