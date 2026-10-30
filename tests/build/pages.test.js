// build/pages.js: each embed build lands in its own folder, and old folders are never rewritten.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';

import { publish, releaseId, sri, webflowSnippet } from '../../build/pages.js';

const BASE = 'https://pages.example/benjo-404';
const EMBED = {
  'benjo-404.js': 'console.info(1);\n',
  'benjo-404.css': '#page{color:red}\n',
  '404-body.html': '<div id="page"></div>\n',
  'b404-sans-400.woff2': 'sans',
  'csp.txt': "default-src 'none'\n",
};

/**
 * @param {string} dir
 * @param {Record<string, string>} files
 */
async function writeFiles(dir, files) {
  await mkdir(dir, { recursive: true });
  await Promise.all(Object.entries(files).map(([name, text]) => writeFile(join(dir, name), text)));
}

describe('releaseId', () => {
  const files = [
    { name: 'a.js', bytes: Buffer.from('one') },
    { name: 'b.css', bytes: Buffer.from('two') },
  ];

  it('is 12 hex characters and ignores file order', () => {
    const id = releaseId(files);
    assert.match(id, /^[0-9a-f]{12}$/);
    assert.equal(releaseId([...files].reverse()), id);
  });

  it('changes when a byte or a name changes', () => {
    const id = releaseId(files);
    assert.notEqual(releaseId([files[0], { name: 'b.css', bytes: Buffer.from('twO') }]), id);
    assert.notEqual(releaseId([files[0], { name: 'c.css', bytes: Buffer.from('two') }]), id);
  });
});

describe('sri', () => {
  it('matches the sha384 integrity format browsers check', () => {
    const bytes = Buffer.from('alert(1)');
    const expected = createHash('sha384').update(bytes).digest('base64');
    assert.equal(sri(bytes), `sha384-${expected}`);
  });
});

describe('webflowSnippet', () => {
  const parts = { baseUrl: BASE, id: 'abc123abc123', css: 'sha384-c', js: 'sha384-j', body: '<b>' };

  it('links the versioned files with integrity and CORS', () => {
    const snippet = webflowSnippet(parts);
    assert.ok(snippet.includes(`href="${BASE}/abc123abc123/benjo-404.css" integrity="sha384-c"`));
    assert.ok(
      snippet.includes(
        `<script type="module" src="${BASE}/abc123abc123/benjo-404.js" integrity="sha384-j" crossorigin="anonymous"></script>`,
      ),
    );
    assert.ok(snippet.endsWith('<b>\n'));
  });

  it('rejects a base URL that is not plain https', () => {
    for (const baseUrl of ['http://pages.example/x', `${BASE}/`, 'https://a.example/"x', '']) {
      assert.throws(() => webflowSnippet({ ...parts, baseUrl }), /base URL/);
    }
  });
});

describe('publish', () => {
  let root = '';
  let embedDir = '';
  let siteDir = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'benjo-404-pages-'));
    embedDir = join(root, 'embed');
    siteDir = join(root, 'site');
    await writeFiles(embedDir, EMBED);
    await mkdir(siteDir);
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('copies the served files into a folder named after the build, with the snippet', async () => {
    const { id, created } = await publish({ embedDir, siteDir, baseUrl: BASE });
    assert.equal(created, true);
    const files = (await readdir(join(siteDir, id))).sort();
    assert.deepEqual(files, [
      '404-body.html',
      'b404-sans-400.woff2',
      'benjo-404.css',
      'benjo-404.js',
      'webflow.txt',
    ]);
    assert.equal(await readFile(join(siteDir, 'latest.txt'), 'utf8'), `${id}\n`);
    const snippet = await readFile(join(siteDir, id, 'webflow.txt'), 'utf8');
    assert.ok(snippet.includes(sri(Buffer.from(EMBED['benjo-404.js']))));
    assert.ok(snippet.includes(EMBED['404-body.html']));
  });

  it('never rewrites a folder that already exists', async () => {
    const first = await publish({ embedDir, siteDir, baseUrl: BASE });
    await writeFile(join(siteDir, first.id, 'benjo-404.js'), 'tampered');
    const again = await publish({ embedDir, siteDir, baseUrl: BASE });
    assert.deepEqual(again, { id: first.id, created: false });
    assert.equal(await readFile(join(siteDir, first.id, 'benjo-404.js'), 'utf8'), 'tampered');
  });

  it('adds a new folder next to the old one when the build changes', async () => {
    const first = await publish({ embedDir, siteDir, baseUrl: BASE });
    await writeFile(join(embedDir, 'benjo-404.js'), 'console.info(2);\n');
    const second = await publish({ embedDir, siteDir, baseUrl: BASE });
    assert.notEqual(second.id, first.id);
    assert.deepEqual((await readdir(siteDir)).sort(), [first.id, second.id, 'latest.txt'].sort());
  });

  it('puts the full page at the site root, as the home page and the 404 page', async () => {
    const pagePath = join(root, '404.html');
    await writeFile(pagePath, '<!doctype html><title>404</title>\n');
    await publish({ embedDir, siteDir, baseUrl: BASE, pagePath });
    for (const name of ['index.html', '404.html']) {
      assert.equal(
        await readFile(join(siteDir, name), 'utf8'),
        '<!doctype html><title>404</title>\n',
      );
    }
  });

  it('updates the root page even when the build folder already exists', async () => {
    const pagePath = join(root, '404.html');
    await writeFile(pagePath, 'first\n');
    await publish({ embedDir, siteDir, baseUrl: BASE, pagePath });
    await writeFile(pagePath, 'second\n');
    const again = await publish({ embedDir, siteDir, baseUrl: BASE, pagePath });
    assert.equal(again.created, false);
    assert.equal(await readFile(join(siteDir, 'index.html'), 'utf8'), 'second\n');
  });

  it('fails when a required embed file is missing', async () => {
    await rm(join(embedDir, 'benjo-404.css'));
    await assert.rejects(publish({ embedDir, siteDir, baseUrl: BASE }), /benjo-404\.css/);
  });
});
