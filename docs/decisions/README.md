# Architecture Decision Records

Each ADR records one material choice: its context, the decision, the alternatives considered, and the consequences (including tradeoffs and limitations). Number a new ADR with its issue number, padded to four digits: the decision for issue #105 is `0105-<title>.md` (ADR-0105), with the heading `# 0105. <Title>`. One ADR per issue; later PRs for the same issue edit it, and a second decision gets its own issue. Never renumber. To change a decision, add a new ADR that supersedes the old one, and set the old ADR's status to `Superseded by NNNN`. The full procedure is in `.ai/project/README.md` under "Issues, branches, and records" (ADR-0000).

<!-- BEGIN decisions index -->

On GitHub, the ADR files are listed above this page. Run `make records` to see this table; do not edit it by hand, and do not remove the markers. Only a snapshot commit (a release or hand-off) writes the table, with `python3 docs/tools/record_index.py --write`.

<!-- END decisions index -->

Template:

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD
- Deciders: names / roles

## Context
## Decision
## Alternatives considered
## Consequences
```
