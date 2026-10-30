# 0095. Uptime Tower, a tower jumper

- Status: Proposed
- Date: 2026-10-30
- Deciders: eFAILution

## Context

The owner asked for a game like the classic tower jumper, with Benjo dodging bugs (#95). Thirteen games already share the `GameModule` contract (ADR-0008, ADR-0020, ADR-0076, ADR-0088, ADR-0092). The page budget is 110 KB gzipped (ADR-0076), and it was at 102.8 KB before this game.

## Decision

Uptime Tower lives in `src/games/tower/` with the usual split. It needs no shell or contract change. It is the fourteenth entry in `games` and in the save code's `KNOWN_GAMES`. The name follows the site's uptime theme, and it uses no names or art from the original game.

- **An endless tower in tower units.** The tower is 320 units wide with y up, drawn as wide as 80% of the play rect's height at most. Floor n's top is at n x 72. Floors live in a ring of 24 slots, made as the view rises. Each one is narrower than the last, from about 170 units down to 70, and its middle is within 140 of the floor below's middle. Every 25th floor spans the tower and has no bug.
- **Running and jumping.**
  - Benjo accelerates to 300 units/s and keeps his speed in the air, with a little air control.
  - A jump's speed is 640 plus 0.75 of the running speed. A standing jump clears one floor, and a full-speed jump clears two.
  - Hitting a wall turns him round with 85% of his speed.
  - Floors are one way: he jumps up through them and lands on top.
- **The view.** It starts climbing once Benjo reaches floor 5, at 30 units/s. It speeds up by 8 every 15 s, up to 110, or 85 with reduced motion. It also follows him when he's above 60% of the view. Falling below the bottom ends the run.
- **Score.** 10 per new floor and 5 per orb. Jumps of two or more floors in a row, each landing within 3 s of the last, build a combo. A combo of two or more such jumps scores its floors squared.
- **Bugs.**
  - They crawl along floors from floor 8 up, on 15% of floors at first, rising to 45%, and get a little faster with height.
  - Touching one ends the run.
  - A standing jump clears a bug crawling at Benjo. The hitboxes are trimmed so that at the slowest bug speed the jump has a window of about 0.19 s, and jumping toward a bug widens it.
- **Controls.** Left/Right or A/D run, and Space, Up or W jump. On touch, a press jumps at once and Benjo runs toward the finger while it's held. The host's tap echo of that press is dropped.
- **Power-ups.**
  - Digital Twin takes a bug, or throws Benjo back up when he falls off the bottom.
  - Rollback rewinds the end of the run.
  - Garbage Collector clears every bug.
  - Load Balancer slides orbs on nearby floors over to him.
- **Fairness.** `tests/games/tower/fairness.test.js` has a keyboard autopilot.
  - Its heuristic climbs one floor at a time. It lines up under its landing spot when its own floor reaches it, lands where the floor's bug won't be, and never walks through the bug on its own floor. It jumps when a bug comes close or the view is about to catch it.
  - A lookahead of about a second plays each run and jump on a copy of the world, and overrides the heuristic only to survive or to climb a floor higher.
  - On four seeds at four sizes, with and without reduced motion, it climbs to floor 40 alive.
  - A Benjo who never jumps falls behind once the view climbs.

## Alternatives considered

- **Bugs that fall down the tower.** More to dodge, but a falling bug can trap a player on a narrow floor with no way out. Crawlers can always be jumped or waited out.
- **Lives.** The original ends at the first fall, and a single life keeps runs short on a 404 page. The Digital Twin and Rollback give second chances.
- **A purely rule-based autopilot.** Tried first. Each fix exposed another edge case, such as a running jump going two floors up into a bug. The lookahead keeps the heuristic simple and still proves a path exists that a player can see coming.

## Consequences

- The page ships fourteen games. This one is about 4.1 KB gzipped of its 16 KB budget. The page is now 105.2 KB of 110 KB, so about 4.8 KB is left: a fifteenth game needs the budget raised, or a game moved out.
- The fairness test takes about 10 s, because of the lookahead.
- Changing the jump, the run, the floors, the view, or the bugs must keep the autopilot reaching floor 40 (A-95.1).
