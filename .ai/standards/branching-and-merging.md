# Branching and Merging

This standard covers how changes move from a branch into `main`, and why pushed history is never rewritten.

## Model

- Use trunk-based development. Keep `main` releasable at all times, and get every change into it through a pull request (PR).
- Branch from an up-to-date `main`. Keep branches short-lived and merge them within days, not weeks. Split large work into a sequence of PRs, or put it behind feature flags.
- Give each branch one purpose. Do not bundle unrelated changes.
- Do not keep long-lived `develop` or per-environment branches. A temporary `release/` branch is allowed only for the hotfix case below.

## Branch names

Use `<prefix>/<short-kebab-description>`. You can add an issue number: `fix/123-expired-session-token`.

| Prefix | Use for |
|--------|---------|
| `feat/` | New behavior |
| `fix/` | Bug fixes, including hotfixes |
| `infra/` | Infrastructure as code, pipelines, environments |
| `docs/` | Documentation only |
| `chore/` | Dependencies, tooling, refactors with no behavior change |
| `spike/` | Throwaway exploration. Never merged as-is. Record findings in a decision record or carry them into a new branch. |

Agent-created branches may use the tool's own prefix (`claude/…`, `codex/…`, `copilot/…`) so their origin is obvious.

## Protected `main`

Protect `main` with a branch protection rule or a ruleset:

- Require a PR. Nobody pushes directly, admins included.
- Require at least 1 approving review from a human who is not the author. See [pull-request-review.md](pull-request-review.md).
- Dismiss stale approvals when new commits arrive, and require approval of the most recent push.
- Require status checks to pass: build, lint, tests, secret scan, and infra plan where relevant.
- Require all conversations to be resolved.
- Block force pushes and block deletion.
- Leave "Require linear history" **off**. It blocks merge commits.

## Merging: merge commits only

- Merge PRs with **Create a merge commit**. Disable squash merging and rebase merging in the repository settings.
- Write the PR title in the commit format from [commits.md](commits.md). The title is recorded in the merge commit.
- Merge only after a human has approved and the required checks are green. Agents never merge.
- Deleting the head branch after merge is fine, because its commits stay reachable from `main` through the merge commit.

## History is an audit artifact

The complete commit history is kept unaltered: who changed what, when, and who reviewed it. Rewritten history cannot be shown to be complete. Rewriting also breaks every clone, open PR, and review comment that points at the old commits.

"Pushed" means pushed to the shared remote. That includes your own feature branch once it has been pushed, because reviewers and CI refer to its commits. For anything pushed:

- NEVER rebase, amend, squash, or reset pushed commits.
- NEVER force push (`--force` or `--force-with-lease`) to a pushed branch.
- NEVER use squash merge or rebase merge.
- NEVER delete, move, or re-point a pushed tag.
- Fix mistakes with new commits. To undo a whole commit, use `git revert <sha>`.

**Before the first push**, cleaning up your own local commits is fine: amend, `git rebase -i`, and folding in fixups are all allowed if they make the series easier to review. Once you push, those commits are permanent.

## Keeping a branch current

- Merge `main` into your branch. Do not rebase onto it:
  ```sh
  git fetch origin
  git merge origin/main
  ```
- In the GitHub UI, use **Update branch** with a merge commit. Never choose **Update with rebase**.
- Set `git config --global pull.rebase false` so that `git pull` merges instead of rebasing.
- Resolve conflicts in the merge commit. If a resolution is non-trivial, explain it in the merge commit message.

## Tags

- Use annotated tags and push them explicitly:
  ```sh
  git tag -a v1.4.0 -m "Release 1.4.0: <one-line summary>"
  git push origin v1.4.0
  ```
- Name versions `vMAJOR.MINOR.PATCH` (SemVer). Give milestones descriptive annotated tags, for example `milestone/<name>`.
- Tag only commits on `main` (or on a `release/` branch in the hotfix case) that have passed CI.
- NEVER delete or move a pushed tag. If a tag is wrong, create a new tag (for example `v1.4.1`) and explain the mistake in its message.
- Protect tag patterns with a ruleset. Signed tags (`git tag -s`) are recommended.

## Environment promotion

- Promote the same artifact, not the same branch. Build once from the merge commit on `main`, then promote that exact artifact from dev to test and on to later environments.
- Identify artifacts immutably. Reference container images by digest (`image@sha256:…`) and packages by version plus checksum. Tag images with the commit SHA so they trace back to source. Never deploy a mutable tag such as `latest`.
- Environments differ only in configuration and secrets injected at deploy time. Never rebuild per environment, and never keep per-environment branches.
- Run promotion as a pipeline step, with a recorded human approval where the environment requires one (for example GitHub Environments with required reviewers). Record which digest and commit were deployed to each environment.
- To roll back, redeploy the previously promoted digest. Then fix forward on `main`.

## Hotfixes

**Default case** (`main` is releasable):

1. Branch `fix/<issue>-<description>` from `main`.
2. Make the smallest possible change and add a regression test.
3. Open a PR and get an expedited human review. Speed it up but do not skip it. Required checks still apply.
4. Merge with a merge commit. Build once, then promote the new digest through every environment. You may shorten soak time, but do not skip stages.
5. Tag the release (`vX.Y.Z+1`).

**When `main` holds changes that cannot ship yet:**

1. Create `release/vX.Y` from the deployed tag and protect it the same way as `main`.
2. Open a PR with the fix into `release/vX.Y` and merge it with a merge commit. Tag `vX.Y.(Z+1)` on that branch, then build and promote.
3. Open a PR from `release/vX.Y` into `main` and merge it with a merge commit, so the fix is never lost. Once that is merged, the release branch may be deleted.

Emergencies do not bypass review. A second human still approves, even if quickly.

## Recommended GitHub repository settings

Settings → General → Pull Requests:

- [ ] Allow merge commits: **on**. Default commit message: "Pull request title and description".
- [ ] Allow squash merging: **off**.
- [ ] Allow rebase merging: **off**.
- [ ] Always suggest updating pull request branches: on.
- [ ] Automatically delete head branches: on (optional).

Ruleset or branch protection on `main` (and `release/*`):

- [ ] Restrict deletions. Block force pushes.
- [ ] Require a pull request with: 1+ approvals, dismiss stale approvals, require approval of the most recent reviewable push, require conversation resolution.
- [ ] Require review from Code Owners, with a `CODEOWNERS` file that lists human users or teams only.
- [ ] Require named status checks to pass. Optionally, require branches to be up to date.
- [ ] Require linear history: **off**.
- [ ] Bypass list: empty.
- [ ] Require signed commits: recommended once every contributor signs.

Tag ruleset on `v*` and `milestone/*`:

- [ ] Restrict deletions, restrict updates, block force pushes.

Other:

- [ ] Secret scanning and push protection where your plan offers them. Dependency alerts on.
- [ ] Actions: default `GITHUB_TOKEN` permissions read-only. Turn "Allow GitHub Actions to create and approve pull requests" off. If a workflow must open PRs, rely on Code Owner review by human teams so a bot approval can never satisfy the gate.
