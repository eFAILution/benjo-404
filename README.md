# benjo-404

Hackathon submission for team "404: Team Not Found".

## The goal

A "page not found" error usually ends a visit. We want ours to be the page people come back to on purpose.

benjo-404 will be an interactive 404 page for our users, starring Benjo, the dragon from our circle logo. When a link breaks, visitors still get a clear "page not found" message and a link home, plus a quick game to play and new surprises to find.

What we're aiming for:

- **Changes with the seasons.** The page picks a theme from the visitor's date, such as a holiday or the time of year, and changes the scenery, obstacles, and collectibles to match. Each theme is a drop-in pack, so adding one doesn't touch the game logic.
- **Lots of fun.** Easy to start and hard to put down. One more run.
- **Worth coming back to.** New themes, hidden extras, and a local high score to beat give people a reason to visit again and see what's new.
- **Still a good 404 page.** The game never hides or delays the error message or the way home. It works in modern browsers on desktop and mobile, with keyboard and touch controls.
- **Safe and light.** Self-contained: no third-party scripts, no tracking, and no network calls after the page loads. It runs under a strict Content Security Policy and only uses `localStorage` for things like a high score.

The design is being worked out in [issue #3](https://github.com/eFAILution/benjo-404/issues/3).

## Run it

You need Node 22 or newer and pnpm 11.

```sh
pnpm install --frozen-lockfile
make build         # writes dist/404.html, dist/csp.txt, dist/embed/
make test          # unit tests, then build and check dist/ (budgets, CSP hashes, no external URLs)
```

Open `dist/404.html` in a browser. `node build/check.js --print` shows each part's size against its budget in `budgets.json`.

Query overrides, for testing only. Bad values are ignored.

| Query | Effect |
|-------|--------|
| `?game=runner` | Pick a bundled game. `?game=none` shows the page with no game. |
| `?theme=halloween` | Pick a bundled theme. `?theme=none` forces the default look. |
| `?date=2026-10-24` | Pretend today is this date (`YYYY-MM-DD`), to preview a holiday. |
| `?message=short` | Pick a bundled message. |
| `?rm=1` | Act as if the OS asks for reduced motion. |
| `?debug=1` | Show a line with the game, theme, date, and frame rate. |

### Add a game, a theme, or a message

1. Make a folder or file: `src/games/<id>/index.js` exports a game module, `src/themes/<id>/index.js` exports a theme pack, and `src/messages/<id>.js` exports a message. The shapes are in `src/contracts.d.ts`. There is no registry to edit; the build finds them by name.
2. Add the id to `games` or `themes` in `benjo.config.json`, or set `message` to it. Every message is bundled, so `?message=<id>` works without a config change. A theme's `holiday` field names a holiday in `src/holidays/calendar.js`; a new holiday also needs an entry there.
3. Add tests under `tests/games/<id>/` or let `tests/themes/packs.test.js` pick up the pack.
4. Run `make test`. It fails if the game is over 16 KB or the theme over 4 KB gzipped.

### Known limitations

- How the page reaches the live Webflow site is not settled (A-8.1). See [`docs/runbooks/deploy-404.md`](docs/runbooks/deploy-404.md).
- The CSP header holds hashes of the inline script and style. Any rebuild that changes them needs the new `dist/csp.txt` deployed with the file.
- The game needs Safari 14 or Chrome 90 and up. Older browsers still get the plain message and the Return Home link.
- Holidays follow the visitor's own clock and a US calendar (A-8.3). There is no sound (A-8.4).
- The best score lives in the browser's `localStorage`, so a private window or another device starts from zero.

## How we work

Every change starts with a GitHub issue, goes on a branch named after it, and reaches `main` through a reviewed pull request merged with a merge commit. The full rules are in [`.ai/`](.ai/README.md), which humans and coding agents read the same way.

| Step | Rule |
|------|------|
| Issue | Open or find one issue per PR. Split big work into sub-issues. |
| Branch | `<prefix>/<issue>-<short-description>`, for example `feat/12-score-board`. Prefixes: `feat/`, `fix/`, `infra/`, `docs/`, `chore/`, `spike/`, or an agent's own (`claude/`, `codex/`, `copilot/`). |
| Commits | Conventional Commits: `feat(api): add score endpoint`. See [`commits.md`](.ai/standards/commits.md). |
| PR | Draft until `make verify` passes. Fill in the template, including how it was tested and AI disclosure. Title in commit format. |
| Review | At least one human who is not the author approves. AI review is advisory only. |
| Merge | **Create a merge commit** only. No squash, no rebase, no force push. |
| Records | Decisions in `docs/decisions/<issue, 4 digits>-<title>.md`, assumptions in `docs/assumptions/A-<issue>.<n>.md` (ADR-0000). |

## What's in the repo

| Path | What it is | Edit it? |
|------|-----------|----------|
| `.ai/standards/` | Team standards: agent rules, branching, commits, review, data handling, definition of done | By PR, reviewed by the code owners |
| `.ai/project/README.md` | Project context (purpose, owners, environments, deviations) | Yes, fill in every `REPLACE-ME` |
| `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/rules/` | Pointers so every AI tool reads `.ai/` | Only the quick reference in `AGENTS.md` |
| `.github/dependabot.yml` | Weekly dependency updates, with a 1-day cooldown | Uncomment the ecosystems you use |
| `.github/CODEOWNERS` | Required human reviewers | Yes, set the owners |
| `.github/pull_request_template.md` | PR template with testing evidence and AI disclosure | Rarely |
| `.pre-commit-config.yaml` | pre-commit: whitespace, YAML, private keys, gitleaks. pre-push: `make verify` | Add stack hooks |
| `Makefile` | The checks: `lint`, `test`, `records-check`, `verify`, `secrets-scan`, `check`, plus `build` and `dev` | Yes, wire in the project's linters and tests |
| `docs/decisions/` | Architecture Decision Records, one per issue, named after it (ADR-0000) | Add a file per decision |
| `docs/assumptions/` | Assumptions made where requirements are silent, one file each, named after the issue | Add a file per assumption |
| `docs/tools/` | Builds the record tables (`make records`) and checks record names before each push | Rarely |
| `docs/runbooks/` | Operating procedures | Add as needed |
| `src/` | The page: `template.html`, `shell/` (host, input, HUD), `messages/`, `games/`, `themes/`, `holidays/`, `assets/` | Yes; a new game or theme is a new folder |
| `assets/fonts/` | Subset WOFF2 fonts, their OFL licenses, and how they were made | Only with a new subset |
| `build/` | `build.js` writes `dist/`; `check.js` checks budgets, CSP hashes, and content | When the build changes |
| `tests/` | `node --test` suites, mirroring `src/` and `build/` | Yes, with every change |
| `benjo.config.json` | Which message, games, and themes the build bundles, and a theme pin or `auto` | Yes |
| `budgets.json` | Gzipped byte budgets per part, checked by `make test` | Only with a reason in the PR |
| `dist/` | Build output, not committed | No, run `make build` |

## Supply chain defaults

- pre-commit hook revs are pinned to commit SHAs (`pre-commit autoupdate --freeze`).
- Dependabot waits a day before proposing a newly published version.
- No CI (ADR-0006). If a workflow is ever added back, pin every `uses:` to a commit SHA, default to `contents: read`, and never use `pull_request_target`.
- For JavaScript, use pnpm and set `minimumReleaseAge: 1440` in `pnpm-workspace.yaml` so new package versions wait 24 hours. pnpm 11 ignores that setting in `.npmrc` (A-8.6).

## Setup checklist

1. Fill in every `REPLACE-ME`:
   ```sh
   git grep -n REPLACE-ME
   ```
2. Wire the project's real linters and tests into the `Makefile` `lint` and `test` targets.
3. Uncomment the matching ecosystems in `.github/dependabot.yml`.
4. Apply the repository settings in `.ai/standards/branching-and-merging.md` ("Recommended GitHub repository settings"): merge commits only, protected `main`, Code Owner review, and a tag ruleset. There are no status checks to require (ADR-0006).
5. Turn on secret scanning, push protection, and Dependabot alerts.
6. Install the local hooks. This sets up both pre-commit and pre-push, and they are the only automatic checks:
   ```sh
   pipx install pre-commit && pre-commit install
   ```

## Local checks

```sh
make help          # list targets
make verify        # lint, tests, record checks (the pre-push hook)
make check         # verify + full-history secret scan
```

Needs `shellcheck` and `gitleaks` on your `PATH` (`brew install shellcheck gitleaks`).
