# 0030. Cache Muncher, a maze chase

- Status: Proposed
- Date: 2026-10-28
- Deciders: eFAILution

## Context

The owner asked for a Pac-Man-style game as another option (#30) and picked the name Cache Muncher. Benjo munches cached bytes in a maze while cache misses chase him. Nine games already share the `GameModule` contract (ADR-0008, ADR-0020), and ADR-0028 gives every game a How to play card. This PR is stacked on #29, so the game ships with a card.

## Decision

Cache Muncher lives in `src/games/muncher/` with the usual split: `tuning.js`, a pure `world.js`, `controls.js`, `draw.js`, `howto.js`, and `index.js`. It needs no shell or contract change. It is the tenth entry in `games`.

- **One fixed maze**, 19 by 21 cells, in `tuning.js` as text. It has no tunnel. Every path cell connects to every other, and none is a dead end, which a test checks. It holds 173 bytes and 4 Clear cache pellets, plus a pen with a one-way door.
- **Grid movement.** Every actor has a cell, a direction, and how far it is to the next cell, so speeds are in cells per second and play the same at any size. Benjo keeps the last turn asked for until that way opens, and he can reverse at once. That makes early presses work, as in the arcade.
- **Four cache misses, four styles**, after the arcade ghosts:
  - The chaser aims at Benjo.
  - The ambusher aims 4 cells ahead of him.
  - The flanker aims at the point that puts Benjo between it and the chaser.
  - The shy one chases from afar and backs off to its corner up close.
  - They scatter to their corners and chase in turns (6 s, 20 s, 6 s, 20 s, 4 s, then chase), and turn around when the mode changes. At each cell they take the open way closest to their target, never straight back.
- **Clear cache.** A pellet scores 50 and turns the cache misses that are out gray, slow, and random for 6 s (1 s less each level, at least 2 s). They flash for the last 1.5 s. Munching them scores 200, 400, 800, then 1600, and sends them back to the pen for 3 s.
- **Fairness.** Nothing moves for 1 s at the start of each life. Three cache misses start in the pen and leave at 3, 8, and 14 s. At level 1 they move at 0.8 of Benjo's speed. The ratio rises 0.03 a level to at most 0.95, and both speeds rise 5% a level, up to a cap that is lower with reduced motion. `tests/games/muncher/fairness.test.js` has a simple autopilot, which heads for the nearest byte on a path clear of the cache misses and flees when there is none. It clears level 1 with a life left on eight seeds at two sizes, with and without reduced motion.
- **Theme art.** Cache misses are the theme's hazard sprites, picked by index. Pellets are its first pickup, and bytes are small ink squares. Catchable cache misses are tinted `palette.muted` (gray) rather than the arcade's blue, because packs have no blue token.

## Alternatives considered

- **A tunnel at the sides.** It is an arcade staple, but wrap-around chasing needs extra target math, and the edge cells draw badly at small sizes. It can be added later.
- **Pathfinding cache misses (BFS to Benjo).** They are harder to escape and less readable. The arcade's greedy target rule gives each one a personality the player can learn.
- **Random mazes.** A fixed maze is learnable, and it is checked once by test for connectivity and dead ends.
- **A larger maze.** On a 320×240 landscape phone, the cells are already about 5 px.

## Consequences

- The page ships ten games. The game costs about 4.7 KB gzipped of its 16 KB budget, and the page is now 65.7 KB of 90 KB.
- The fairness test pins the feel. Changing `MISS_RATIO`, `RELEASE_T`, `MODE_T`, or the maze must keep the autopilot clearing level 1 (A-30.1).
- With three hazard sprites in a pack, two cache misses share one look (A-30.2).
