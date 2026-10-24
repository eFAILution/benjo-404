// @ts-check
// Pure content checks on built output: CSP hashes, banned APIs, leftover tokens, stray URLs.
import { escapeHtml, extractInline, sha256Base64, validateCtaHref } from './inline.js';

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
 * The source list of one directive, or null when the policy does not have it.
 * @param {string} policy
 * @param {string} name
 * @returns {string[] | null}
 */
function sources(policy, name) {
  const found = policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([directive]) => directive === name);
  return found ? found.slice(1) : null;
}

/**
 * Recompute the inline hashes and compare them to the script-src and style-src hashes in
 * csp.txt. Other directives are the build's business, so they are not pinned here.
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
  const expected = { 'script-src': inline.script, 'style-src': inline.style };
  return Object.entries(expected).flatMap(([name, content]) => {
    const list = sources(csp, name);
    if (!list) return [`csp.txt: no ${name} directive`];
    const hashes = list.filter((source) => source.startsWith("'sha256-"));
    const loose = list.filter((source) => !source.startsWith("'sha256-"));
    const problems = [];
    if (hashes.length !== 1 || hashes[0] !== `'sha256-${sha256Base64(content)}'`) {
      problems.push(`csp.txt: ${name} hash does not match 404.html`);
    }
    if (loose.length > 0)
      problems.push(`csp.txt: ${name} allows more than the hash: ${loose.join(' ')}`);
    return problems;
  });
}

/**
 * Blank the href of `<link rel="icon">` tags whose href is an inline `data:image/` URL. Such a
 * favicon is never fetched, but an SVG one carries the SVG namespace inside it.
 * @param {string} html
 * @returns {string}
 */
export function stripIconDataUrls(html) {
  return html.replace(/<link\b[^>]*>/gi, (tag) =>
    /\brel=["']?[^"'>]*\bicon\b/i.test(tag)
      ? tag.replace(/\bhref=("data:image\/[^"]*"|'data:image\/[^']*')/i, 'href=""')
      : tag,
  );
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
  const allowed = [SVG_NS, ...valid, ...valid.map(escapeHtml)];
  for (const url of findStrayUrls(stripIconDataUrls(html), allowed))
    problems.push(`404.html: external URL ${url}`);
  const script = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? '';
  for (const name of findBanned(script, { allow: ['localStorage'] })) {
    problems.push(`404.html: script uses banned ${name}`);
  }
  return problems;
}
