import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { faviconDataUrl, faviconSvg } from '../../build/favicon.js';
import { validateFaviconHref } from '../../build/inline.js';
import { benjo } from '../../src/assets/benjo.js';

const PREFIX = 'data:image/svg+xml,';

describe('faviconSvg', () => {
  const svg = faviconSvg(benjo);

  it('draws a brand red rounded square behind the mark', () => {
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[\d. ]+">/);
    assert.match(svg, /<rect [^>]*rx="\d+(\.\d+)?" [^>]*fill="#d72228"\/>/);
    assert.ok(svg.endsWith('</svg>'));
  });

  it('uses every Benjo path from src/assets/benjo.js in white', () => {
    const paths = [...svg.matchAll(/<path fill="#fff" d="([^"]+)"\/>/g)].map((match) => match[1]);
    assert.deepEqual(
      paths,
      benjo.paths.map(({ d }) => d),
    );
  });

  it('keeps the mark inside the square', () => {
    const [x, y, width, height] = svg
      .match(/viewBox="([^"]+)"/)[1]
      .split(' ')
      .map(Number);
    const [mx, my, mw, mh] = benjo.viewBox;
    assert.ok(x < mx && y < my && x + width > mx + mw && y + height > my + mh);
  });

  it('refuses path data that is not plain path commands', () => {
    const bad = { ...benjo, paths: [{ d: 'M0 0"/><script>' }] };
    assert.throws(() => faviconSvg(bad), /path data/);
  });
});

describe('faviconDataUrl', () => {
  const url = faviconDataUrl(benjo);

  it('is a URL-encoded SVG data URL that decodes back to the generated SVG', () => {
    assert.ok(url.startsWith(PREFIX));
    assert.equal(decodeURIComponent(url.slice(PREFIX.length)), faviconSvg(benjo));
    assert.doesNotMatch(url, /[<>"'\s#]/);
  });

  it('passes the template validator', () => {
    assert.equal(validateFaviconHref(url), url);
  });
});

describe('validateFaviconHref', () => {
  it('rejects anything but an encoded SVG data URL', () => {
    const bad = [
      'https://beast-code.com/favicon.ico',
      '/favicon.ico',
      'data:text/html,%3Cscript%3E',
      'data:image/svg+xml,<svg>',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/svg+xml,%3Csvg%3E"onload=x',
      '',
      null,
    ];
    for (const href of bad) {
      assert.throws(() => validateFaviconHref(href), /not allowed/, String(href));
    }
  });
});
