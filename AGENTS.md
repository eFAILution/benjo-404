# Agent instructions

Before doing anything else, read `.ai/README.md` and follow it.
The standards in `.ai/standards/` are mandatory. Project context is in `.ai/project/`.

Quick reference for this repo (details in `.ai/project/README.md`):

- Checks: `make verify` before every push, and `make check` to add the full-history secret scan. There is no CI; the pre-commit and pre-push hooks are the only automatic checks, so never skip them (ADR-0006).
- Never push to `main`, force push, or rewrite pushed history. Merge commits only.
- Synthetic data only. No real personal data, customer data, credentials, or secrets, anywhere in the repo.
- Every PR has its own issue, and the branch carries its number: `feat/96-short-name`. Record assumptions as `docs/assumptions/A-<issue>.<n>.md` and decisions as `docs/decisions/<issue, 4 digits>-<title>.md`. Never edit the index tables (ADR-0000).
