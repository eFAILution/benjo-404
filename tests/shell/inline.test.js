import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  escapeHtml,
  extractInline,
  fillFontsCss,
  fillTemplate,
  sha256Base64,
  singleFileCsp,
  TEXT_TOKENS,
  validateCtaHref,
} from '../../build/inline.js';

const TEXT = {
  THEME_PIN: 'auto',
  TITLE: 'title',
  KICKER: 'kicker',
  CODE: '404',
  BODY: 'body',
  CTA_HREF: '/',
  CTA_LABEL: 'Return Home',
};
const RAW = { FONTS_CSS: '', STYLE: 'a{b:c}', SCRIPT: 'let x=1;' };

describe('escapeHtml', () => {
  it('escapes each of < > & " \'', () => {
    assert.equal(escapeHtml('<'), '&lt;');
    assert.equal(escapeHtml('>'), '&gt;');
    assert.equal(escapeHtml('&'), '&amp;');
    assert.equal(escapeHtml('"'), '&quot;');
    assert.equal(escapeHtml("'"), '&#39;');
    assert.equal(escapeHtml('a&lt;'), 'a&amp;lt;');
  });
});

describe('fillTemplate', () => {
  const evil = `<script>alert("x")</script>&'`;
  const escaped = '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;';

  for (const token of TEXT_TOKENS.filter((name) => name !== 'CTA_HREF')) {
    it(`escapes <>&"' in {{${token}}}`, () => {
      const out = fillTemplate(`[{{${token}}}]`, { text: { ...TEXT, [token]: evil }, raw: RAW });
      assert.equal(out, `[${escaped}]`);
    });
  }

  it('fills raw build outputs as is', () => {
    const out = fillTemplate('<style>{{STYLE}}</style><script>{{SCRIPT}}</script>', {
      text: TEXT,
      raw: RAW,
    });
    assert.equal(out, '<style>a{b:c}</style><script>let x=1;</script>');
  });

  it('never re-expands tokens that appear inside filled text', () => {
    const out = fillTemplate('{{BODY}}|{{SCRIPT}}', {
      text: { ...TEXT, BODY: '{{SCRIPT}}' },
      raw: RAW,
    });
    assert.equal(out, '{{SCRIPT}}|let x=1;');
  });

  it('rejects unknown and missing tokens', () => {
    assert.throws(() => fillTemplate('{{NOPE}}', { text: TEXT, raw: RAW }), /unknown/);
    assert.throws(() => fillTemplate('{{BODY}}', { text: {}, raw: RAW }), /missing/);
  });

  it('rejects a script or style that would close its element', () => {
    const script = { ...RAW, SCRIPT: 'a="</script><b>"' };
    assert.throws(() => fillTemplate('{{SCRIPT}}', { text: TEXT, raw: script }), /closing tag/);
    const style = { ...RAW, STYLE: 'a{}</STYLE>' };
    assert.throws(() => fillTemplate('{{STYLE}}', { text: TEXT, raw: style }), /closing tag/);
  });
});

describe('validateCtaHref', () => {
  it('accepts site paths and https URLs', () => {
    for (const href of ['/', '/home', '/a/b_c-d', 'https://beast-code.com/', 'https://a.b/c?d=1']) {
      assert.equal(validateCtaHref(href), href);
    }
  });

  it('rejects everything else', () => {
    const bad = [
      'javascript:alert(1)',
      'http://beast-code.com/',
      '//evil.example/',
      'https://beast-code.com',
      '/Home',
      '/a b',
      'https://a.b/"onmouseover=x',
      'data:text/html,x',
      '',
      null,
    ];
    for (const href of bad) assert.throws(() => validateCtaHref(href), /not allowed/, String(href));
  });

  it('fails the template fill on a bad CTA_HREF', () => {
    const text = { ...TEXT, CTA_HREF: 'javascript:alert(1)' };
    assert.throws(() => fillTemplate('{{CTA_HREF}}', { text, raw: RAW }), /not allowed/);
  });
});

describe('hashes and CSP', () => {
  it('sha256Base64 matches known values', () => {
    assert.equal(sha256Base64('benjo-404'), 'DwzcIeeySaCcacOGAHC7ibu1GV1BRcMCDv1ptoqmONw=');
    assert.equal(sha256Base64(''), '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
  });

  it('extracts the exact inline contents and hashes them into the header', () => {
    const html = '<style>a{}</style><script type="module">go()</script>';
    const inline = extractInline(html);
    assert.deepEqual(inline, { style: 'a{}', script: 'go()' });
    const csp = singleFileCsp(inline);
    assert.match(csp, /^default-src 'none'; /);
    assert.ok(csp.includes(`script-src 'sha256-${sha256Base64('go()')}'`));
    assert.ok(csp.includes(`style-src 'sha256-${sha256Base64('a{}')}'`));
    assert.ok(!csp.includes('unsafe'));
  });

  it('refuses a page with more than one script', () => {
    const html = '<style></style><script type="module"></script><script type="module"></script>';
    assert.throws(() => extractInline(html), /expected one style and one script/);
  });
});

describe('fillFontsCss', () => {
  const css = [
    "@font-face { font-family: 'B404 Sans'; src: url({{FONT_SANS}}) format('woff2'); }",
    "@font-face { font-family: 'B404 Mono'; src: url({{FONT_MONO}}) format('woff2'); }",
  ].join('\n');

  it('fills both fonts', () => {
    const { css: out, dropped } = fillFontsCss(css, { FONT_SANS: 'data:a', FONT_MONO: 'data:b' });
    assert.ok(out.includes('url(data:a)') && out.includes('url(data:b)'));
    assert.deepEqual(dropped, []);
  });

  it('drops the rule for a missing font', () => {
    const { css: out, dropped } = fillFontsCss(css, { FONT_SANS: null, FONT_MONO: 'data:b' });
    assert.ok(!out.includes('B404 Sans'));
    assert.ok(out.includes('url(data:b)'));
    assert.deepEqual(dropped, ['FONT_SANS']);
  });
});
