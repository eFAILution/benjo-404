# 0106. Memory Leak, a falling-block heap puzzle

- Status: Proposed
- Date: 2026-10-30
- Deciders: eFAILution

## Context

The owner asked for a falling-block puzzle about a leaky heap (#106). Sixteen games already share the `GameModule` contract, the last being Tower of Benjo (ADR-0100). Every game gets a How to play card (ADR-0028) and power-ups (ADR-0022). Stack the Server is the closest game already here, but its blocks slide and get cut; here they fall into a grid and stay until they free themselves.

## Decision

Memory Leak lives in `src/games/memleak/` with the usual split, plus `heap.js` for the grid and what happens to the blocks in it. It needs no shell or contract change. It is the seventeenth entry in `games` and in the save code's `KNOWN_GAMES`, after Tower of Benjo.

- **A fixed grid.** The heap is 10 columns by 12 rows at every size, with 3 rows of open lane above it. The cell size follows the canvas, so every screen plays the same heap; at 320x240 a cell is 8 px. The compact meter stands beside the heap.
- **Blocks.** A block is 1 to 4 cells wide and one tall, picked at random. One falls at a time. It appears in the middle of the lane and falls at the current fall speed. It lands on the highest used cell under any of its columns, so it never slides under an overhang. In the lane it slides freely; inside the heap, a column taller than its bottom blocks it.
- **Lifetimes.** A placed block lives 8 s at first, growing to 18 s, give or take 30%. A bar inside it runs down and turns the pickup color for its last quarter. When it runs out the block frees itself for +1, +3, +6 or +10 by width and leaves a hole. Blocks above a hole do not fall.
- **Compact.** Every block falls straight down as one piece until it rests on the floor or on a block under any of its cells. Blocks settle from the bottom up, so each rests on blocks that already settled. It needs a full meter: every freed cell charges it by one, and 16 fill it. With reduced motion the blocks jump instead of sliding.
- **Full rows.** A full row, from a landing or a compact, frees every block in it for their points and +20. Rows above it do not drop, as with any other free.
- **Overflow.** A block that would land above the top row overflows the heap and ends the run. In practice that is a block left over a full column when it leaves the lane.
- **Fairness.** Every new block fits somewhere when it appears: if its planned width lands nowhere inside the heap, it shrinks to the widest width that does. Only when not even a 1-wide block fits is the run over at once. Because a full top row always flushes, that last case cannot happen in play, so the run really ends when a player does not move a block off a full column in time. The fall speed cap keeps the lane long enough for a held arrow to carry any block from the middle to either wall.
- **Pace.** The fall speed rises from 1 to 2.4 rows/s (1.8 with reduced motion), the wait after a landing shrinks from 0.7 to 0.3 s, and lifetimes grow from 8 to 18 s. All three reach their caps within about two and a half minutes.
- **Keys.** Left/Right or A/D move the block once, then repeat while held. Down or S drops it at once (a hard drop). Space, Enter, Up or W compact; Up and W also raise `primary`, and compact reads only `primary`, so one press is one compact.
- **Touch** (A-106.2). A press acts when it ends, because a drag and a swipe start with a press too. A finger that slides more than 12 px drags the block a column for every cell it moves. A press that lifts without dragging drops the block. A swipe up compacts, a swipe down drops. The press that started the run, and the host's tap echo of a press, do nothing.
- **The look.** Placed blocks are the theme's hazard color with the theme's hazard sprite cut out of them in the background color, holes are faint cells, the falling block is the pickup color with a guide down to where it lands, and the top of the heap is a dashed accent line. The guide turns the accent color over a full column. Under reduced motion nothing shakes or blinks.
- **No real-world game names or look-alike art.** The blocks are flat bars in theme colors.
- **Power-ups.** Digital Twin takes one overflow: it clears the top 4 rows, for no points, and the block lands below. Rollback rewinds an overflow. Garbage Collector frees every block in the heap now for its points, and charges the meter. Nothing is a pickup, so there is no Load Balancer, and with no avatar the game never calls `host.track`.
- **Fairness tests.** `tests/games/memleak/fairness.test.js` checks that a player on the keys who drops each block where it lands lowest, and compacts when the meter is full, lasts 210 s at five sizes, with and without reduced motion, on eight seeds. A careless player that drops blocks in random columns, kept alive by a twin that never runs out, never sees a block appear that fits nowhere or get refused while a narrower one fits. A third test checks that a block can reach either wall before it leaves the lane at the fastest pace.

## Alternatives considered

- **Spawning the block where it fits.** Then a player who never touches anything could never lose. The block appears in the middle, and fairness only promises a spot exists.
- **Rows above a flushed row drop down.** The classic rule, but it contradicts the issue's holes, and compact already does that job.
- **A soft drop on a held Down.** More to learn and harder to make fair against the lane timing. One press drops at once, and the fall speed carries the pressure.
- **More rows on tall screens.** The heap would play differently on each screen. A fixed grid scaled to fit keeps runs comparable.

## Consequences

- The page ships seventeen games. This one is about 4.8 KB gzipped of its own 16 KB budget, and the page is now 116.1 KB of the 150 KB that ADR-0101 set.
- A save code from before this game still decodes. The Full Stack trophy now asks for one run of this game too.
- Changing the grid, the lane, the fall cap or the key repeat must keep the lane test and the autopilot passing (A-106.1).
