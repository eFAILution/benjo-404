# 0008. Self-contained 404 shell with swappable games and holiday themes

- Status: Proposed
- Date: 2026-10-24
- Deciders: eFAILution

## Context

The live page at `beast-code.com/404` is a Webflow page: a centered message ("Page Not Found", "404", one sentence, a red "Return Home" button) over a looping video of a particle globe. It loads Webflow's runtime, jQuery, Google Fonts, Intellimize, and Google Tag Manager.

The replacement must keep the same message, button, fonts (Inter and Geist Mono), brand red `#d72228`, and dark HUD look, and add a small game starring Benjo, the dragon from the circle logo. Issue #3 asks for it to be browser agnostic, secure, performant, fun, and themed by the closest American holiday through swappable packs. The owner wants the message and the game to be swappable by configuration, a repo layout that can hold several game styles, and holiday packs any game can use.

Hard constraints: no third-party scripts, no CDN, no tracking, no network calls after load, strict Content Security Policy (CSP), no `eval` or `innerHTML` with dynamic data, `localStorage` only for small things like a high score, 60 fps on a mid-range phone, usable with JavaScript off, keyboard and touch, `prefers-reduced-motion`, no focus trap, and `make test` plus `make lint` as the gates (there is no CI, ADR-0006). Tooling should be pnpm with `minimum-release-age=1440`, exact pins, and zero runtime dependencies.

## Decision

### 1. Delivery: one built `404.html` with hashed inline script and style

The build produces `dist/404.html`: a single HTML file with the message in static markup, one inline `<style>`, one inline `<script type="module">`, and the subset fonts inlined as `data:` URLs. The build also writes `dist/csp.txt` with the exact header to serve:

```text
default-src 'none'; script-src 'sha256-<script hash>'; style-src 'sha256-<style hash>'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

Reasons. A 404 page is served for any unknown path, so relative asset URLs would break on nested paths and every extra request is a second chance to fail. One file has no path problem, needs no `'self'` origin, and the hashes make the CSP as strict as it gets. Nothing is fetched after load because there is nothing left to fetch.

The same build also writes `dist/embed/`: the body snippet, `benjo-404.js`, `benjo-404.css`, and the fonts as separate files, with a `csp.txt` that uses `script-src 'self'; style-src 'self'; font-src 'self'`. This is the fallback for a host that cannot serve the single file or that limits inline code size.

How it reaches Webflow is not settled. Webflow serves its own 404 page and limits page-level custom code to a few thousand characters, which a game will exceed. The likely options are a proxy or edge worker in front of the site that serves `dist/404.html` for 404 responses, or Webflow hosting the JS and CSS as assets with the body snippet in the 404 page. This is recorded as assumption A-8.1 and is a question for the owner.

### 2. Language and build: plain ES modules, JSDoc types, three dev dependencies

Source is plain JavaScript (ES2020 modules) with JSDoc type comments, checked by `tsc --noEmit` against one hand-written `src/contracts.d.ts`. There is no transpile step. `esbuild` bundles and minifies into the single file. `@biomejs/biome` lints and formats. Tests run on Node's built-in `node --test`, with no DOM library: game and holiday logic is written as pure functions that take state and return state, so it is tested without a browser.

Dev dependencies, pinned exactly: `esbuild 0.28.2`, `@biomejs/biome 2.6.2`, `typescript 7.0.2`. Runtime dependencies: none. `.npmrc` sets `minimum-release-age=1440`.

Reasons. TypeScript source would need a compile step and makes the shipped bytes no smaller. JSDoc plus a shared `.d.ts` gives parallel implementers a checked contract without that step. esbuild is one binary and the fastest option for a single bundle. Biome replaces ESLint plus Prettier with one binary. Node's test runner avoids Jest or Vitest and their dependency trees.

### 3. Module contracts: shell owns the loop, modules are data plus pure functions

Three module kinds, each a plain object exported from its own folder:

- **Message module**: the text of the 404 (kicker, code, body, button label and href). It is data. The build writes the chosen message into the static HTML, so the page reads correctly with JavaScript off.
- **Theme pack**: palette, sprite data (SVG path strings drawn through `Path2D`), particle settings, and the holiday it belongs to. It is data. It never contains behavior.
- **Game module**: `create(host)` returns an instance with `start`, `update(dt)`, `render(alpha)`, `pause`, `resume`, `destroy`. The host runs a fixed-timestep loop, owns the canvas, input, resize, visibility, storage, and the HUD. The game only draws and updates.

The host wraps every game call in `try`/`catch`. A throwing game is destroyed and the page returns to the idle state with a small "try again" control. The message and the Return Home link live outside the game's DOM subtree and are never changed by the game. The exact signatures are in the implementation plan and in `src/contracts.d.ts`.

Selection is configuration. `benjo.config.json` names the message, the games to bundle, and a theme pin (or `auto`). At runtime `?game=`, `?theme=`, `?date=`, and `?message=` override for testing, validated against the bundled registry and never written to the DOM except as text.

### 4. Holiday theming: computed from the local date, closest holiday wins

`src/holidays/calendar.js` lists US federal holidays plus Valentine's Day, St. Patrick's Day, Easter (computed), Halloween, and New Year's Eve, each with a rule (fixed date, nth weekday, or Easter) and a window of days before and after. The resolver takes the visitor's local date, keeps only holidays that have a theme pack in the bundle, keeps those whose window contains today, and picks the one with the smallest distance. Upcoming beats just-passed on a tie. No match gives the `default` theme, which is the brand look: red particles on near-black. Holidays without a pack are listed in the calendar but never selected.

### 5. Repo layout

```text
src/shell/       the page, host, input, HUD, storage, build-time template
src/messages/    message modules
src/themes/      one folder per theme pack (default, halloween, ...)
src/games/       one folder per game (runner, ...)
src/holidays/    calendar and resolver
src/assets/      Benjo sprite data
assets/fonts/    subset WOFF2 files and licenses
build/           build, inline, and check scripts
tests/           mirrors src
```

Each game and theme is one folder with no imports from other games or themes. Shared code lives only in `src/shell/`. That is what lets work packages be built in parallel with disjoint file ownership.

### 6. Fonts: self-host subset WOFF2

Inter and Geist Mono are both under the SIL Open Font License. The build ships subsets (Latin letters, digits, basic punctuation; Inter at weight 400 and Geist Mono at 400) as inline `data:` fonts, with system fallbacks that keep the layout stable. Budget for both subsets together: 28 KB gzipped. Because OFL fonts with a Reserved Font Name must not be redistributed under that name once modified, the subsets are declared under the internal family names `B404 Sans` and `B404 Mono`. Recorded as assumption A-8.2.

## Alternatives considered

- **Folder of static files with `script-src 'self'`.** Simpler to read, but a 404 is served on any path, so asset URLs must be absolute and every request is a point of failure. Kept as the `dist/embed/` fallback only.
- **Paste the game into Webflow's custom code box.** Needs no proxy, but Webflow's custom code size limits are far below a game. Not viable on its own; see A-8.1.
- **TypeScript source.** Better editor support, but it adds a compile step and the shipped size is identical. JSDoc with `checkJs` gives the contract checking without it.
- **A bundler-free build (string concatenation).** Zero dev dependencies, but no tree shaking, no minification, and hand-written module ordering. esbuild earns its place.
- **Vitest or Jest with jsdom.** Convenient for DOM tests, but heavy dependency trees. Pure-function game logic plus a small built-file check covers what matters.
- **Google Fonts or `@import`.** Forbidden: network calls after load and CSP.
- **System fonts only.** Smallest, but the 404 display and mono kicker are the brand look of the live page, and a 28 KB budget is affordable.
- **Games as WebGL or an engine.** More power, but engines are runtime dependencies and WebGL fails on some locked-down devices. Canvas 2D is universal and enough for the catalog in `docs/game-styles.md`.
- **Holiday picked by server or by IP.** Needs a backend or network. Local date is private and offline.

## Consequences

- The page is one file with a fixed CSP header. Changing any byte of script or style changes the hash, so the header is a build output and must be deployed with the file.
- Three dev dependencies, pinned, behind a 24 hour release age. Zero runtime dependencies.
- Adding a game or theme is a new folder plus one line in `benjo.config.json`. The shell does not change.
- Game logic must be pure enough to test on Node. That is a constraint on how games are written, and the first game sets the pattern.
- Byte budgets are enforced by `make test` (`build/check.js`), so a game that grows past its budget fails the push hook.
- How the file is served on Webflow is an open question (A-8.1). Until it is answered, the deliverable is `dist/404.html` plus `dist/csp.txt`, which any static host or edge proxy can serve.
- Fonts are a legal and size trade. If the owner prefers, the font files can be dropped and the fallback stack takes over with no code change.
