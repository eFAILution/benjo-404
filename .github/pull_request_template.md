## Summary

<!-- What changed, in 1–3 sentences. Use a Conventional Commits title for the PR, e.g. "fix(auth): reject expired refresh tokens". -->

## Why

<!-- The problem or requirement. Link the issue: Closes #123 -->

## Type of change

- [ ] Feature
- [ ] Bug fix
- [ ] Infrastructure / IaC
- [ ] Documentation
- [ ] Refactor / chore (no behavior change)
- [ ] Breaking change

## How was this tested

<!-- Commands you ran and their actual results, plus any manual steps. If something was not run, say so and why. -->

```text
$ <command>
<result>
```

## Evidence

<!-- Screenshots (UI), logs/output (behavior), or plan output (infra). Synthetic data only. -->

## Risks and rollback

<!-- What could break, who is affected, and how to undo it (revert this PR, redeploy previous image digest, etc.). -->

## AI assistance disclosure

- [ ] No AI tools were used for this change.
- **Tools used:** <!-- e.g. agent / assistant name -->
- **Which parts:** <!-- files or areas the AI wrote or substantially changed -->
- **Human verification:** <!-- what you reviewed, ran, or tested yourself -->
- **Adversarial review:** <!-- separate AI session or second human; link or summarize findings and what was fixed -->
- [ ] The approving reviewer is not the person who prompted the agent (or "solo review" is stated here, per `.ai/standards/pull-request-review.md`).

## Checklist

- [ ] Tests added or updated (or N/A with reason above)
- [ ] Docs / README updated where behavior, config, or commands changed
- [ ] New assumptions are `docs/assumptions/A-<issue>.<n>.md` and a new ADR is `docs/decisions/<issue, 4 digits>-<title>.md`, keyed on this PR's issue; no index table edited by hand (ADR-0000)
- [ ] No secrets, credentials, or real personal data (synthetic data only)
- [ ] No pushed history rewritten; will merge with **Create a merge commit**
- [ ] If infra changed: plan output attached and reviewed for destroys/replacements
