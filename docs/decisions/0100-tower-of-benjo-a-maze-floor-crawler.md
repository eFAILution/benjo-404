# 0100. Tower of Benjo, a maze floor crawler

- Status: Proposed
- Date: 2026-10-30
- Deciders: eFAILution

## Context

The owner asked for a game like the classic maze-floor tower crawler, with Benjo as the hero (#100). Fifteen games already share the `GameModule` contract, the last being Bug Belt (ADR-0094). ADR-0101 raised the page budget to 150 KB gzipped while this was in review.

## Decision

Tower of Benjo lives in `src/games/benjotower/` with the usual split, plus `maze.js` for the floors. It needs no shell or contract change. It is the sixteenth entry in `games` and in the save code's `KNOWN_GAMES`, after Bug Belt. It uses no names, characters, or art from the original game.

- **Each floor is an 11 x 9 maze.** It is carved as a perfect maze by a random depth-first walk, and then 14 walls are knocked out so there are ways round. The key sits at least 60% of the way to the farthest cell from the start. The door goes at the cell farthest from both the start and the key.
- **Grid movement.** Benjo and the walking enemies move from cell middle to cell middle, at cells per second, and turn only at middles. They can turn straight back at once.
  - A held arrow or WASD walks Benjo, and the newest key held wins. Letting go stops him at the next middle.
  - On touch, a held finger walks him toward it along whichever axis it is farther off, and lifting it stops him. The finger that started the run doesn't count until it lifts.
- **The sword and the shield.**
  - Benjo always holds his sword the way he faces, walking or standing. Any enemy that meets him within 60° of that way is hit. One that touches his side or back costs a life.
  - Standing still, he raises his shield, which stops spell bolts from any side. A bolt that reaches him while he walks costs a life.
  - Facing changes with the last way asked, even into a wall, so a player can stop and face a corridor.
  - The first version only let the sword hit while Benjo walked. Enemies coming in from a side corridor at a junction then always cost a life, so the sword now counts standing too.
- **Enemies.**
  - **Slimes** wander at random.
  - **Knights** take the way that brings them closest to Benjo along the maze. They take two hits, and the first stuns them and knocks them back.
  - **Mages** hide, then appear 2 to 6 cells from Benjo in a straight open line. They cast a bolt down it, linger, and hide again.
  - A floor has 2 slimes plus one more every 2 floors, up to 6. It has a knight every 3 floors, up to 3, and from floor 4 one mage, up to 2.
  - Enemies are 5% faster each floor, up to 1.5 times as fast.
- **Lives and the clock.** Three lives and 60 s per floor. An enemy, a bolt, or the clock costs a life and starts the floor again with the same maze. Slimes score 5, mages 10, knights 15, and the key 10. The door scores 50 plus a point per second left, then a new maze.
- **Power-ups.** Digital Twin takes a hit and gives 1.5 s of grace. Rollback rewinds the end of the run. Garbage Collector clears every enemy and bolt on the floor, scoring the enemies. Nothing on a floor is a pickup, so there's no Load Balancer.
- **Fairness.** `tests/games/benjotower/fairness.test.js` has a keyboard autopilot.
  - Its heuristic walks the shortest way to the key and then the door. It turns to face any enemy within 1.6 cells, and stops to block a bolt coming straight at it.
  - A one-second lookahead tries each way, and standing still, on a copy of the world. It overrides the heuristic only to keep a life or to end far better off.
  - On four seeds, with and without reduced motion, it clears three floors without a game over.
  - A Benjo who stands still loses every life.

## Alternatives considered

- **A sword drawn only with a button, as in the original.** It is truer to it, but two buttons on touch are hard. A sword that always points the way Benjo faces keeps the duel of facing an enemy with one control.
- **Fixed hand-made floors.** They are learnable, but each takes bytes, and a fresh maze per floor gives endless floors for a few hundred bytes of code.

## Consequences

- The page ships sixteen games. This one is about 5.5 KB gzipped on its own, and with Bug Belt the page is now 113.4 KB of the 150 KB that ADR-0101 set.
- The fairness test takes about 10 s, because of the lookahead.
- Changing the maze size, speeds, the roster, or the sword's angle must keep the autopilot clearing three floors (A-100.1).
