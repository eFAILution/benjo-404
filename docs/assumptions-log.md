# Assumptions Log

Assumptions made where the requirements or stakeholders have not yet given an answer. When an assumption is confirmed or disproved, update **Status** and keep the record.

Status: `open` (unvalidated), `confirmed`, `revised` (see note), `retired`.

## Adding an assumption

Each assumption is its own file in [`assumptions/`](assumptions/), keyed on the issue it came from (ADR-0000). Two pull requests never edit the same file or pick the same ID, so they do not conflict. The full procedure, including what to do when CI rejects a file, is in `.ai/project/README.md` under "Issues, branches, and records".

- Name the file `docs/assumptions/A-<issue>.<n>.md`: `A-105.1.md` is the first assumption for issue #105, `A-105.2.md` the second. No zero padding. Check `main` for existing `A-105.*` files before you pick `<n>`.
- Never reuse or renumber an ID. To confirm or retire an assumption, change its **Status** and keep the file.
- Copy the template below exactly: the heading is the file name without `.md`, and each field is one paragraph that starts with its bold label and a period. A second paragraph or a list under a field is kept with that field. CI fails if a field is missing or the heading does not match the file name.

```markdown
# A-105.1

**Assumption.** ...

**Reason.** ...

**Effect if incorrect.** ...

**Validation or mitigation.** ...

**Decision owner.** ...

**Status.** open
```

## Log

`make records` builds this table from the files in `assumptions/`. Do not edit it by hand, and do not remove the markers. Only a snapshot commit (a release or hand-off) writes the table, with `python3 docs/tools/record_index.py --write`.

<!-- BEGIN assumptions index -->

On GitHub, read the records in [`assumptions/`](assumptions/), or run `make records` for the full table.

<!-- END assumptions index -->
