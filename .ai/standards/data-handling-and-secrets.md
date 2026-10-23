# Data Handling and Secrets

This standard covers keeping real data and credentials out of repos, and what to do when one gets in anyway.

## Synthetic data only

- Repos MUST contain synthetic data only. That applies to code, fixtures, seed data, test snapshots, screenshots, logs, demo recordings, issues, and PR descriptions.
- NEVER commit or share personal data (PII), health data (PHI), customer data, or production database extracts, not even "just for a quick test".
- NEVER paste real data, secrets, or production logs into AI tools or prompts.
- Make synthetic data obviously fake:
  - Use emails on `example.com`, `example.org`, or the `.test` TLD (reserved by RFC 2606).
  - Use phone numbers from the ranges reserved for fiction, such as 555-0100 to 555-0199.
  - Use names and addresses from a generator such as Faker with a fixed seed, so results are reproducible.
  - Use test card numbers and IDs published by the provider, never real ones.
- Do not log secrets, tokens, full request bodies, or personal data. Redact or hash identifiers in logs and error messages.
- If you need production-like data for debugging, use a sanitized dataset that the project has approved and that stays outside the repo. Project context names the process.

## Where secrets live

- Keep secrets in a secret manager (the cloud provider's, or Vault) or in the CI platform's secret store. Never keep them in the repo, container images, IaC variables files, or wiki pages.
- Inject secrets at runtime through environment variables or mounted files, sourced from the secret manager. Applications read them at startup and never log them.
- IaC state can contain secrets. Store it in a remote backend that is encrypted and access-controlled. Never commit `*.tfstate` or the local state directories.
- Grant least privilege. Scope each secret to the one service and environment that needs it.

## `.env` files

- Gitignore real `.env` files:
  ```gitignore
  .env
  .env.*
  !.env.example
  ```
- Commit only `.env.example`. It lists every variable the app reads, with placeholder values and a comment for each:
  ```sh
  # Database connection string for local development
  DATABASE_URL=postgres://<user>:<password>@localhost:5432/<database>
  # Third-party API key: get from the secret manager, never commit
  PAYMENTS_API_KEY=changeme
  ```
- Placeholder values must never work against a real system.

## CI and deploy credentials

- Prefer short-lived federated credentials over long-lived keys. Use OIDC from the CI platform to the cloud provider (for example GitHub Actions OIDC) to assume a role at runtime.
- Scope each trust policy to the specific repo, and to the branch or environment where possible. A workflow on a feature branch must not be able to assume the production role.
- If a long-lived key cannot be avoided, keep it in the CI secret store, give it least privilege, set a rotation date, and record in project context who owns it.
- Give workflows a read-only `GITHUB_TOKEN` by default and grant extra permissions per job.

## Secret scanning

- **Pre-commit:** run gitleaks (or an equivalent) as a pre-commit hook so secrets are caught before they become commits.
  ```yaml
  # .pre-commit-config.yaml (excerpt)
  repos:
    - repo: https://github.com/gitleaks/gitleaks
      rev: <pinned version>
      hooks:
        - id: gitleaks
  ```
- **CI:** run the same scanner on every PR as a required status check. Hooks can be skipped locally. CI cannot.
- **Platform:** turn on GitHub secret scanning and push protection where your plan includes them.
- NEVER use `--no-verify` to get past a scanner. If you hit a false positive, add a narrow, reviewed allowlist entry (a fingerprint or path) in a PR.

## If a secret is committed

Treat the secret as compromised once it is pushed anywhere: a branch, a fork, or a PR that was later closed. Remote history is preserved and cannot be rewritten (see [branching-and-merging.md](branching-and-merging.md)), so **rotation is the fix**. Deleting the secret from the repo does not fix it.

1. **Rotate or revoke** the credential at its issuer immediately. Do this first.
2. **Tell the repo owner** and the security contact named in project context. Say what was exposed, where, and when.
3. **Check for misuse**: look at the issuer's access logs for use between the push and the rotation.
4. **Remove it from the current tree** in a new commit. Move the value to the secret manager, and fix `.gitignore` or the hook that let it through.
5. **Record the incident**: mark the old secret as rotated in the scanner's allowlist (by fingerprint) so CI stays meaningful, and note the incident in the PR.

If the secret was never pushed, remove it locally (amend or reset). If there is any doubt that it left your machine, for example because it was pasted into a tool, rotate it anyway.

Real personal or customer data cannot be rotated. If it is committed, treat it as a data incident: escalate to the repo owner immediately and follow the incident process in project context. Only the repo owner can decide whether any history remediation is required. That decision must be documented, and it is never made by an individual contributor or an agent.
