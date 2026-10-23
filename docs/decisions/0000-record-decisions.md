# 0000. Record decisions and assumptions as one file each, keyed on the issue

- Status: Accepted
- Date: 2026-10-23
- Deciders: REPLACE-ME

## Context

Choices about technology, architecture, data models, and security get made early and questioned later. Without a record, the reasons are lost when people move on, and the same debate happens again.

The obvious way to keep records is one shared assumptions table and one ADR index, with each author taking "the next free number". On a team with several pull requests open at once, that fails in two ways:

- **Merge conflicts.** Git conflicts when two branches change the same lines. Two branches that each append a row to the end of one table always change the same lines, so every merge to `main` conflicts with the other open pull requests, and approvals go stale while authors resolve them.
- **ID collisions.** Two branches open at the same time take the same "next free" number, and both land with it.

## Decision

1. **Every change starts with a GitHub issue**, and the branch name carries its number: `<prefix>/<issue>-<description>`. Agent branches follow the same rule (`claude/<issue>-…`). This makes the optional issue number in `.ai/standards/branching-and-merging.md` required here; it is recorded as a deviation in `.ai/project/README.md`.
2. **A new ADR is numbered with its issue number**, padded to four digits: `docs/decisions/0105-<title>.md` for issue #105. GitHub never gives two issues the same number, so two branches cannot pick the same ADR number. One ADR per issue; a second decision gets its own issue. This ADR is `0000`, a number no issue can have.
3. **Each assumption is its own file**, `docs/assumptions/A-<issue>.<n>.md`: `A-105.1.md` is the first assumption from issue #105.
4. **Nobody edits the index tables.** `docs/assumptions-log.md` and `docs/decisions/README.md` hold markers instead of rows. `make records` prints both tables from the record files; `python3 docs/tools/record_index.py --write` commits them for a snapshot such as a release.
5. **CI checks new records.** The `records` job in `ci.yml` runs on every pull request. It fails when a new or renamed ADR or assumption does not carry the branch's issue number, when two ADR files share a number, or when a record file is misnamed or missing a field. It warns when the branch has no issue number at all.

ADRs are never renumbered, and they are superseded rather than edited once accepted. Small, reversible assumptions go in `docs/assumptions/` instead of an ADR.

## Alternatives considered

- **Decisions in PR descriptions only.** No extra files, but hard to find later and easy to lose in a long PR history.
- **A wiki.** Easy to edit, but it drifts from the code and is not reviewed with the change.
- **Keep one log file and key its rows on issue numbers.** Rejected. Git merges by line position, not by key. New rows still go at the end of the table, so two branches still change the same lines and still conflict.
- **Keep one log file and mark it `merge=union` in `.gitattributes`.** Rejected. GitHub's own merges (the merge button, **Update branch**, and the merge queue) do not apply it, and when two branches edit the same row it keeps both copies with no warning.

## Consequences

- Pull requests that add ADRs and assumptions do not conflict with each other. Edits to the same existing record still conflict, which is the conflict we want to see.
- ADR and assumption numbers are not consecutive. Order of numbers is order of issues, not order of decisions; the ADR's date says when it was made.
- On GitHub, the index pages show a placeholder; run `make records` to see the tables.
- A branch with the wrong name cannot be fixed by renaming it on GitHub: that closes its pull request. The steps for moving to a correctly named branch are in `.ai/project/README.md`.
- Every material PR may need an ADR, which adds a little writing. Reviewers and new team members can see why the system looks the way it does.
