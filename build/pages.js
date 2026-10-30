// @ts-check
// dist/embed/ -> one folder per build on the GitHub Pages site, plus the snippet to paste into
// Webflow (ADR-0069). A folder is never rewritten, so SRI hashes already in Webflow keep working.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/** What the page loads at run time, plus the markup for the Webflow Code Embed. */
const REQUIRED = ['benjo-404.js', 'benjo-404.css', '404-body.html'];
const FONT = /\.woff2$/;
const ID_LENGTH = 12;
/** https, no trailing slash, and nothing that could end the HTML attribute it is pasted into. */
const BASE_URL = /^https:\/\/[a-z0-9.-]+(\/[A-Za-z0-9._~-]+)*$/;

/**
 * @typedef {{ name: string, bytes: Buffer }} EmbedFile
 */

/**
 * @param {EmbedFile[]} files
 * @returns {string} the first 12 hex characters of a sha256 over every name and its bytes
 */
export function releaseId(files) {
  const hash = createHash('sha256');
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const { name, bytes } of sorted) {
    hash.update(`${name}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return hash.digest('hex').slice(0, ID_LENGTH);
}

/**
 * @param {Buffer} bytes
 * @returns {string} a subresource integrity value
 */
export function sri(bytes) {
  return `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
}

/** @param {string} baseUrl */
function checkBaseUrl(baseUrl) {
  if (BASE_URL.test(baseUrl)) return baseUrl;
  throw new Error(
    `pages: the base URL must be https with no trailing slash: ${JSON.stringify(baseUrl)}`,
  );
}

/**
 * The three pieces that go into Webflow, in the order the runbook pastes them.
 * @param {{ baseUrl: string, id: string, css: string, js: string, body: string }} parts
 */
export function webflowSnippet({ baseUrl, id, css, js, body }) {
  const folder = `${checkBaseUrl(baseUrl)}/${id}`;
  const lines = [
    `<!-- Benjo 404, build ${id}. Steps: docs/runbooks/deploy-404.md, option B. -->`,
    '<!-- 1. 404 page settings, Inside <head> tag: -->',
    `<link rel="stylesheet" href="${folder}/benjo-404.css" integrity="${css}" crossorigin="anonymous">`,
    '',
    '<!-- 2. 404 page settings, Before </body> tag: -->',
    `<script type="module" src="${folder}/benjo-404.js" integrity="${js}" crossorigin="anonymous"></script>`,
    '',
    '<!-- 3. One Code Embed element, as the only content of the page: -->',
    body.trimEnd(),
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * @param {string} embedDir
 * @returns {Promise<EmbedFile[]>}
 */
async function readEmbed(embedDir) {
  const names = (await readdir(embedDir)).filter(
    (name) => REQUIRED.includes(name) || FONT.test(name),
  );
  const missing = REQUIRED.filter((name) => !names.includes(name));
  if (missing.length > 0) {
    throw new Error(`pages: ${embedDir} has no ${missing.join(', ')}; run make build first`);
  }
  return Promise.all(
    names.map(async (name) => ({ name, bytes: await readFile(join(embedDir, name)) })),
  );
}

/**
 * Add this build to the site as <id>/ and point latest.txt at it. An existing <id>/ is left alone.
 * With a pagePath, the full single-file page becomes the site's index.html and 404.html, so the
 * site itself shows the latest build and any wrong path on it gets the 404 page.
 * @param {{ embedDir: string, siteDir: string, baseUrl: string, pagePath?: string }} options
 * @returns {Promise<{ id: string, created: boolean }>}
 */
export async function publish({ embedDir, siteDir, baseUrl, pagePath }) {
  checkBaseUrl(baseUrl);
  const files = await readEmbed(embedDir);
  const id = releaseId(files);
  const folder = join(siteDir, id);
  await writeFile(join(siteDir, 'latest.txt'), `${id}\n`);
  if (pagePath) {
    const page = await readFile(pagePath);
    await Promise.all(
      ['index.html', '404.html'].map((name) => writeFile(join(siteDir, name), page)),
    );
  }
  if (existsSync(folder)) return { id, created: false };

  const bytes = Object.fromEntries(files.map((file) => [file.name, file.bytes]));
  const snippet = webflowSnippet({
    baseUrl,
    id,
    css: sri(bytes['benjo-404.css']),
    js: sri(bytes['benjo-404.js']),
    body: bytes['404-body.html'].toString('utf8'),
  });
  // Write into a staging folder and rename it, so a failed run never leaves half a build behind.
  const staging = join(siteDir, `.${id}.tmp`);
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging);
  await Promise.all([
    ...files.map((file) => writeFile(join(staging, file.name), file.bytes)),
    writeFile(join(staging, 'webflow.txt'), snippet),
  ]);
  await rename(staging, folder);
  return { id, created: true };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const { values } = parseArgs({
    options: {
      embed: { type: 'string', default: fileURLToPath(new URL('../dist/embed', import.meta.url)) },
      site: { type: 'string' },
      base: { type: 'string' },
      page: { type: 'string' },
    },
  });
  if (!values.site || !values.base) {
    console.error(
      'usage: node build/pages.js --site <dir> --base <https url> [--embed <dir>] [--page <file>]',
    );
    process.exitCode = 2;
  } else {
    publish({
      embedDir: values.embed,
      siteDir: values.site,
      baseUrl: values.base,
      pagePath: values.page,
    })
      .then(({ id, created }) => {
        console.log(`[pages] ${created ? 'added' : 'already have'} ${id}`);
      })
      .catch((error) => {
        console.error(`[pages] failed: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      });
  }
}
