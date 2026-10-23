# benjo-404

Hackathon submission for team "404: Team Not Found".

REPLACE-ME: what the app does, how to run it, and known limitations.

## How we work

Every change starts with a GitHub issue, goes on a branch named after it, and reaches `main` through a reviewed pull request merged with a merge commit. The full rules are in [`.ai/`](.ai/README.md), which humans and coding agents read the same way.

| Step | Rule |
|------|------|
| Issue | Open or find one issue per PR. Split big work into sub-issues. |
| Branch | `<prefix>/<issue>-<short-description>`, for example `feat/12-score-board`. Prefixes: `feat/`, `fix/`, `infra/`, `docs/`, `chore/`, `spike/`, or an agent's own (`claude/`, `codex/`, `copilot/`). |
| Commits | Conventional Commits: `feat(api): add score endpoint`. See [`commits.md`](.ai/standards/commits.md). |
| PR | Draft until checks pass. Fill in the template, including how it was tested and AI disclosure. Title in commit format. |
| Review | At least one human who is not the author approves. AI review is advisory only. |
| Merge | **Create a merge commit** only. No squash, no rebase, no force push. |
| Records | Decisions in `docs/decisions/<issue, 4 digits>-<title>.md`, assumptions in `docs/assumptions/A-<issue>.<n>.md` (ADR-0000). |

## What's in the repo

| Path | What it is | Edit it? |
|------|-----------|----------|
| `.ai/standards/` | Team standards: agent rules, branching, commits, review, data handling, definition of done | By PR, reviewed by the code owners |
| `.ai/project/README.md` | Project context (purpose, owners, environments, deviations) | Yes, fill in every `REPLACE-ME` |
| `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/rules/` | Pointers so every AI tool reads `.ai/` | Only the quick reference in `AGENTS.md` |
| `.github/workflows/ci.yml` | Secret scan over full history, actionlint, `make lint`, `make test`, record checks | Add the project's toolchain setup |
| `.github/dependabot.yml` | Weekly updates for pinned actions, with a 1-day cooldown | Uncomment the ecosystems you use |
| `.github/CODEOWNERS` | Required human reviewers | Yes, set the owners |
| `.github/pull_request_template.md` | PR template with testing evidence and AI disclosure | Rarely |
| `.pre-commit-config.yaml` | Local hooks: whitespace, YAML, private keys, gitleaks | Add stack hooks |
| `Makefile` | The commands CI runs: `lint`, `test`, `records-check`, `secrets-scan`, `check` | Yes, wire in the project's linters and tests |
| `docs/decisions/` | Architecture Decision Records, one per issue, named after it (ADR-0000) | Add a file per decision |
| `docs/assumptions/` | Assumptions made where requirements are silent, one file each, named after the issue | Add a file per assumption |
| `docs/tools/` | Builds the record tables (`make records`) and checks record names in CI | Rarely |
| `docs/runbooks/` | Operating procedures | Add as needed |

## Supply chain defaults

- Every `uses:` reference is pinned to a commit SHA with the version in a comment. Dependabot bumps both.
- Tools downloaded in CI (gitleaks, actionlint) are checked against a pinned SHA-256 before they run.
- pre-commit hook revs are pinned to commit SHAs (`pre-commit autoupdate --freeze`).
- Dependabot waits a day before proposing a newly published version.
- Workflows default to `contents: read`, and checkout does not keep the token on disk.
- No `pull_request_target` triggers. Keep it that way unless a reviewed ADR says otherwise.
- For JavaScript, use pnpm and set `minimum-release-age=1440` in `.npmrc` so new package versions wait 24 hours.

## Setup checklist

1. Fill in every `REPLACE-ME`:
   ```sh
   git grep -n REPLACE-ME
   ```
2. Wire the project's real linters and tests into the `Makefile` `lint` and `test` targets, and add the toolchain setup to `ci.yml`.
3. Uncomment the matching ecosystems in `.github/dependabot.yml`.
4. Apply the repository settings in `.ai/standards/branching-and-merging.md` ("Recommended GitHub repository settings"): merge commits only, protected `main`, required checks `secret scan (gitleaks)`, `lint / test`, and `records (ADR and assumption IDs)`, Code Owner review, and a tag ruleset.
5. Turn on secret scanning, push protection, and Dependabot alerts.
6. Install the local hooks:
   ```sh
   pipx install pre-commit && pre-commit install
   ```

## Local checks

```sh
make help          # list targets
make check         # everything CI runs
```

Needs `actionlint`, `shellcheck`, and `gitleaks` on your `PATH` (`brew install actionlint shellcheck gitleaks`).
