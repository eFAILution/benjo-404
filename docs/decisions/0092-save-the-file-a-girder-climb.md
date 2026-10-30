# 0092. Save the File, a girder climb

- Status: Proposed
- Date: 2026-10-30
- Deciders: eFAILution

## Context

The owner asked for a game like the classic arcade girder climb: Benjo climbs up while dodging bugs to save the code file at the top (#92). Twelve games already share the `GameModule` contract (ADR-0008, ADR-0020, ADR-0076, ADR-0088).

## Decision

Save the File lives in `src/games/savefile/` with the usual split, plus `level.js` for the level's layout. It needs no shell or contract change. It is the thirteenth entry in `games` and in the save code's `KNOWN_GAMES`.

- **One fixed level in level units.** The level is 448 by 512 units with y down, scaled to fit the play rect. On a tall screen it may stretch up to 1.4 times taller than wide, and sprites keep their shape. There are six sloped girders, two ladders between each pair, and a short top platform with the code file. Bugs roll downhill: right on the odd girders, left on the even ones. They drop off each girder's open end onto the one below, and end in a bin at the bottom left.
- **Benjo.** He walks, climbs ladders, and jumps. A jump keeps the speed he had when he left the ground and lands on the same girder. Jumping a bug that passes under him scores 10, once per bug per jump.
- **Bugs.** The theme's first hazard sprite stands at the top left and throws one bug about every 2.6 s, give or take 30%. A bug crossing the top of a ladder takes it 25% of the time. It skips the ladder while another bug rolls near the ladder's foot, so bugs never land in a pair too tight to jump one at a time. Each level, bugs roll 10% faster, up to a cap that is lower with reduced motion. Throws come 0.25 s sooner and ladders get 8% likelier, both up to limits.
- **Lives and the clock.** Three lives. A bug, or the 60 s clock running out, costs a life, clears the bugs, and puts Benjo back at the start. Saving the file scores 50 plus a point per second left, then starts the next level.
- **Orbs.** One sits on each girder from the second up, at a random spot, and scores 5.
- **Controls.** Arrows or A/D walk, Up/Down or W/S climb, and Space jumps. Up also raises `primary`, so a jump only counts when Up is not held. On touch, a finger held 0.15 s walks Benjo toward it, a swipe up or down at a ladder climbs all of it, and a tap jumps.
- **Power-ups.** Digital Twin takes a bug and gives 1.5 s of grace. Rollback rewinds a lost last life. Garbage Collector sends every bug to the bin. Load Balancer slides the orb on Benjo's girder over to him.
- **No Nintendo names or look-alike art.** The climber is Benjo, the thrower and its bugs are the theme's hazard sprites, and the prize is a code file.
- **Fairness.** `tests/games/savefile/fairness.test.js` has a keyboard autopilot that plays the way a careful player would:
  - It walks to the nearest ladder up and climbs it.
  - It jumps toward a bug rolling at it.
  - It waits at a ladder's foot while a bug is coming down it, or is about to roll over its top.
  - It backs down a ladder below the top girder when a bug is about to cross.
  - It steps away from the foot of a ladder a bug is coming down.
  
  On eight seeds, with and without reduced motion, it saves level 1 without losing a life and saves three files without a game over. A Benjo who just walks to the first ladder and waits is hit within a minute.

## Alternatives considered

- **Hammers and fireballs from the arcade.** More to draw and tune, and more bytes. Power-ups already cover clearing bugs (Garbage Collector) and taking a hit (Digital Twin).
- **Several level layouts.** The single layout gets faster each level, which keeps the game small and learnable. More layouts can be added in `level.js` later.
- **Jumping in place only.** Tried first: clearing a slow level-1 bug from a standstill left a window of about 0.1 s. The jump was raised, the hitboxes trimmed, and jumping toward a bug, as players do, has a wide window.

## Consequences

- The page ships thirteen games. This one is about 5.3 KB gzipped of its 16 KB budget, and the page is now 102.8 KB of 110 KB, so about 7 KB is left.
- Changing the layout, `BUG_SPEED`, `THROW_T`, `LADDER_CHANCE`, `LADDER_GAP`, or the jump must keep the autopilot passing (A-92.1).
