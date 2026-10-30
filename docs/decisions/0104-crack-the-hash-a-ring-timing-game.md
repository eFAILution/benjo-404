# 0104. Crack the Hash, a ring timing game

- Status: Proposed
- Date: 2026-10-30
- Deciders: eFAILution

## Context

The owner asked for a one-tap game (#104). The first preview, a loop runner where every pickup left a wall on the track, did not read well, so the issue was rewritten as a timing game on a ring, like the classic one-tap lock games, with its own twist. Sixteen games already share the `GameModule` contract (ADR-0008, ADR-0020, ADR-0076). Every game gets a How to play card (ADR-0028) and power-ups (ADR-0022). The page budget is 150 KB gzipped (ADR-0101).

## Decision

Crack the Hash lives in `src/games/crackhash/` with the usual split, plus `ring.js` for spots on the ring, where each target and bug goes, and the pops. It needs no shell or contract change. It is the seventeenth entry in `games` and in the save code's `KNOWN_GAMES`, after Tower of Benjo (ADR-0100). It uses no names or art from any real game.

- **A ring in track units.** The run is simulated in track px on every screen: a ring of radius 140, about 880 px around. Only drawing scales it, so that the ring and Benjo standing on it fill the field's short side. The ring is about three quarters of the short side across. A resize changes nothing but the drawing.
- **Benjo stands on the ring.** He is drawn 46 px tall, feet on the ring's outside edge and head pointing out, facing the way he runs. The target (the theme's pickup sprite) and the bug (its hazard sprite) sit just inside the ring, over bands on the ring itself: the hit window in the glow color, a bug's reach in the hazard color. The pins left are big in the middle, with the lock number under them.
- **One tap.** Benjo runs clockwise from the top at 300 px/s. A tap while his middle is within 30 px of the target's pops it for one point. He turns round, and the next target appears 140 to 400 px ahead of him. The first target of a run and of each lock is 300 px ahead. A tap anywhere else, or running more than 30 px past the target, ends the run. Space, Up or W tap; on touch, a tap. The press that started the run does nothing, and the host's tap echo is dropped.
- **Locks.** Lock n needs 5 + 2(n - 1) pops, up to 15. When the last pin pops, the lock opens: the ring flashes for 0.9 s with Benjo standing still, the status line says `LOCK n OPEN`, and the next lock runs 25 px/s faster, up to 450, or 380 with reduced motion. At the top speed the hit window lasts 0.13 s.
- **Bugs.** From lock 2 on, each new target has a 40% chance of a bug. Half the time it sits between Benjo and the target, at least 50 px ahead of him; otherwise just past the target. Running over a bug is harmless; tapping while Benjo's middle is within 15 px of it ends the run.
- **The fairness rule.** A bug's middle is always at least 80 px from the target's: the widest hit window (45 px with Load Balancer), the bug's reach (15 px), and 20 px of free ring. So the whole hit window is always a clear tap.
- **Score.** One point per pop, across all locks, with no bonus for opening a lock (A-104.2). The game over card labels it POPS.
- **Power-ups.** Digital Twin forgives one miss: a tap off the target does nothing, a tap on a bug clears the bug, and a run past the target turns Benjo round to face it. Rollback rewinds a miss. Garbage Collector clears the bug on the ring, and returns 1 or 0. Load Balancer has no pickups to pull here, so it widens the hit window by half while it runs, and the band shows it.
- **Reduced motion.** No shake, no flashing (the ring stays lit through an opened lock's flourish), no growing pops, and the lower speed cap.
- **Status lines.** The hint (`SPACE ON THE TARGET`, or `TAP ON THE TARGET` on touch), NEW BEST, and `LOCK n OPEN`.
- **Fairness tests.** `tests/games/crackhash/fairness.test.js` runs an autopilot that taps at the middle of each target's window through eight locks, at five sizes, with and without reduced motion, on eight seeds. It checks the bug rule on every step. A player who never taps loses within about a second. Every bug placed across 14,400 targets on locks 2 to 10 keeps the rule, and one before the target is at least 50 px ahead of Benjo. Breaking each rule fails these tests: a bug allowed onto the window, a run past the target that never ends the run, a speed cap too fast for the window, and a bug right under Benjo.

## Alternatives considered

- **The loop runner from the first preview.** Grabbing an orb left a block to jump or stomp on later laps. It worked and was fair, but the owner found it hard to read. Replaced.
- **A target anywhere on the ring.** Simpler, but a target right behind Benjo after he turns, or half a ring away, makes the wait random. 140 to 400 px ahead keeps the rhythm.
- **Load Balancer left out.** It pulls pickups toward Benjo in the other games; here nothing moves toward him. Widening the hit window does the same job, making the next point easier, so it stays.
- **A bonus for each opened lock.** It would make the score harder to read. The issue says the score is total pops, so there is none.

## Consequences

- The page ships seventeen games. This one is about 3.4 KB gzipped on its own (3,450 bytes of its 16 KB budget), and the page goes from 115.7 KB to 117.8 KB (117,792 bytes) of the 150 KB that ADR-0101 set.
- A save code from before this game still decodes. The Full Stack trophy now asks for one run of this game too.
- At 320x240 the shell's HUD leaves a short field, so the ring is about 90 px across there. It plays, but small.
- Changing the speed cap, the hit window, or the bug spacing must keep the fairness tests green (A-104.1).
