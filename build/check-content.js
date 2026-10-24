// @ts-check
// Pure content checks on built output: CSP hashes, banned APIs, leftover tokens, stray URLs.
import { escapeHtml, extractInline, singleFileCsp, validateCtaHref } from './inline.js';

/** An identifier for createElementNS. Browsers never fetch it. */
export const SVG_NS = 'http://www.w3.org/2000/svg';
/** The one source file that may name localStorage. */
export const STORAGE_FILE = 'src/shell/storage.js';

/** APIs that inject markup, run strings as code, or reach the network. */
export const BANNED = [
  { name: 'innerHTML', pattern: /\binnerHTML\b/ },
  { name: 'outerHTML', pattern: /\bouterHTML\b/ },
  { name: 'insertAdjacentHTML', pattern: /\binsertAdjacentHTML\b/ },
  { name: 'document.write', pattern: /\bdocument\s*\.\s*write/ },
  { name: 'new Function', pattern: /\bnew\s+Function\b/ },
  { name: 'eval(', pattern: /\beval\s*\(/ },
  { name: 'fetch(', pattern: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/ },
  { name: 'WebSocket', pattern: /\bWebSocket\b/ },
  { name: 'EventSource', pattern: /\bEventSource\b/ },
  { name: 'sendBeacon', pattern: /\bsendBeacon\b/ },
  { name: 'localStorage', pattern: /\blocalStorage\b/ },
  { name: 'sessionStorage', pattern: /\bsessionStorage\b/ },
];
const URL_PATTERN = /https?:\/\/[^\s"'`<>()\\]*/gi;
const TOKEN_PATTERN = /\{\{\s*[A-Za-z_]+\s*\}\}/g;

/**
 * @param {string} policy
 * @param {string} name
 */
const directive = (policy, name) =>
  policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `)) ?? '';

/**
 * Recompute the inline hashes and compare them to the header the build wrote.
 * @param {string} html
 * @param {string} csp contents of dist/csp.txt
 * @returns {string[]}
 */
export function checkCsp(html, csp) {
  let inline;
  try {
    inline = extractInline(html);
  } catch (error) {
    return [`404.html: ${error instanceof Error ? error.message : error}`];
  }
  const expected = singleFileCsp(inline);
  const actual = csp.trim();
  if (actual === expected) return [];
  const problems = ['script-src', 'style-src']
    .filter((name) => directive(actual, name) !== directive(expected, name))
    .map((name) => `csp.txt: ${name} hash does not match 404.html`);
  return problems.length > 0 ? problems : ['csp.txt: header differs from the expected policy'];
}

/**
 * @param {string} text
 * @param {{ allow?: string[] }} [options] banned names that are fine in this text
 * @returns {string[]} the banned names found
 */
export function findBanned(text, { allow = [] } = {}) {
  return BANNED.filter(({ name, pattern }) => !allow.includes(name) && pattern.test(text)).map(
    ({ name }) => name,
  );
}

/**
 * @param {string} text
 * @param {string[]} allowed exact URLs that may appear
 * @returns {string[]} every other http or https URL
 */
export function findStrayUrls(text, allowed) {
  return (text.match(URL_PATTERN) ?? []).filter((url) => !allowed.includes(url));
}

/**
 * Template tokens anywhere, and any `{{` outside the minified script, where `{{` can be code.
 * @param {string} html
 * @returns {string[]}
 */
export function findLeftoverTokens(html) {
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const tokens = html.match(TOKEN_PATTERN) ?? [];
  return tokens.length > 0 || !markup.includes('{{') ? tokens : ['{{'];
}

/**
 * @param {string} html
 * @returns {string | null} the Return Home href, unescaped
 */
export function readCtaHref(html) {
  const match = html.match(/<a\b[^>]*\bid="m-cta"[^>]*\bhref="([^"]*)"/);
  if (!match) return null;
  return match[1]
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Everything checkable from dist/404.html and dist/csp.txt alone.
 * @param {{ html: string, csp: string, ctaHrefs: string[] }} input ctaHrefs: every message's href
 * @returns {string[]}
 */
export function checkPage({ html, csp, ctaHrefs }) {
  const problems = checkCsp(html, csp);
  const href = readCtaHref(html);
  const valid = ctaHrefs.filter((candidate) => {
    try {
      return validateCtaHref(candidate) === candidate;
    } catch {
      problems.push(`message CTA href is not allowed: ${JSON.stringify(candidate)}`);
      return false;
    }
  });
  if (href === null) problems.push('404.html: no Return Home link (#m-cta)');
  else if (!valid.includes(href))
    problems.push(`404.html: CTA href ${JSON.stringify(href)} is not a validated message href`);
  for (const token of findLeftoverTokens(html))
    problems.push(`404.html: leftover template token ${token}`);
  for (const url of findStrayUrls(html, [SVG_NS, ...valid, ...valid.map(escapeHtml)]))
    problems.push(`404.html: external URL ${url}`);
  const script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? '';
  for (const name of findBanned(script, { allow: ['localStorage'] })) {
    problems.push(`404.html: script uses banned ${name}`);
  }
  return problems;
}
