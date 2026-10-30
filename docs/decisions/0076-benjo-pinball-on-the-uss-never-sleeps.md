# 0076. Benjo Pinball on the USS Never Sleeps

- Status: Proposed
- Date: 2026-10-30
- Deciders: eFAILution

## Context

The owner asked for a pinball game with "all of the features": decks on more than one level, multiball, animation, spinners, lots of sound, and background music, as good as it can be while it still works on the Webflow site (#76). The table is themed on the USS Never Sleeps, the spaceship digital twin in the Beast Core demo, and mixes spaceship, software development, and digital twin ideas. Holiday themes restyle it.

Ten games share the `GameModule` contract (ADR-0008, ADR-0020) and use 4 to 7 KB of their 16 KB gzipped budget each. The tight limits are elsewhere: the shell had 2.6 KB of headroom and the page total 11 KB when this was written. Sound is ten shared synthesized cues and no music (ADR-0011). The Webflow page loads the bundle from GitHub Pages (ADR-0069), so the 50,000 character Code Embed limit no longer caps the bundle.

Seen from above, the ship in the demo already has a pinball table's shape: a wide white hull that narrows to a rounded nose, two swept engine fins along its sides, a glass dome bridge aft, and a round grated hatch near the nose. The twin's system list gives the missions: Air Distribution, Cryogenic Cooling, Electrical Distribution, Electrolyte Hydration, Fuel Service, Hangar Equipment, Hull, O2 Generation, Propulsion, Ship Access, Ship Control, and Virtual, plus Benjo and Easter Eggs.

## Decision

Benjo Pinball lives in `src/games/pinball/`, id `pinball`, and is the eleventh entry in `games`. The shell gains a music player and per-game sounds. Six sub-issues of #76 build it, one PR each, in the order under **Delivery**.

### 1. The table is the ship

Three decks, one per screen. A deck fits the canvas whole, so the flippers are always in view, which matters on a phone. Moving between decks slides the view up or down over about 300 ms (instant with reduced motion), and the ball keeps its speed.

- **Hull deck (main).** The hull outline is the table wall, with the nose at the bottom.
  - Two flippers in the nose, with inlanes and outlanes beside them, and slingshots above.
  - The grated nose hatch is a ring of three pop bumpers. Bugs crawl out of it as the score climbs, and bumper hits squash them.
  - The two engine fins are the left and right loops. A fast loop goes round the top and comes back down the other side.
  - Four top lanes spell S-H-I-P. The flippers rotate the lit lanes, as on a real table.
  - The Deploy lane on the right holds the plunger.
  - The hangar is a saucer (a hole that holds the ball and kicks it out). Two locks start Twin Mode.
  - The center ramp climbs to the bridge deck. Its gate is open unless Twin Mode is running.
  - A drop target bank and two standup targets give the missions something to hit.
- **Bridge deck (the glass dome).** Smaller and faster, with its own two flippers.
  - A loading spinner across the left orbit, three captain's-chair bumpers, and the Easter Eggs target at the top.
  - A ball that drains here drops down a return chute to the hull's left inlane. It does not cost a ball.
- **Benjo's Quarters (hidden).** The Easter Eggs target opens the way here after three system repairs.
  - A 30 second bonus round with its own flippers and five targets that spell B-E-N-J-O. Each one scores, and the full word pays a large bonus.
  - It ends on a drain or when time runs out, and the ball returns to the bridge.

Deck layouts are plain data (walls, arcs, bumpers, targets, lanes, and gates) in a fixed table space of 400 by 600 units, scaled to fit. A wide desktop canvas has room to spare, so the twin health board (below) is drawn beside the table there. On a narrow screen it shrinks to a strip above the table.

### 2. Rules

- **3 balls.** Ball save for 10 s after each launch. A drain inside that time relaunches the ball.
- **Skill shot (clean deploy).** One S-H-I-P lane blinks at launch. Plunger strength sets where the ball lands, and landing in the blinking lane scores 50,000.
- **System repairs, the twin health board.** Each game shuffles the 12 systems with `host.random`. One system at a time goes offline (red on the board), and its shot lights:

  | System | Shot to repair |
  |---|---|
  | Propulsion | both engine fin loops |
  | O2 Generation | the drop target bank |
  | Cryogenic Cooling | 15 pop bumper hits |
  | Electrical Distribution | 40 spinner ticks (bridge) |
  | Hangar Equipment | the hangar saucer |
  | Ship Access | the center ramp |
  | Hull | 5 slingshot hits |
  | Fuel Service | the left engine fin loop, 3 times |
  | Air Distribution | the S-H-I-P lanes, all four |
  | Ship Control | both standup targets |
  | Electrolyte Hydration | the inlanes, left then right |
  | Virtual | the captain's chair bumpers, 10 hits (bridge) |

  The nth repair scores n times 25,000. All 12 back online is "Fully Operational": 1,000,000 and a fresh board. Repairing Hull lights one outlane ball save.
- **Twin Mode (multiball).** The two hangar locks start a 3-ball Twin Mode, with the new balls kicked out from the hangar. The ramp gate closes, the ramp lights a jackpot (100,000, rising 50,000 each time), and the music changes. It ends when one ball is left.
- **Bonus multiplier.** Each completed S-H-I-P raises it by one, up to 5x. End of ball bonus is (repairs times 5,000 plus bugs squashed times 500) times the multiplier.
- **Combos.** A ramp or loop within 3 s of the last one doubles, then triples, its points.
- **Extra ball** once a game, at 500,000.
- **Nudge and tilt.** A nudge pushes every ball a little. Three nudges inside 4 s show a TILT warning, and one more tilts: the flippers go dead, the ball is lost, and that ball scores no bonus.
- **Power-ups (ADR-0022).** `powers` lists twin, rollback, and collect.
  - Digital Twin: when the last ball drains, the game calls `absorb()`. True means a twin ball launches from the Deploy lane and the ball is not lost.
  - Rollback: `snapshot()` and `restore()` save and load the whole table.
  - Garbage Collector: `collect()` squashes every bug on screen and returns how many.
  - Cache Hit and Breakpoint are run by the host and work as in every game. Breakpoint's half-speed time suits pinball well.
  - Load Balancer is not listed, since the table has no pickups.
- **Game over** ends the run with `scoreLabel: 'SCORE'`, and a reason such as "All three hulls breached."

### 3. Controls

| | Keys | Touch |
|---|---|---|
| Left flipper | Left arrow or Z | Hold the left half |
| Right flipper | Right arrow or / | Hold the right half |
| Plunger | Hold Space or Down to pull, release to fire | Hold anywhere before launch, release to fire |
| Nudge | Up arrow | Two-finger tap |

Flippers on each deck move together, so a player never has to know which deck has which flipper. The How to play card (ADR-0028) lists these controls and the board pieces.

### 4. Physics

- Fixed step from the host (1/60 s), split into 8 substeps. The ball's top speed is capped so it moves less than its radius in one substep, and so it never passes through a wall or a flipper.
- The ball is a circle (radius 8 units). Walls are line segments and arcs. Every collision pushes the ball out along the contact normal and reflects its velocity, with restitution and friction set per surface in `tuning.js`.
- Pop bumpers and slingshots add a fixed kick along the normal on top of the bounce.
- Flippers are capsules (rounded bars) that swing about a pivot at a set angular speed. The contact point's velocity is added to the bounce, so the tip hits harder than the base, and a held flipper can cradle the ball.
- The table tilts gravity toward the flippers. Tuning values (gravity, kicks, restitution, flipper speed) live in `tuning.js`, alongside every score value above.

### 5. Look and feel

- The hull is drawn in the theme palette as a light hull on a dark starfield, with panel lines and the nose hatch grating. On the default theme it reads as the white ship in the demo. Holiday packs recolor it through the palette and swap bumper and bug art through their sprites (pumpkins at Halloween, ornaments at Christmas).
- Static deck art is drawn once into an offscreen canvas on resize, and only the moving parts are drawn each frame.
- Lights blink, chase, and flash on events. Score popups, bumper flashes, sparks from the theme's particles, and a short screen shake on big hits. Reduced motion drops the shake, the flashing, and the chasing lights, and keeps everything else.
- A drain shows "ROLLBACK", the hangar lock "LOCKED", and so on, through `host.setStatus`.

### 6. Sound and music (shell change)

ADR-0011 keeps ten shared cues and rejects per-game sound sets to save bytes. This decision adds two optional hooks and leaves the ten cues as they are.

- **Per-game cues.** `GameModule.cues?: Record<string, Tone[]>` adds a game's own named cues, and `host.audio.play` accepts those names. A theme's `cues` can restyle game cues by the same names. Pinball brings about 15: flipper, bumper, sling, spin, ramp, lane, target, repair, lock, twin, jackpot, extra, tilt, drain, and launch.
- **Voice limit.** At most 6 tones sound at once, and a cue replayed within 40 ms is skipped, so fast bumper chains stay clear.
- **Music.** New `src/shell/music.js`. `host.music?.play(track)` and `host.music?.stop()` play a looping track. A track is note data: a tempo and a few channels, each a wave, a gain, and a short string of notes. Notes are scheduled a fraction of a second ahead on the AudioContext clock from the host's frame loop, so the player needs no timer of its own.
  - Music plays only during a run. It stops on pause, game over, teardown, and when the tab is hidden, and it starts only after the player's first input, as all sound does.
  - It plays at half the master volume. The speaker button and M mute it with everything else.
  - Pinball ships three tracks: hull (steady), bridge (faster), and Twin Mode (adds a drum line). Other games can use the player later. None get music in this change.

### 7. Budgets

- Pinball stays within the 16 KB gzipped game budget.
- The shell budget goes from 28,000 to 30,000 gzip bytes, for the music player and per-game cues (about 2 KB).
- The total budget goes from 90,000 to 110,000 gzip bytes, for pinball and the shell growth, with headroom for one more game.

### 8. Delivery

Each item is a sub-issue of #76 with its own branch and PR. Each PR leaves the game playable and within budget.

1. Shell: per-game cues, the voice limit, `music.js`, the contract hooks, and the budget changes.
2. First playable: physics, flippers, plunger, the hull deck, 3 balls, ball save, and the How to play card.
3. Rules: system repairs and the health board, S-H-I-P lanes, the skill shot, combos, bonus, extra ball, and tilt.
4. The bridge deck and Benjo's Quarters, with deck transitions.
5. Twin Mode and the power-up hooks.
6. Polish: the three music tracks, every sound, the ship art, effects, and holiday restyling.

### 9. Tests

All tests use `node --test` under `tests/games/pinball/` and `tests/shell/`, like the other games.

- **Physics.** A ball fired at top speed at every wall and flipper of every deck never ends up outside the table. Flipper tip hits are faster than base hits. A cradled ball stays put.
- **Deck data.** Every deck's outer wall is closed, no two pieces overlap, and every lane and gate leads somewhere.
- **Rules.** Scoring, repair order from a seeded random, ball save timing, extra ball, the tilt count, Twin Mode start and end, and deck return paths.
- **Autopilot.** A simple bot that flips when the ball nears a flipper survives 60 s on several seeds, so the table is fair.
- **Shell.** Game cues play, theme overrides apply to them, the voice limit holds, and music stops on pause, end, hide, and mute.
- **Existing suites.** The How to play test, the power-up tests, and the budget checks in `make test` cover pinball like any game.
- **By hand.** Play `?game=pinball` on desktop and on a phone before each PR merges.

## Alternatives considered

- **One scrolling tall table.** Feels like classic computer pinball, but the flippers leave the screen when the ball is high, which plays badly on a phone.
- **All decks shrunk onto one screen.** Simple, but too small to play on a phone.
- **Stage after stage (new layout per level).** Clear progress, but less like a real machine. The decks and the repair board give the same sense of progress.
- **Fit the old limits: 16 KB, ten shared cues, no music.** Safe, but it cannot deliver the music and sound the owner asked for.
- **Audio files for music.** Richer sound, but inlined files cost far more bytes than note data, and the CSP would need `media-src` (ADR-0011).
- **A physics library.** Mature, but too big for the budget and a new third-party dependency in the bundle.

## Consequences

- The page grows by about 15 to 18 KB gzipped. It is still a small page.
- Any game can now bring its own cues, and any game can add music later for the cost of its note data.
- The `GameModule` and `HostContext` contracts gain optional fields. Older games and test hosts keep working unchanged.
- The ship and system names come from the public Beast Core demo (A-76.1).
- The Webflow page keeps working through the GitHub Pages bundle (ADR-0069). A bigger bundle only changes the SRI hashes, as every release does.
