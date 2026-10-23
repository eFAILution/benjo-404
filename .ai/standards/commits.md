# Commits

This standard covers how to write commits so history stays readable, easy to review, and usable as an audit record.

## Format: Conventional Commits

```text
<type>(<optional scope>): <summary>

<body: why the change was made, wrapped at 72 columns>

<footers>
```

| Type | Use for |
|------|---------|
| `feat` | New behavior |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `test` | Adding or fixing tests only |
| `refactor` | Code change with no behavior change |
| `perf` | Performance improvement |
| `build` | Build system, dependencies, packaging |
| `ci` | CI/CD pipeline definitions |
| `chore` | Maintenance that fits no other type |
| `revert` | Reverting an earlier commit |

- Use the scope to name the area touched, such as a module, a service, or `infra`. Example: `fix(auth): reject expired refresh tokens`.
- Mark breaking changes with `!` after the type or scope, and add a `BREAKING CHANGE:` footer that explains how to migrate. Example: `feat(api)!: remove v1 endpoints`.
- PR titles use the same format, because the PR title is recorded in the merge commit.

## Subject line

- Write it in the imperative mood ("add", "fix", "remove"; not "added" or "adds"). It should complete the sentence "If applied, this commit will …".
- Keep it to 72 characters or fewer, counting type and scope.
- Start lowercase after the colon, and do not end with a period.
- Be specific. Write `fix(api): return 404 for missing order`, not `fix: bug`.

## Body

- Explain *why* the change was needed and why you chose this approach. The diff already shows *what* changed.
- Note side effects, trade-offs, and alternatives you rejected: anything a future maintainer or auditor would ask about.
- Wrap at 72 columns. Leave out the body for trivial changes.

## Footers

- Reference issues: `Refs: #123`, or `Closes #123` to close the issue on merge.
- Add `BREAKING CHANGE: <description>` when it applies.

## One logical change per commit

- Each commit does one thing and should build on its own.
- Commit formatting and refactoring separately from behavior changes.
- Do not mix unrelated fixes. Give each one its own commit, or its own PR.
- Before the first push, you may reorganize your own local commits (amend, `git rebase -i`, fixups). After the push, history is permanent. See [branching-and-merging.md](branching-and-merging.md).

## Authorship

- The human who makes the commit is the author and is accountable for it, including any AI-assisted content.
- Disclose AI assistance in the PR description (see [pull-request-review.md](pull-request-review.md)), not in commit trailers.

## Hooks

- NEVER commit with `--no-verify`, and never bypass hooks any other way. If a hook is wrong or slow, fix it in its own PR.
- Use pre-commit (or an equivalent) for formatting, linting, and secret scanning (for example gitleaks), so problems are caught before the commit exists.

## Never commit

- Secrets, credentials, tokens, private keys, or `.env` files. See [data-handling-and-secrets.md](data-handling-and-secrets.md).
- Real personal or customer data.
- Generated or local artifacts: build output, dependency directories, coverage reports, `.terraform/`, `*.tfstate`, logs, editor and OS files. Keep `.gitignore` current.
- Large binaries, unless the repo tracks them with Git LFS.
- Commented-out code and leftover debug output.

Do commit lockfiles.

## Signed commits (recommended)

```sh
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

Add the same key to your Git host as a *signing* key. Set `user.name` and `user.email` to your real name and a verified email.

## Examples

```text
feat(search): add cursor pagination to results endpoint

Large result sets were timing out at the load balancer. Cursor
pagination keeps response time flat regardless of result size;
offset pagination was rejected because it degrades on deep pages.

Refs: #214
```

```text
revert: feat(search): add cursor pagination to results endpoint

This reverts commit <sha>. The export job relies on unpaginated
results. Re-land after the export job is updated.
```
