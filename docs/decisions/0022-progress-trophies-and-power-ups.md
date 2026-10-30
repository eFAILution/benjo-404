# 0022. Progress, trophies, and power-ups across the games

- Status: Proposed
- Date: 2026-10-28
- Deciders: eFAILution

## Context

The 404 page has nine mini games (ADR-0020), each with its own best score and nothing that ties them together. Issue #22 asks for a reason to come back: a build version that levels up, a sprint board of small tasks, trophies, a daily nightly build, power-ups in every game, a ghost of your best run to race, and a way to keep progress. The theme is software and digital twins, since the page belongs to Beast Code.

The page has no server and no accounts, holds no personal data (AGENTS.md), and stores only small values in `localStorage` (256 characters each, `src/shell/storage.js`). Nine games already exist, so anything that needs every game to change has to be small per game. The shell has a 24,000 byte gzip budget and was at about 15,000 before this work.

## Decision

1. **Progress is shared by every game and lives in the shell.** `src/shell/progress.js` holds XP, runs, trophies, the chosen look, the nightly streak, and the sprint tickets, in `createStorage('meta')`, split across keys so no value passes 256 characters. Corrupt or missing data starts fresh and never throws. Games know nothing about it.

2. **The host reports what happened in a run as events** (`RunEvent` in `src/shell/host.js`): start, end, drop, power, absorb, rollback, collect. `src/shell/pipeline.js` turns them into XP, trophies, closed tickets, and toast messages. The host sends `end` before it shows the game over card, so the card can show the XP the run earned.

3. **XP becomes a version number.** A run earns 5 XP plus up to 15 for time played, plus 10 for a new best. Tickets earn 20 to 40, trophies 25, and the first nightly of the day 30 plus 10 per streak day (up to 5). Level L costs 40 + 10L XP. The version is `major.minor.patch`, with a major release every five levels and the patch showing progress through the level, so it moves on almost every run. Majors 1 to 4 unlock Benjo looks: Hard Hat, Dark Mode shades, Support headset, and Root Access crown. A look is drawn over Benjo wherever a game draws him, through the shell's `drawSprite` wrapper, so no game changes.

4. **Eighteen trophies, all decided from events and progress.** Hello World, Full Stack, Zero Downtime, Off by One, Hotfix, Works on My Machine, git revert, Garbage Day, Feature Complete, Legacy Code, Velocity, Nightly Build, Three Nines, Ship It, Regression Test, Kernel Panic, Backup Restored, and a secret one, 418 I'm a Teapot (tap the big 404 four times).

5. **The sprint board deals three tickets at a time** (`BENJO-100` and up): play a game a few times, use power-ups, survive a while, reach a score, or beat a best. Score targets come from the player's own best, so a ticket is always within reach. Tickets are dealt from a counter, so a reload shows the same board.

6. **The nightly build is one game per UTC day with a seeded random**, so everyone gets the same run that day. The host's `play({ random, nightly })` swaps the run's random source, and power-up drops use their own random so they never shift the seed. Finishing nightlies on back-to-back days builds the uptime streak.

7. **Power-ups are handed out by the host, and games only add hooks.** The contract (`src/contracts.d.ts`) gains `HostContext.power` (`active(id)`, `absorb()`), `HostContext.track(x, y)`, `GameInstance.collect()`, `snapshot()`, `restore()`, and `GameModule.powers`. All are optional, so older games and test hosts keep working. The host drops a power after about 10 seconds of play and then every 15 to 25 seconds, landing on the next score increase. It takes effect the moment it drops, and a toast names it (#74). The HUD slot only shows the power that is running, with a draining bar, or an armed Rollback. It is not a button, and there is no key to press. No new power drops while a timed one runs.
   - **Cache Hit** (double points) and **Breakpoint** (half speed game time) are run by the host alone and work in every game.
   - **Digital Twin**: the game calls `absorb()` where a hit would end the run. The twin takes it once, and Benjo gets a short grace period. The host draws the twin as a see-through Benjo trailing the player.
   - **Rollback** is armed when it drops and waits on its own. Other powers keep dropping and taking effect while it waits, but a second Rollback never drops while one is armed (#74). If one is armed when the game ends the run, the host restores a snapshot from about three seconds earlier and the run goes on.
   - **Garbage Collector** calls the game's `collect()`, which clears what is on screen and returns a count. The drop lands inside the game's own `setScore`, in the middle of its update, so the host calls `collect()` right after that update instead.
   - **Load Balancer** is a magnet the game polls with `active('magnet')`.
   - A game lists the game-assisted powers it can honestly support, and the host only drops those:

     | Game | Twin | Rollback | Garbage Collector | Load Balancer |
     |---|---|---|---|---|
     | runner, flight, crossing, breakout | yes | yes | yes | yes |
     | tail | yes | yes | no hazards | yes |
     | zapper | yes | yes | yes | no pickups |
     | stack | yes | yes | no hazards | nothing to pull |
     | whack | yes | the round ends on a clock | yes | yes |
     | links | yes | yes | fixes up to 3 tiles | nothing moves |

8. **The ghost race needs no game change beyond `track`.** The host samples the tracked position four times a second, saves it in the game's storage when a run beats the best, and draws it see-through on the next run of that game.

9. **The save code moves progress between devices without a server.** It packs the progress and every game's best into varints with a 16-bit checksum, written in Crockford base32 in 7-character groups so it reads like commit hashes. Restoring merges (higher numbers win, trophy and power masks combine), so a code can never lose progress, and a bad code is rejected without throwing. The uptime streak is the exception: it goes with its nightly day, so the later day's streak wins and an old code can't pass off a stale streak as today's (#48).

10. **The shell budget rises from 24,000 to 28,000 bytes gzipped.** The progress system, menus, power-ups, and ghost bring the shell to about 24,000. The page total stays near 71,000 of its 90,000 budget, and every game stays far under 16,000. The 4,000 bytes of headroom leave room for fixes after real-device testing (#19).

## Alternatives considered

- **Accounts and a server for progress.** Real cross-device sync, but it needs a backend, a login, and personal data on a 404 page. The save code covers moving devices without any of that.
- **Power-ups as pickups inside each game's world.** Feels more natural, but every game would draw, spawn, and collide nine new kinds of objects. Drops into a HUD slot reuse one shell system and keep each game's change to a few hooks.
- **The player fires the held power with the slot or E.** The first version did this, so the player could pick the moment. Play-testing found that mid-run nobody stops to fire it, and a held Rollback filled the slot and blocked every other drop (#74).
- **One progress file per game.** Simpler storage, but the build version, tickets, and trophies span games, and one shared store keeps the save code small.
- **Keep the shell budget at 24,000.** It fits today with 96 bytes to spare, which would block any follow-up fix.

## Consequences

- The shell is now the largest part of the page. Further shell features need to watch the 28,000 budget.
- Progress is per browser. A private window starts from zero, and clearing site data loses it unless the player kept a save code.
- Rollback restores a game's world but not the host's random generator, so the replayed seconds can spawn differently. It stays repeatable for a given seed.
- The nightly build is only identical for everyone on the same build of the page, since a change to a game changes what its seed produces.
- The Webflow embed grows again (#10).
- `host.js` (about 410 lines) and `breakout/world.js` (about 490) are past the 400 line guideline and are candidates for a split.
