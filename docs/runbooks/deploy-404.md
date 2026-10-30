# Deploy the 404 page

How to put `dist/404.html` live on `beast-code.com`, check it, and roll it back.

How the site is fronted is still open (A-8.1), so this runbook gives two options. Pick the first one if anything can sit in front of Webflow. Neither option has been run against the live site yet.

## Who and what

- Run by: the site owner (eFAILution), or someone they name.
- Needs: Node 22+, pnpm 11, and a clean checkout of `main`.
- Option A also needs access to the CDN, edge worker, or proxy in front of the site.
- Option B also needs Webflow Designer access and publish rights, and GitHub Pages turned on for this repo (ADR-0069).
- Do not change the live Webflow 404 page while you test option A. It is the rollback.

## 1. Build and check

```sh
pnpm install --frozen-lockfile
make test                      # tests, build, and build/check.js
node build/check.js --print    # sizes against budgets
cat dist/csp.txt               # the header for option A
shasum -a 256 dist/404.html    # note this, you check it after deploy
```

Stop if `make test` fails. Deploy only files from this build. The CSP holds hashes of the inline script and style, so a 404.html from one build and a csp.txt from another will not run.

## 2. The CSP header

`dist/csp.txt` is the exact value of the `Content-Security-Policy` header. It has about this shape, with fresh hashes each build. The build may add directives, such as `img-src data:` for an inline favicon.

```text
default-src 'none'; script-src 'sha256-<script hash>'; style-src 'sha256-<style hash>'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

Copy it from the file. Never type it by hand and never add `'unsafe-inline'` to make something work.

`dist/embed/csp.txt` is the policy for option B. It allows script, style, and fonts from `'self'` only.

## 3. Option A: single file behind a proxy or CDN (preferred)

The proxy answers every 404 from Webflow with `dist/404.html`.

1. Upload `dist/404.html` where the proxy can read it, for example as a static asset of an edge worker.
2. Add a rule: when the origin returns status 404 for a `text/html` request, replace the body with `dist/404.html`.
3. Keep status `404`. Do not redirect, and do not answer with 200.
4. Set these response headers on that answer:
   - `Content-Type: text/html; charset=utf-8`
   - `Content-Security-Policy: <the line from dist/csp.txt>`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Cache-Control: no-cache`, so a new build and its header go live together.
5. Roll it out on a test path or a preview host first if the proxy allows it.

The file is fully self-contained, so it works on nested paths like `/a/b/c` with no asset URLs to break.

## 4. Option B: the embed snippet in Webflow

Use this only if nothing can sit in front of Webflow. It is weaker: Webflow sets its own headers and loads its own scripts, so the strict CSP above does not apply.

GitHub Pages hosts the files (ADR-0069). Every merge to `main` runs `.github/workflows/pages.yml`, which adds the build to the `gh-pages` branch as `<build id>/` and never changes an older folder. The build id is a hash of the files, so a merge that does not change the page adds nothing.

One-time setup: the repo needs GitHub Pro or public visibility, then Settings, Pages, Source: **GitHub Actions**. Run the workflow once from the Actions tab if nothing has merged since.

1. Find the build: `https://efailution.github.io/benjo-404/latest.txt` holds the newest build id. Open `https://efailution.github.io/benjo-404/<build id>/webflow.txt`.
2. `webflow.txt` has three pieces, each with its SRI hash (a fingerprint the browser checks) already filled in. Paste piece 1 into the Webflow 404 page settings, Inside `<head>` tag.
3. Paste piece 2 into the same settings, Before `</body>` tag.
4. Replace the page content with one Code Embed element holding piece 3.
5. GitHub Pages sends `Access-Control-Allow-Origin: *`, which the `crossorigin` tags need. It cannot send `X-Content-Type-Options` or a CSP, and Webflow sets its own headers, so `dist/embed/csp.txt` is not applied anywhere.
6. Publish to the staging domain first, then to the live domain.

To ship a new build, merge to `main`, wait for the workflow, and repeat steps 1 to 4 with the new id. The old folder stays up, so the live page keeps working until you republish Webflow.

## 5. Check after deploy

Use a path that does not exist, including a nested one.

```sh
curl -sI https://beast-code.com/benjo-check/a/b | head -1          # HTTP/2 404
curl -sI https://beast-code.com/benjo-check/a/b | grep -i content-security-policy
curl -s https://beast-code.com/benjo-check/a/b | shasum -a 256       # option A: matches step 1
```

For option A, the CSP header must equal `dist/csp.txt` byte for byte.

Then in a browser:

- The message and the Return Home button show at once, and Return Home goes to `/`.
- The console shows no CSP errors. The network panel shows only the page itself (option A).
- Space, a click, or a tap starts the game. Escape pauses. Tab still reaches Return Home first.
- `?theme=halloween&debug=1` swaps the theme and shows the debug line.
- With JavaScript off, the message and the button still show.
- On a phone, the page fits and the game plays by touch.

## 6. Roll back

Serve the old Webflow 404 again.

- Option A: turn off or delete the proxy rule from step 3.2. Webflow's own 404 page answers again, unchanged. Purge the CDN cache for 404 answers if the proxy cached them.
- Option B, back to an older build: paste that build's `webflow.txt` into Webflow again and publish. Every older folder is still on GitHub Pages.
- Option B, back to the old page: in Webflow, restore the 404 page from the backup taken before the change (Site settings, Backups), or remove the head code, the footer script, and the Embed element and put back the old content. Publish.
- Run the `curl` checks in step 5 again and confirm the old page and its headers are back.

If only the header is wrong (CSP errors, blank game), the message and Return Home still work, so this is not an outage. Roll back anyway, rebuild, and deploy the matching pair.
