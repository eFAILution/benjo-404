# Game styles for the 404 page

A catalog of lightweight game styles that fit a 404 page, each starring Benjo the dragon. Every style runs on the same shell contract (ADR-0008): Canvas 2D, a fixed-timestep loop run by the host, keyboard and touch input through one abstraction, and a theme pack that swaps palette, sprites, and particles without touching game code.

Rules every style must respect:

- The 404 message and the Return Home link are always visible and never covered by game UI.
- A run should take 20 to 90 seconds. People came here by accident; the game is a treat, not a commitment.
- One control scheme works on keyboard, mouse, and touch. No multi-touch gestures.
- A high score is the only thing saved, and only in `localStorage`.
- The game must be fun with the default theme. Holiday packs add flavor, not mechanics.

Size: S is under 8 KB gzipped and about a day of work, M is under 16 KB and two to three days, L is under 24 KB and a week or more. These are hackathon estimates.

## 1. Endless runner: Benjo Run

- **Pitch.** Benjo sprints across a dark HUD skyline and leaps over broken links and missing files that scroll in from the right.
- **Core loop.** Speed climbs over time. Jump over obstacles, grab glowing orbs for points, survive as long as possible. Score is distance plus orbs. Death is instant, restart is one tap.
- **Controls.** Keyboard: Space, Up, or W to jump; Down or S to duck. Touch: tap anywhere to jump, swipe down to duck. Mouse: click to jump.
- **Why it fits a 404.** Everyone knows the Chrome dinosaur. Zero instructions, instant restart, "one more run".
- **Size.** S to M.
- **Holiday packs.** Obstacles (pumpkins, candy canes, fireworks), collectibles (candy, hearts, clovers), sky and ground palette, particle trail behind Benjo.

## 2. One-button flapper: Benjo Flight

- **Pitch.** Benjo flies through gaps between towers of 404 bricks, held up by one button.
- **Core loop.** Tap to flap, gravity pulls down, pass gaps to score. Gap size shrinks slowly.
- **Controls.** Keyboard: Space or Up. Touch: tap. Mouse: click.
- **Why it fits a 404.** The smallest fun loop that exists. Good for a very tight byte budget.
- **Size.** S.
- **Holiday packs.** Tower sprites, background gradient, collectible between towers.

## 3. Base defense: Hoard Defense

- **Pitch.** Benjo guards the home page at the bottom of the screen. Lost requests march down from the top; aim and breathe fire to stop them before they reach it.
- **Core loop.** Waves of walkers come down lanes. Point at a lane and fire. Fire has a short cooldown, so timing matters. Three breaches end the run. Score is waves survived and enemies stopped.
- **Controls.** Keyboard: Left and Right pick a lane, Space fires. Touch: tap the lane. Mouse: click the lane.
- **Why it fits a 404.** "Defend the home page" is on theme, and lane-based input works on any screen.
- **Size.** M.
- **Holiday packs.** Enemy sprites (ghosts, snowmen, cupids), projectile sprite and color, lane markers.

## 4. Top-down explore: Lost Pages

- **Pitch.** A small open map. Benjo walks around and finds the scattered pieces of the missing page before the timer runs out.
- **Core loop.** Four to six collectibles hidden in a map that fits on one screen, with a few obstacles and one harmless wanderer. Collect them all to finish; time is the score. Each run shuffles positions.
- **Controls.** Keyboard: arrows or WASD. Touch: an on-screen joystick drawn by the game, or tap to walk to a point. Mouse: click to walk.
- **Why it fits a 404.** It is literally searching for the lost page. Calm, no fail state, good for reduced-motion visitors.
- **Size.** M to L.
- **Holiday packs.** Ground tiles, decorations placed around the map, collectible sprites, ambient particles (snow, leaves, fireflies).

## 5. Asteroids style: Link Rot

- **Pitch.** Benjo spins in space and blasts drifting "dead link" rocks that split into smaller pieces.
- **Core loop.** Rotate, thrust, fire. Rocks split twice. Clear a wave, the next wave has more rocks. One hit ends the run.
- **Controls.** Keyboard: Left and Right rotate, Up thrusts, Space fires. Touch: left half of the screen rotates by drag, right half taps to fire; auto-thrust. Mouse: Benjo faces the pointer, click fires.
- **Why it fits a 404.** The particle globe background already looks like space.
- **Size.** M.
- **Holiday packs.** Rock sprites, bullet color, background particle color, a themed "big rock".

## 6. Snake: Breadcrumbs

- **Pitch.** Benjo eats breadcrumbs and grows a tail of visited pages. Do not bite your own history.
- **Core loop.** Grid movement, eat to grow, speed rises every five items. Collision with wall or tail ends the run.
- **Controls.** Keyboard: arrows or WASD. Touch: swipe in a direction. Mouse: click the side of the grid to turn.
- **Why it fits a 404.** A known loop with a tidy, grid-based look that matches the HUD style.
- **Size.** S.
- **Holiday packs.** Food sprite, tail color, grid line color.

## 7. Breakout: Cache Clear

- **Pitch.** Benjo bats a fireball at a wall of 404 bricks. Clear the wall, clear the cache.
- **Core loop.** Paddle and ball. Bricks need one or two hits. Lose the ball three times and it is over. Score per brick, bonus per cleared wall.
- **Controls.** Keyboard: Left and Right. Touch: drag anywhere to move the paddle. Mouse: paddle follows the pointer.
- **Why it fits a 404.** Smashing the "404" wall is satisfying and the brick layout can spell words.
- **Size.** S to M.
- **Holiday packs.** Brick colors and shapes, ball trail, a bonus brick sprite.

## 8. Rhythm tap: Heartbeat

- **Pitch.** HUD pulses roll toward a line. Tap when they cross it to keep Benjo's server heartbeat alive.
- **Core loop.** Notes travel left to right on two lanes. Hit on time for points and combo; miss three in a row and the line goes flat. No audio needed: the beat is visual.
- **Controls.** Keyboard: F and J, or Space for one-lane mode. Touch: tap left or right half. Mouse: click left or right half.
- **Why it fits a 404.** Silent by design, very small, and the HUD pulse look is already on brand.
- **Size.** S.
- **Holiday packs.** Note sprites, lane colors, the pulse shape.

## 9. Typing: Path Finder

- **Pitch.** Broken URLs fall from the top. Type the path before it lands and Benjo burns it.
- **Core loop.** One word at a time, from a list of fake paths (`/about`, `/docs/api`). Typing the first letter locks the target. Speed rises. Three landings end the run.
- **Controls.** Keyboard only, plus an on-screen keyboard for touch that the game draws. Mouse: click the on-screen keys.
- **Why it fits a 404.** The joke writes itself. Great for developer visitors.
- **Size.** M (the on-screen keyboard is most of it).
- **Holiday packs.** Word lists swap in holiday words, fall particles, Benjo's flame color.

## 10. Hidden object: Where Is The Page

- **Pitch.** A busy HUD scene hides tiny "404" fragments. Find them all before the scan completes.
- **Core loop.** Five fragments hidden among decoy shapes. Click or tap them. A sweeping scan line is the timer. Score is time left.
- **Controls.** Mouse: click. Touch: tap. Keyboard: Tab moves a cursor between candidate spots, Enter picks.
- **Why it fits a 404.** No reflexes needed, good for accessibility, and calm.
- **Size.** S to M.
- **Holiday packs.** The decoy shapes and the scene decorations are the pack.

## 11. Catch and dodge: Cookie Jar

- **Pitch.** Benjo runs left and right along the bottom, catching falling cookies and dodging falling errors.
- **Core loop.** Catch for points, dodge the red ones. Speed rises. Three errors end the run.
- **Controls.** Keyboard: Left and Right. Touch: drag or tap a side. Mouse: follow the pointer.
- **Why it fits a 404.** Simple, readable on small screens, and the catch sprite is the natural holiday slot.
- **Size.** S.
- **Holiday packs.** The falling items are the pack: candy, snowflakes, hearts, eggs.

## Recommended first three

1. **Benjo Run (endless runner).** Build this first. It proves the whole contract end to end: input, resize, pause, high score, theme sprites, particles. It is the most familiar loop and the one most likely to be "addictive" with little code.
2. **Hoard Defense (base defense).** A different input model (pick a lane) and a wave structure. It exercises the theme pack's enemy and projectile slots and gives the page a second mood.
3. **Lost Pages (top-down explore).** The calm option and the one that reads best with reduced motion. It uses the map and decoration slots of a theme pack, which makes holiday packs feel like places rather than skins.

Benjo Flight and Breadcrumbs are the cheapest follow-ups if the budget is tight. Path Finder is the best fit for a developer audience once an on-screen keyboard exists.
