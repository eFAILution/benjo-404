// Runs the real build (real config and sources) into a temp dir, then checks what it wrote.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { build } from '../../build/build.js';
import { findStrayUrls, readCtaHref, runChecks, SVG_NS } from '../../build/check.js';
import { extractInline, sha256Base64 } from '../../build/inline.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const quiet = { warn: () => {} };

describe('real build output', () => {
  let dir;
  let dist;
  let html;
  let result;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'benjo-404-dist-'));
    dist = join(dir, 'dist');
    result = await build({ outDir: dist, cacheDir: join(dir, 'cache'), log: quiet });
    html = await readFile(join(dist, '404.html'), 'utf8');
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('passes every check in build/check.js', async () => {
    const { problems } = await runChecks({ root: ROOT, distDir: dist });
    assert.deepEqual(problems, []);
  });

  it('has no template tokens left', () => {
    assert.ok(!html.includes('{{'));
  });

  it('has no http URLs except the CTA and the SVG namespace', () => {
    const href = readCtaHref(html);
    assert.ok(href);
    assert.deepEqual(findStrayUrls(html, [SVG_NS, href]), []);
  });

  it('serves a csp.txt whose hashes match the inline script and style', async () => {
    const csp = await readFile(join(dist, 'csp.txt'), 'utf8');
    const { script, style } = extractInline(html);
    assert.ok(csp.includes(`script-src 'sha256-${sha256Base64(script)}'`));
    assert.ok(csp.includes(`style-src 'sha256-${sha256Base64(style)}'`));
    assert.ok(!csp.includes('unsafe'));
  });

  it('measures every bundled theme and game', async () => {
    const sizes = JSON.parse(await readFile(join(dist, 'sizes.json'), 'utf8'));
    assert.deepEqual(Object.keys(sizes.themes).sort(), result.plan.themes.map((t) => t.id).sort());
    assert.deepEqual(Object.keys(sizes.games).sort(), result.plan.games.map((g) => g.id).sort());
    assert.ok(sizes.total.gzip > 0 && sizes.total.raw >= sizes.total.gzip);
  });
});
