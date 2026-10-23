# 0006. Run checks in local hooks instead of CI

- Status: Accepted
- Date: 2026-10-23
- Deciders: eFAILution

## Context

The repo started with a GitHub Actions workflow that ran the secret scan, linters, tests, and record checks on every pull request and push to `main`. This is a private repository, so those runs use paid Actions minutes. The project is a small, self-contained hackathon game, and every check is quick to run on a laptop.

The team standards assume CI is the gate: required status checks on `main`, a CI secret scan because "hooks can be skipped locally, CI cannot", and a definition of done that asks for a green CI run.

## Decision

1. Remove `.github/workflows/ci.yml`. The repo has no CI.
2. `pre-commit install` installs two hook types (`default_install_hook_types` in `.pre-commit-config.yaml`):
   - **pre-commit**, on every commit: whitespace and end-of-file fixes, YAML check, merge-conflict markers, large files, private keys, and gitleaks on the staged changes.
   - **pre-push**, on every push: `make verify`, which runs `make lint`, `make test`, and the record checks from ADR-0000.
3. `make check` adds the full-history gitleaks scan to `make verify`. Run it before a release or hand-off.
4. The PR's "How was this tested" section is the evidence that checks ran, in place of a CI status.
5. Item 5 of ADR-0000 ("CI checks new records") now runs in the pre-push hook. The checks themselves are unchanged.

This is recorded as a deviation in `.ai/project/README.md`.

## Alternatives considered

- **Keep CI.** It is the strongest gate, since nobody can skip it, but it costs Actions minutes for every push.
- **Keep CI on pull requests only.** Fewer runs, but still paid, and the cost is for checks that are already cheap locally.
- **Disable the workflow in repository settings but keep the file.** Easy to turn back on, but the file would mislead readers into thinking the checks run.

## Consequences

- No Actions minutes are spent on checks.
- The checks only run where the hooks are installed. Every contributor runs `pre-commit install` once per clone.
- `git commit --no-verify` and `git push --no-verify` skip every check, and nothing catches it afterwards. The standards already forbid `--no-verify`; reviewers should ask for the "How was this tested" output when it is missing.
- The full-history secret scan no longer runs automatically. Per-commit gitleaks still runs on staged changes.
- Branch protection has no status checks to require. Human review is still required.
- To bring CI back, restore `ci.yml` from the commit before this ADR's PR and supersede this ADR.
