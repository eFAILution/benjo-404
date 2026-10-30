import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { SVG_NS } from '../../src/assets/benjo.js';
import { svgIcon } from '../../src/shell/dom.js';

/** Just enough of document for svgIcon: elements record their namespace, attributes, and children. */
function fakeDocument() {
  return {
    createElementNS(ns, tag) {
      const attrs = new Map();
      return {
        ns,
        tag,
        attrs,
        children: [],
        setAttribute: (name, value) => attrs.set(name, value),
        appendChild(child) {
          this.children.push(child);
        },
      };
    },
  };
}

describe('svgIcon', () => {
  let saved;
  beforeEach(() => {
    saved = globalThis.document;
    globalThis.document = fakeDocument();
  });
  afterEach(() => {
    globalThis.document = saved;
  });

  it('builds a hidden, unfocusable svg of paths in the SVG namespace', () => {
    const svg = svgIcon({
      viewBox: '0 0 24 24',
      size: 20,
      paths: [
        { d: 'M0 0h1', class: 'a' },
        { d: 'M1 1h1', fill: 'currentColor' },
      ],
    });
    assert.equal(svg.ns, SVG_NS);
    assert.equal(svg.tag, 'svg');
    assert.equal(svg.attrs.get('viewBox'), '0 0 24 24');
    assert.equal(svg.attrs.get('width'), '20');
    assert.equal(svg.attrs.get('aria-hidden'), 'true');
    assert.equal(svg.attrs.get('focusable'), 'false');
    assert.deepEqual(
      svg.children.map((p) => [p.tag, p.attrs.get('d'), p.attrs.get('class'), p.attrs.get('fill')]),
      [
        ['path', 'M0 0h1', 'a', undefined],
        ['path', 'M1 1h1', undefined, 'currentColor'],
      ],
    );
  });

  it('leaves the size to CSS when none is given', () => {
    const svg = svgIcon({ viewBox: '0 0 1 1', paths: [] });
    assert.equal(svg.attrs.has('width'), false);
  });

  it('throws on an attribute outside its allowlist', () => {
    assert.throws(
      () => svgIcon({ viewBox: '0 0 1 1', paths: [{ d: 'M0 0', onload: 'x' }] }),
      /attribute not allowed: onload/,
    );
  });
});
