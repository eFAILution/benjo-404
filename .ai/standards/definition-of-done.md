# Definition of Done

This is the checklist every change completes before it is merged, whether a human or an agent wrote it. Items that do not apply are marked N/A in the PR along with the reason.

## Code and tests

- [ ] The change does what the issue or task asks, and nothing more.
- [ ] New or changed behavior is covered by automated tests, and the tests fail without the change.
- [ ] No tests, lint rules, type checks, or CI steps were skipped, disabled, or loosened to get green.
- [ ] Error paths are handled. No errors are swallowed and no debug output is left behind.

## Quality gates

- [ ] Lint, format, and typecheck run clean locally, using the repo's own commands.
- [ ] The full test suite passes locally, or the PR says what could not be run and why.
- [ ] CI is green on the PR's head commit, including the secret scan.

## Documentation and decisions

- [ ] The README, runbooks, and API or config docs are updated where behavior, configuration, or commands changed.
- [ ] If a material choice was made (technology, architecture, data model, security approach, significant trade-off), a decision record exists for it.
- [ ] Assumptions made where the spec was silent are recorded in the project's assumptions log, or in the PR if no log exists.

## Data, secrets, and security

- [ ] No secrets, credentials, tokens, or `.env` files are in the diff.
- [ ] Only synthetic data appears in code, fixtures, seeds, screenshots, and logs. No PII, PHI, or customer data.
- [ ] No security control was weakened: authentication, authorization, validation, encryption, permissions.
- [ ] New dependencies are justified in the PR, and they are pinned per repo convention.

## User interfaces (if UI changed)

- [ ] Accessibility checked: keyboard navigation, focus order, labels and alt text, color contrast, screen-reader names for controls.
- [ ] Screenshots or a short recording, using synthetic data, are attached to the PR.

## Services (if a runtime service changed)

- [ ] Observability considered: structured logs without sensitive data, a health or readiness endpoint, and key metrics or traces for the new behavior.
- [ ] Failure behavior considered: timeouts, retries, idempotency, and what happens when a dependency is down.
- [ ] Configuration comes from the environment or a secret manager and is documented in `.env.example` or the equivalent.

## Infrastructure (if infra changed)

- [ ] Every change is made through IaC in this PR. No console changes, or any break-glass change has been reconciled into code.
- [ ] Plan output is attached and has been reviewed for destroys, replacements, wider access, and cost.
- [ ] New resources follow the project's naming, tagging, and least-privilege conventions.

## Review and merge

- [ ] The PR template is filled in, including how it was tested, risks and rollback, and AI disclosure.
- [ ] At least one human who is not the author approved the PR after an adversarial review. AI review was advisory only. See [pull-request-review.md](pull-request-review.md).
- [ ] All conversations are resolved.
- [ ] The PR was merged with a merge commit. No squash, no rebase, and no pushed history was rewritten. See [branching-and-merging.md](branching-and-merging.md).
- [ ] Any follow-up work is captured as issues, not left as TODOs.
