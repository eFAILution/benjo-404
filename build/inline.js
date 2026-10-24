// @ts-check
// Pure helpers for the build: template filling, escaping, href validation, CSP hashes.
import { createHash } from 'node:crypto';

/** Tokens filled with escaped text. */
export const TEXT_TOKENS = [
  'THEME_PIN',
  'TITLE',
  'KICKER',
  'CODE',
  'BODY',
  'CTA_HREF',
  'CTA_LABEL',
];
/** Tokens filled with build output (never with config or message text). */
export const RAW_TOKENS = ['FONTS_CSS', 'STYLE', 'SCRIPT'];

const CTA_PATTERNS = [/^\/[a-z0-9/_-]*$/, /^https:\/\/[a-z0-9.-]+\/[^\s"'<>]*$/];
const ESCAPES = /** @type {Record<string, string>} */ ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});
/** Sequences that would end or confuse the inline element they sit in. */
const RAW_GUARDS = /** @type {Record<string, RegExp>} */ ({
  SCRIPT: /<\/script|<!--/i,
  STYLE: /<\/style/i,
  FONTS_CSS: /<\/style/i,
});

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * @param {unknown} href
 * @returns {string} the href, unchanged, when it is a site path or an https URL
 */
export function validateCtaHref(href) {
  if (typeof href === 'string' && CTA_PATTERNS.some((pattern) => pattern.test(href))) return href;
  throw new Error(`CTA href is not allowed: ${JSON.stringify(href)}`);
}

/**
 * Fill every {{TOKEN}} in one pass, so text that contains "{{SCRIPT}}" is never re-expanded.
 * @param {string} template
 * @param {{ text: Record<string, string>, raw: Record<string, string> }} values
 * @returns {string}
 */
export function fillTemplate(template, { text, raw }) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, name) => {
    if (TEXT_TOKENS.includes(name)) {
      if (typeof text[name] !== 'string') throw new Error(`missing text token ${name}`);
      const value = name === 'CTA_HREF' ? validateCtaHref(text[name]) : text[name];
      return escapeHtml(value);
    }
    if (RAW_TOKENS.includes(name)) {
      if (typeof raw[name] !== 'string') throw new Error(`missing build output ${name}`);
      if (RAW_GUARDS[name]?.test(raw[name])) throw new Error(`${name} contains a closing tag`);
      return raw[name];
    }
    throw new Error(`unknown template token {{${name}}}`);
  });
}

/**
 * @param {string | Buffer} content
 * @returns {string} base64 sha256, as CSP expects
 */
export function sha256Base64(content) {
  return createHash('sha256').update(content).digest('base64');
}

/**
 * The exact contents of the single inline <style> and <script type="module">.
 * @param {string} html
 * @returns {{ style: string, script: string }}
 */
export function extractInline(html) {
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  if (styles.length !== 1 || scripts.length !== 1) {
    throw new Error(
      `expected one style and one script, found ${styles.length} and ${scripts.length}`,
    );
  }
  return { style: styles[0][1], script: scripts[0][1] };
}

/**
 * CSP header for the single file: only the hashed inline script and style, fonts from data:.
 * @param {{ style: string, script: string }} inline
 */
export function singleFileCsp({ style, script }) {
  return [
    "default-src 'none'",
    `script-src 'sha256-${sha256Base64(script)}'`,
    `style-src 'sha256-${sha256Base64(style)}'`,
    'font-src data:',
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** CSP header for dist/embed/, where script, style, and fonts are files on the same origin. */
export const EMBED_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Fill {{FONT_*}} in fonts.css. An @font-face whose font is missing is dropped.
 * @param {string} css
 * @param {Record<string, string | null>} urls e.g. { FONT_SANS: 'data:...', FONT_MONO: null }
 * @returns {{ css: string, dropped: string[] }}
 */
export function fillFontsCss(css, urls) {
  /** @type {string[]} */
  const dropped = [];
  const rules = css.match(/@font-face\s*\{(?:[^{}]|\{\{[A-Z_]+\}\})*\}/g) ?? [];
  const kept = rules.filter((rule) => {
    const tokens = [...rule.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((match) => match[1]);
    const missing = tokens.filter((token) => !urls[token]);
    dropped.push(...missing);
    return missing.length === 0;
  });
  const filled = kept
    .map((rule) => rule.replace(/\{\{([A-Z_]+)\}\}/g, (_match, token) => String(urls[token])))
    .join('\n');
  return { css: filled, dropped };
}
