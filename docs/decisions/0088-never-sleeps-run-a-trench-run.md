# 0088. Never Sleeps Run, a trench run

- Status: Proposed
- Date: 2026-10-30
- Deciders: eFAILution

## Context

The owner asked for a new game: Benjo flying the USS Never Sleeps on a trench run, and picked the name Never Sleeps Run (#88). Eleven games already share the `GameModule` contract (ADR-0008, ADR-0020, ADR-0076). Every game gets a How to play card (ADR-0028) and power-ups (ADR-0022). The ship's 3D model was said to be at demo.beastcore.com, but the public page there loads only a workspace picker with no model in it, so the real ship isn't available yet.

## Decision

Never Sleeps Run lives in `src/games/neversleeps/` with the usual split, plus `ship.js` for the ship's art. It needs no shell or contract change. It is the twelfth entry in `games` and in the save code's `KNOWN_GAMES`, after Benjo Pinball (ADR-0076).

- **A pseudo-3D trench on the 2D canvas.** The trench's cross-section is 2 by 2 units. A point at depth z is drawn at scale `CAM / (z + CAM)` toward the trench's center, so gates grow as they come in. The trench is at most 1.3 times wider than it is tall on screen, so wide screens don't stretch it. Everything in the world is in trench units, which makes a resize just a new layout.
- **Gates on a 3 x 3 grid.** Each gate blocks some cells, and the open ones form one connected shape. Fewer cells are open as the run goes on: 6 at first, 1 fewer every 12 gates, and at least 2. The trench speeds up from 6 to 10 units per second, or 8 with reduced motion.
- **A hidden lane keeps it fair.** Each gate leaves its lane cell open, and the lane moves at most one cell, corners included, from gate to gate. A ship that follows it always gets through. The rest of the opening grows from the lane. So sitting still dies within seconds, but the gates in view always have a path through.
- **Orbs and ports.** An orb rides in an open cell of 45% of gates and scores 3. Every 8th gate is a port: nothing is blocked, and flying through its lit ring scores 10.
- **Controls.** Arrows or WASD steer at a fixed speed. A drag moves the ship as far as the finger has moved since it went down, so the finger never covers the ship.
- **The ship is a stand-in** (A-88.1). `ship.js` draws a rear view from simple shapes in palette colors, and Benjo sits in its cockpit. Swapping in the real ship changes only that file.
- **No Star Wars names or look-alike art.** It is inspired by a trench run, but the ship, gates and ports are Beast Code's own.
- **Power-ups.** Digital Twin takes a hit and gives a short grace. Rollback rewinds a crash. Garbage Collector clears the blocked panels of every gate ahead. Load Balancer slides nearby orbs onto the ship.
- **Fairness.** `tests/games/neversleeps/fairness.test.js` has an autopilot that plans a path through the gates in view and flies 90 s without a hit, at five sizes, with and without reduced motion, on eight seeds. A ship that never steers hits a gate within 20 s.

## Alternatives considered

- **A real 3D renderer, such as WebGL or a mesh.** It would need a model and a renderer, which costs far more than the 16 KB budget, and the page loads nothing after it opens.
- **Free-form obstacles instead of a grid.** Harder to make provably fair and harder to read at small sizes. The 3 x 3 grid reads at a glance on a 320 x 240 screen.
- **Every gate reachable from every open cell of the last.** Tried first. It forced the middle cell open so often that a ship that never steered lived for 10 to 20 s.

## Consequences

- The page ships twelve games. This one is about 4.8 KB gzipped of its 16 KB budget. With Benjo Pinball, the page is now 98.8 KB of the 110 KB that ADR-0076 set, so about 11 KB is left.
- A save code from before this game still decodes. The Full Stack trophy now asks for one run of this game too.
- When the real ship art arrives, only `ship.js` (and maybe `SHIP_ASPECT`) changes.
