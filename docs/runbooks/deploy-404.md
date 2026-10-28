# Deploy the 404 page

How to put `dist/404.html` live on `beast-code.com`, check it, and roll it back.

How the site is fronted is still open (A-8.1), so this runbook gives two options. Pick the first one if anything can sit in front of Webflow. Neither option has been run against the live site yet.

## Who and what

- Run by: the site owner (eFAILution), or someone they name.
- Needs: Node 22+, pnpm 11, and a clean checkout of `main`.
- Option A also needs access to the CDN, edge worker, or proxy in front of the site.
- Option B also needs Webflow Designer access and publish rights.
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

1. Upload `dist/embed/benjo-404.js`, `benjo-404.css`, and both `.woff2` files to one folder on a host you control. Keep the CSS and fonts side by side, because the CSS loads the fonts by relative URL.
2. Take a subresource integrity hash of each file, so a changed file on the host will not run:
   ```sh
   for f in dist/embed/benjo-404.js dist/embed/benjo-404.css; do
     echo "$f sha384-$(openssl dgst -sha384 -binary "$f" | openssl base64 -A)"
   done
   ```
3. In the Webflow 404 page settings, add to the head code: `<link rel="stylesheet" href="https://<host>/<folder>/benjo-404.css" integrity="sha384-<css hash>" crossorigin="anonymous">`.
4. Add before `</body>`: `<script type="module" src="https://<host>/<folder>/benjo-404.js" integrity="sha384-<js hash>" crossorigin="anonymous"></script>`. The host must send CORS headers for these files.
5. Replace the page content with one Embed element holding `dist/embed/404-body.html`.
6. If the host can send headers, serve the JS and CSS with `X-Content-Type-Options: nosniff`. If the files sit on another origin, `dist/embed/csp.txt` must name that origin in place of `'self'` wherever a policy is applied.
7. Publish to the staging domain first, then to the live domain.

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
- Option B: in Webflow, restore the 404 page from the backup taken before the change (Site settings, Backups), or remove the head code, the footer script, and the Embed element and put back the old content. Publish.
- Run the `curl` checks in step 5 again and confirm the old page and its headers are back.

If only the header is wrong (CSP errors, blank game), the message and Return Home still work, so this is not an outage. Roll back anyway, rebuild, and deploy the matching pair.
