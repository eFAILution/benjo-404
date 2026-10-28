// @ts-check
// The only way the shell builds DOM: createElement, setAttribute on an allowlist, and text nodes.

export const ID_PATTERN = /^[a-z0-9-]{1,32}$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const QUERY_KEYS = ['message', 'game', 'theme', 'date', 'rm', 'debug'];
const ALLOWED_ATTRIBUTES = new Set(['class', 'id', 'type', 'role', 'hidden', 'tabindex']);

/**
 * @param {string} name
 * @returns {boolean}
 */
function isAllowedAttribute(name) {
  return ALLOWED_ATTRIBUTES.has(name) || /^(aria|data)-[a-z-]+$/.test(name);
}

/**
 * Build an element. Attributes outside the allowlist throw, so no caller can set href, src, or on*.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, string | boolean>} [attrs]
 * @param {Array<string | Node | null | undefined | false>} [children]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (!isAllowedAttribute(name)) throw new Error(`dom.el: attribute not allowed: ${name}`);
    if (value === false) continue;
    node.setAttribute(name, value === true ? '' : value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/**
 * Replace a node's children with one text node.
 * @param {Node} node
 * @param {string} value
 */
export function text(node, value) {
  node.textContent = value;
}

/**
 * @param {string} id
 * @returns {HTMLElement | null}
 */
export function byId(id) {
  return document.getElementById(id);
}

/**
 * Keep only the known query keys whose values pass the id or date pattern.
 * @param {string} search location.search
 * @returns {Record<string, string>}
 */
export function readQuery(search) {
  const params = new URLSearchParams(search);
  /** @type {Record<string, string>} */
  const query = {};
  for (const key of QUERY_KEYS) {
    const value = params.get(key);
    if (value === null) continue;
    const pattern = key === 'date' ? DATE_PATTERN : ID_PATTERN;
    if (pattern.test(value)) query[key] = value;
  }
  return query;
}
