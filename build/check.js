// @ts-check
// Checks dist/ after a build: byte budgets, CSP hashes, banned strings, leftover tokens, URLs.
// `node build/check.js --print` also prints the size table with budget headroom.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

import {
  checkPage,
  findBanned,
  findLeftoverTokens,
  findStrayUrls,
  STORAGE_FILE,
  SVG_NS,
  stripIconDataUrls,
} from './check-content.js';
import { listMessages } from './entry.js';
import { EMBED_CSP } from './inline.js';

export * from './check-content.js';

const REPO_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const LOADERS = /** @type {Record<string, import('esbuild').Loader>} */ ({
  '.js': 'js',
  '.ts': 'ts',
  '.css': 'css',
});

/**
 * @typedef {{ raw: number, gzip: number }} Size
 * @typedef {{ shell: Size, fonts: Size, games: Record<string, Size>,
 *   themes: Record<string, Size>, total: Size }} Sizes
 * @typedef {Record<string, number>} Budgets
 * @typedef {{ part: string, raw: number, gzip: number, value: number, budget: number | undefined,
 *   unit: 'gzip' | 'raw' }} BudgetRow
 */

/**
 * One row per budgeted part. Every row is measured gzipped except the raw total.
 * @param {Sizes} sizes
 * @param {Budgets} budgets
 * @returns {BudgetRow[]}
 */
export function budgetRows(sizes, budgets) {
  /** @type {(part: string, size: Size, budget: number | undefined, unit?: 'gzip' | 'raw') => BudgetRow} */
  const row = (part, size, budget, unit = 'gzip') => ({
    part,
    ...size,
    value: size[unit],
    budget,
    unit,
  });
  return [
    row('shell', sizes.shell, budgets.shell),
    row('fonts', sizes.fonts, budgets.fonts),
    ...Object.entries(sizes.games ?? {}).map(([id, size]) => row(`game ${id}`, size, budgets.game)),
    ...Object.entries(sizes.themes ?? {}).map(([id, size]) =>
      row(`theme ${id}`, size, budgets.theme),
    ),
    row('total', sizes.total, budgets.total),
    row('total (raw)', sizes.total, budgets.totalRaw, 'raw'),
  ];
}

/**
 * @param {Sizes} sizes
 * @param {Budgets} budgets
 * @returns {string[]} one problem per part that is over budget or has no budget
 */
export function checkBudgets(sizes, budgets) {
  return budgetRows(sizes, budgets).flatMap(({ part, value, budget, unit }) => {
    if (typeof budget !== 'number') return [`${part}: no budget in budgets.json`];
    if (value > budget) return [`${part}: ${value} ${unit} bytes is over the ${budget} budget`];
    return [];
  });
}

/**
 * @param {BudgetRow[]} rows
 * @returns {string} a plain text table with headroom (budget minus measured bytes)
 */
export function formatTable(rows) {
  const header = ['part', 'raw', 'gzip', 'budget', 'headroom'];
  const body = rows.map(({ part, raw, gzip, value, budget, unit }) => [
    part,
    String(raw),
    String(gzip),
    budget === undefined ? '-' : `${budget} ${unit}`,
    budget === undefined ? '-' : String(budget - value),
  ]);
  const widths = header.map((_, column) =>
    Math.max(...[header, ...body].map((cells) => cells[column].length)),
  );
  return [header, ...body]
    .map((cells) =>
      cells
        .map((cell, column) =>
          (column === 0 ? cell.padEnd : cell.padStart).call(cell, widths[column]),
        )
        .join('  '),
    )
    .join('\n');
}

/**
 * The text of a source file with comments removed, so a comment may name a banned API.
 * @param {string} file
 * @param {string} text
 */
async function codeOnly(file, text) {
  const loader = LOADERS[extname(file)];
  if (!loader) return text;
  const result = await esbuild.transform(text, {
    loader,
    minifyWhitespace: true,
    legalComments: 'none',
  });
  return result.code;
}

/** @param {string} dir */
async function listFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * Grep src/ for banned strings and URLs, ignoring comments.
 * @param {string} root
 * @param {string[]} ctaHrefs URLs that may appear in src/messages/
 * @returns {Promise<string[]>}
 */
export async function checkSource(root, ctaHrefs) {
  const problems = [];
  for (const file of (await listFiles(join(root, 'src'))).sort()) {
    const name = relative(root, file).split(sep).join('/');
    const text = await readFile(file, 'utf8');
    const code = extname(file) === '.html' ? stripIconDataUrls(text) : await codeOnly(file, text);
    const allow = name === STORAGE_FILE ? ['localStorage'] : [];
    for (const banned of findBanned(code, { allow }))
      problems.push(`${name}: uses banned ${banned}`);
    const allowed = name.startsWith('src/messages/') ? [SVG_NS, ...ctaHrefs] : [SVG_NS];
    for (const url of findStrayUrls(code, allowed)) problems.push(`${name}: external URL ${url}`);
  }
  return problems;
}

/** @param {string} root */
async function loadCtaHrefs(root) {
  const modules = await Promise.all(
    listMessages(join(root, 'src', 'messages')).map(({ file }) => import(pathToFileURL(file).href)),
  );
  return modules
    .map((module) => module.default?.cta?.href)
    .filter((href) => typeof href === 'string');
}

/**
 * dist/embed/: the same bans as the page, and its own fixed CSP.
 * @param {string} embedDir
 * @param {string[]} allowed
 */
async function checkEmbed(embedDir, allowed) {
  const read = (/** @type {string} */ name) => readFile(join(embedDir, name), 'utf8');
  const [body, script, style, csp] = await Promise.all(
    ['404-body.html', 'benjo-404.js', 'benjo-404.css', 'csp.txt'].map(read),
  );
  const problems = [];
  if (csp.trim() !== EMBED_CSP) problems.push('embed/csp.txt: differs from the embed policy');
  for (const token of findLeftoverTokens(body))
    problems.push(`embed/404-body.html: leftover token ${token}`);
  for (const name of findBanned(script, { allow: ['localStorage'] }))
    problems.push(`embed/benjo-404.js: uses banned ${name}`);
  for (const [name, text] of [
    ['404-body.html', body],
    ['benjo-404.js', script],
    ['benjo-404.css', style],
  ]) {
    for (const url of findStrayUrls(text, allowed))
      problems.push(`embed/${name}: external URL ${url}`);
  }
  return problems;
}

/**
 * Run every check against a built dist/.
 * @param {{ root?: string, distDir?: string, budgets?: Budgets }} [options]
 */
export async function runChecks(options = {}) {
  const root = options.root ?? REPO_ROOT;
  const distDir = options.distDir ?? join(root, 'dist');
  const read = (/** @type {string} */ file) => readFile(file, 'utf8');
  const budgets = options.budgets ?? JSON.parse(await read(join(root, 'budgets.json')));
  const sizes = JSON.parse(await read(join(distDir, 'sizes.json')));
  const html = await read(join(distDir, '404.html'));
  const csp = await read(join(distDir, 'csp.txt'));
  const ctaHrefs = await loadCtaHrefs(root);
  const allowed = [SVG_NS, ...ctaHrefs];
  const problems = [
    ...checkBudgets(sizes, budgets),
    ...checkPage({ html, csp, ctaHrefs }),
    ...(await checkEmbed(join(distDir, 'embed'), allowed)),
    ...(await checkSource(root, ctaHrefs)),
  ];
  return { problems, rows: budgetRows(sizes, budgets) };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runChecks()
    .then(({ problems, rows }) => {
      if (process.argv.includes('--print')) console.log(formatTable(rows));
      for (const problem of problems) console.error(`[check] ${problem}`);
      if (problems.length > 0) process.exitCode = 1;
      else console.log('[check] dist/ passes budgets, CSP hashes, and content checks');
    })
    .catch((error) => {
      console.error(`[check] failed: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    });
}
