// @ts-check
// The favicon: the Benjo mark in white on a brand red rounded square, built from the sprite in
// src/assets/benjo.js at build time and inlined as a data: URL, so the page never asks for
// /favicon.ico (which default-src 'none' would block).
/** @typedef {import('../src/contracts').Sprite} Sprite */

const SVG_NS = 'http://www.w3.org/2000/svg';
const BRAND_RED = '#D72228';
const MARK_FILL = '#fff';
/** Space around the mark, as a fraction of its size, so the corners never clip it. */
const PAD_RATIO = 0.1;
/** Corner radius as a fraction of the square. */
const CORNER_RATIO = 0.18;
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/;

/** @param {number} value */
const round = (value) => Math.round(value * 100) / 100;

/**
 * @param {Sprite} sprite
 * @returns {string} standalone SVG markup
 */
export function faviconSvg(sprite) {
  const [x, y, width, height] = sprite.viewBox;
  const side = Math.max(width, height) * (1 + 2 * PAD_RATIO);
  const left = round(x + width / 2 - side / 2);
  const top = round(y + height / 2 - side / 2);
  const box = `${left} ${top} ${round(side)} ${round(side)}`;
  const paths = sprite.paths.map(({ d }) => {
    if (!PATH_DATA.test(d)) throw new Error('favicon: sprite path data has unexpected characters');
    return `<path fill="${MARK_FILL}" d="${d}"/>`;
  });
  return [
    `<svg xmlns="${SVG_NS}" viewBox="${box}">`,
    `<rect x="${left}" y="${top}" width="${round(side)}" height="${round(side)}" `,
    `rx="${round(side * CORNER_RATIO)}" fill="${BRAND_RED}"/>`,
    ...paths,
    '</svg>',
  ].join('');
}

/**
 * @param {Sprite} sprite
 * @returns {string} data:image/svg+xml URL, percent-encoded
 */
export function faviconDataUrl(sprite) {
  return `data:image/svg+xml,${encodeURIComponent(faviconSvg(sprite))}`;
}
