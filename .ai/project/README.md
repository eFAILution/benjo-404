# Project context: benjo-404

Read this after `.ai/standards/`. It covers what this repository is for, how it is laid out, and where it deviates from the standards. Replace every `REPLACE-ME` and delete sections that do not apply.

## Purpose

Hackathon submission for team "404: Team Not Found". REPLACE-ME: what the app does, who it is for, and what "done" looks like for the submission.

## Team and ownership

| Area | Owner(s) |
|------|----------|
| REPLACE-ME | REPLACE-ME |

- Security contact (for leaked secrets and data incidents): REPLACE-ME
- Maintainers: REPLACE-ME. If there is only one, say so here; it enables the solo-review exception in `.ai/standards/pull-request-review.md`.

## Where things live

- How to build, run, and test: root `README.md` and `make help`.
- Decisions: `docs/decisions/`, one ADR per issue. Assumptions: `docs/assumptions/`, one file per assumption. How to add either: [Issues, branches, and records](#issues-branches-and-records) below.
- Runbooks: `docs/runbooks/`.

## Issues, branches, and records

ADR and assumption IDs come from the GitHub issue number, so parallel PRs never pick the same ID or edit the same table (ADR-0000). Follow these steps in order.

**Before you start**

1. Find or open a GitHub issue for the change. One issue per PR. Split big work into sub-issues and give each PR its own.
2. Put the issue number in the branch name, right after the prefix: `feat/96-user-login`, `claude/96-user-login`. Not `feat/user-login-96`, and not an epic's number when the PR closes a sub-issue.

**Recording a decision** (issue #96 is the example)

- Create `docs/decisions/0096-<short-title>.md`: the issue number padded to four digits, then a lower-case kebab-case title. Copy the template at the bottom of `docs/decisions/README.md`. The first line must be `# 0096. <Title>` and the file must have a `- Status:` line.
- One ADR per issue. A second decision in the same issue gets its own issue. Later PRs for the same issue edit the existing ADR; they do not add another.
- ADR `0000` is this repo's own record. No issue has number 0, so it never collides.

**Recording an assumption**

- Create `docs/assumptions/A-96.1.md` for the first assumption from issue #96, `A-96.2.md` for the second. No zero padding. The format and the six required fields are in `docs/assumptions-log.md`; a missing field fails `make records-check`.
- Before you pick `<n>`, run `ls docs/assumptions/A-96.*` on an up-to-date `main` and take the next number. Two open PRs for the same issue can still pick the same `<n>`; the loser gets an add/add conflict on that one file and renumbers.
- To confirm or retire an assumption, edit its **Status** field in its file. Keep the record.

**Never edit the index tables.** `docs/assumptions-log.md` and `docs/decisions/README.md` hold `<!-- BEGIN ... index -->` / `<!-- END ... index -->` markers. `make records` prints the tables from the record files. Only a snapshot commit, such as a release or hand-off, runs `python3 docs/tools/record_index.py --write` to commit both tables.

**If the records check fails on your PR.** The pre-push hook runs `make records-check` (as part of `make verify`) before every push. Its message names the file and the expected name. Fixes, in order of likelihood: the branch has no issue number (see **Moving to a branch with an issue number** below); the file is named after the wrong number; two ADR files share a number (rename yours to your issue number); a record file is missing a field. A branch with no issue number also gets a warning when it adds no records; it does not fail the check, but move to a correctly named branch the same way. Run the check locally with `make records-check`.

**Moving to a branch with an issue number.** Do not rename the branch on GitHub: renaming a pull request's head branch closes the pull request and deletes the old branch name. Open the issue if there is none, then rename the branch locally, push it under the new name, and open a new PR from it:

```sh
git branch -m feat/<issue>-<description>
git push -u origin feat/<issue>-<description>
gh pr create --head feat/<issue>-<description> --base main
```

The local rename and `-u` matter: they point the branch at the new remote branch, so later fixes reach the new PR instead of the closed one. Copy the old PR's description, add "Replaces #<old PR>" to it, and close the old PR with a comment that links the new one. Review comments and approvals stay on the old PR, and its open threads stop blocking anything once it closes. Before you close it, resolve each open thread there, or repost it as a comment on the new PR. No commit is rewritten; the old branch can be deleted once its commits are on the new one.

## Environments

| Name | Purpose | How it changes |
|------|---------|----------------|
| local | Any developer | REPLACE-ME (for example `make up`) |
| pages | `dist/embed/` on GitHub Pages, loaded by the Webflow 404 page | Every merge to `main`, through `.github/workflows/pages.yml` (ADR-0069) |

## Commands agents should run before committing

```sh
make verify        # lint, tests, and record checks (what the pre-push hook runs)
make secrets-scan  # gitleaks over the full history
```

There is no CI (ADR-0006); the only workflow publishes to GitHub Pages and checks nothing (ADR-0069). Install the hooks once with `pre-commit install`; it sets up both the pre-commit and pre-push hooks.

## Data handling

- Approved process for production-like debugging data, if any: REPLACE-ME (or "none; synthetic data only").
- Incident process for real data committed by mistake: REPLACE-ME

## Deviations from `.ai/standards/`

| Standard | Deviation | Reason |
|----------|-----------|--------|
| `branching-and-merging.md`: branch names | The issue number in the branch name is required, not optional | ADR and assumption IDs come from it (ADR-0000) |
| `branching-and-merging.md`, `data-handling-and-secrets.md`, `definition-of-done.md`, `pull-request-review.md`: required CI status checks | No CI. Local pre-commit and pre-push hooks run the checks, and the PR's "How was this tested" section is the evidence | GitHub Actions minutes cost money on a private repo, and the checks are cheap to run locally (ADR-0006) |
