# 0069. Publish the Webflow embed files to GitHub Pages

- Status: Accepted
- Date: 2026-10-30
- Deciders: eFAILution

## Context

beast-code.com is a Webflow site, and nothing is known to sit in front of it (A-8.1). Each Webflow Code Embed holds at most 50,000 characters, and `dist/embed/benjo-404.js` is 161,740. Issue #10 planned to split the bundle into many embeds, but the shell alone is 51,083 characters, so even that split does not fit without more work.

Option B in `docs/runbooks/deploy-404.md` avoids the limit: Webflow keeps two short tags that load the script and stylesheet from a host we control, pinned with SRI hashes. That needs a host that sends CORS headers and keeps old files up, because a page whose SRI hash points at a changed or missing file loses its game.

The repo is private on GitHub's Free plan, which cannot serve Pages. Pages needs GitHub Pro or a public repo.

## Decision

1. `.github/workflows/pages.yml` runs on every push to `main` and on demand. It builds `dist/embed/`, adds it to the `gh-pages` branch, and deploys that branch to GitHub Pages.
2. `build/pages.js` names each build after the first 12 hex characters of a sha256 over its files, writes it to `<build id>/`, and never touches a folder that exists. `latest.txt` holds the newest id.
3. Each folder has a `webflow.txt` with the three pieces to paste into Webflow, SRI hashes already filled in.
4. The workflow splits its jobs by what they can do. The build job installs and runs dependencies with a read-only token and no stored git credentials. The publish job can push to `gh-pages` but installs nothing. The deploy job holds the Pages and OIDC (identity token) permissions only. Every action is pinned to a commit SHA, and Dependabot already updates them.
5. The workflow is a deploy, not a check. Tests stay in the local hooks, and ADR-0006 stands.

## Alternatives considered

- **Split the bundle into Code Embeds (issue #10).** Needs no host, but the shell itself is over the limit, every release means pasting many snippets, and growth hits the limit again.
- **Cloudflare Pages or Netlify.** Free with a private repo, but adds an account, a token, and an upload tool to the supply chain. The team chose to keep everything on GitHub.
- **Deploy `dist/embed/` straight to Pages each time.** Simpler, but each deploy replaces the site, so the files the live Webflow page points at would vanish until Webflow is republished.
- **A local `make publish` that pushes `gh-pages`.** No Actions minutes, but depends on someone remembering to run it after each merge.

## Consequences

- Nothing is served until the repo has GitHub Pro or goes public, and Pages is set to deploy from GitHub Actions.
- The files on Pages are public whatever the repo's visibility. They are the same files any visitor's browser downloads from the 404 page.
- Shipping a build is still a manual Webflow step: copy the new `webflow.txt` in and republish. Until then, the live page keeps the build it has.
- `gh-pages` grows by about 190 KB per build that changes the page. Old folders are kept on purpose, since a live Webflow page may still point at one.
- GitHub Pages cannot set `X-Content-Type-Options` or a CSP, and Webflow sets its own headers, so the embed runs without the strict CSP that option A has.
- On a private repo with Pro, each run uses a few Actions minutes. On a public repo, Actions are free.
