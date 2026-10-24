// build/check.js on small inputs: each rule fails on a bad input and passes a clean one.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  BANNED,
  budgetRows,
  checkBudgets,
  checkCsp,
  checkPage,
  checkSource,
  findBanned,
  findLeftoverTokens,
  findStrayUrls,
  formatTable,
  SVG_NS,
} from '../../build/check.js';
import { extractInline, singleFileCsp } from '../../build/inline.js';

const SIZES = {
  shell: { raw: 300, gzip: 100 },
  fonts: { raw: 200, gzip: 150 },
  games: { runner: { raw: 120, gzip: 60 } },
  themes: { default: { raw: 40, gzip: 20 }, halloween: { raw: 50, gzip: 25 } },
  total: { raw: 700, gzip: 400 },
};
const BUDGETS = { shell: 100, fonts: 150, game: 60, theme: 25, total: 400, totalRaw: 700 };

/** @param {{ script?: string, style?: string, href?: string, body?: string, head?: string }} [parts] */
function page({
  script = 'let x=1;',
  style = 'a{b:c}',
  href = '/',
  body = 'Not found',
  head = '',
} = {}) {
  return [
    `<!doctype html><html><head><title>404</title>${head}`,
    `<style>${style}</style></head><body>`,
    `<p>${body}</p><a class="btn" id="m-cta" href="${href}">Return Home</a>`,
    `<script type="module">${script}</script></body></html>`,
  ].join('');
}
const cspFor = (/** @type {string} */ html) => singleFileCsp(extractInline(html));
const clean = (/** @type {string} */ html) => ({ html, csp: cspFor(html), ctaHrefs: ['/'] });

describe('checkBudgets', () => {
  it('passes when every part is at or under budget', () => {
    assert.deepEqual(checkBudgets(SIZES, BUDGETS), []);
  });

  it('fails each part that is over a tiny budget', () => {
    const tiny = { shell: 1, fonts: 1, game: 1, theme: 1, total: 1, totalRaw: 1 };
    const problems = checkBudgets(SIZES, tiny);
    assert.equal(problems.length, budgetRows(SIZES, tiny).length);
    assert.match(problems.join('\n'), /game runner: 60 gzip bytes is over the 1 budget/);
    assert.match(problems.join('\n'), /total \(raw\): 700 raw bytes is over the 1 budget/);
  });

  it('checks every game and theme against the per-entry budget', () => {
    const sizes = { ...SIZES, themes: { ...SIZES.themes, big: { raw: 90, gzip: 26 } } };
    assert.deepEqual(checkBudgets(sizes, BUDGETS), [
      'theme big: 26 gzip bytes is over the 25 budget',
    ]);
  });

  it('fails a part with no budget', () => {
    const { game: _game, ...noGame } = BUDGETS;
    assert.deepEqual(checkBudgets(SIZES, noGame), ['game runner: no budget in budgets.json']);
  });
});

describe('formatTable', () => {
  it('prints raw, gzip, budget, and headroom per part', () => {
    const table = formatTable(budgetRows(SIZES, { ...BUDGETS, shell: 130 }));
    const shell = table.split('\n').find((line) => line.startsWith('shell'));
    assert.match(table.split('\n')[0], /part\s+raw\s+gzip\s+budget\s+headroom/);
    assert.match(shell ?? '', /^shell\s+300\s+100\s+130 gzip\s+30$/);
  });
});

describe('checkCsp', () => {
  it('passes when csp.txt matches the inline hashes', () => {
    const html = page();
    assert.deepEqual(checkCsp(html, `${cspFor(html)}\n`), []);
  });

  it('fails when the script changed after the hash was taken', () => {
    const csp = cspFor(page());
    assert.deepEqual(checkCsp(page({ script: 'let x=2;' }), csp), [
      'csp.txt: script-src hash does not match 404.html',
    ]);
  });

  it('fails when the style changed after the hash was taken', () => {
    const csp = cspFor(page());
    assert.deepEqual(checkCsp(page({ style: 'a{b:d}' }), csp), [
      'csp.txt: style-src hash does not match 404.html',
    ]);
  });

  it('ignores directives other than script-src and style-src', () => {
    const html = page();
    const csp = cspFor(html).replace('font-src data:', 'font-src data:; img-src data:');
    assert.deepEqual(checkCsp(html, csp), []);
  });

  it('fails when a hashed directive also allows unsafe-inline', () => {
    const html = page();
    const csp = cspFor(html).replace(/(script-src '[^']+')/, "$1 'unsafe-inline'");
    assert.deepEqual(checkCsp(html, csp), [
      "csp.txt: script-src allows more than the hash: 'unsafe-inline'",
    ]);
  });

  it('fails when a hashed directive is missing', () => {
    const html = page();
    const csp = cspFor(html).replace(/style-src [^;]+; /, '');
    assert.deepEqual(checkCsp(html, csp), ['csp.txt: no style-src directive']);
  });
});

describe('findBanned', () => {
  const samples = {
    innerHTML: 'el.innerHTML = s',
    outerHTML: 'el.outerHTML',
    insertAdjacentHTML: 'el.insertAdjacentHTML("x", s)',
    'document.write': 'document.write(s)',
    'new Function': 'new Function("return 1")',
    'eval(': 'eval (s)',
    'fetch(': 'fetch("/x")',
    XMLHttpRequest: 'new XMLHttpRequest()',
    WebSocket: 'new WebSocket(u)',
    EventSource: 'new EventSource(u)',
    sendBeacon: 'navigator.sendBeacon(u)',
    localStorage: 'localStorage.getItem(k)',
    sessionStorage: 'sessionStorage.clear()',
  };

  it('has a sample for every banned name', () => {
    assert.deepEqual(Object.keys(samples).sort(), BANNED.map(({ name }) => name).sort());
  });

  for (const [name, code] of Object.entries(samples)) {
    it(`finds ${name}`, () => assert.deepEqual(findBanned(code), [name]));
  }

  it('ignores lookalike names and allowed names', () => {
    assert.deepEqual(findBanned('const prefetch=1; retrieval(x); myeval(1)'), []);
    assert.deepEqual(findBanned('localStorage.setItem(k, v)', { allow: ['localStorage'] }), []);
  });
});

describe('findStrayUrls and findLeftoverTokens', () => {
  it('allows only exact URLs', () => {
    assert.deepEqual(findStrayUrls(`"${SVG_NS}"`, [SVG_NS]), []);
    assert.deepEqual(findStrayUrls(`"${SVG_NS}.evil.example"`, [SVG_NS]), [
      `${SVG_NS}.evil.example`,
    ]);
    assert.deepEqual(findStrayUrls("src='HTTPS://cdn.example/x.js'", []), [
      'HTTPS://cdn.example/x.js',
    ]);
  });

  it('finds template tokens anywhere and bare {{ outside the script', () => {
    assert.deepEqual(findLeftoverTokens(page({ body: '{{BODY}}' })), ['{{BODY}}']);
    assert.deepEqual(findLeftoverTokens(page({ body: '{{ oops' })), ['{{']);
    assert.deepEqual(findLeftoverTokens(page({ script: 'if(a){{let b=1}}' })), []);
  });
});

describe('checkPage', () => {
  it('passes a clean page', () => {
    assert.deepEqual(checkPage(clean(page())), []);
  });

  it('passes the SVG namespace and a validated https CTA', () => {
    const href = 'https://beast-code.example/';
    const html = page({ href, script: `document.createElementNS("${SVG_NS}","svg")` });
    assert.deepEqual(checkPage({ html, csp: cspFor(html), ctaHrefs: ['/', href] }), []);
  });

  it('fails a stray URL in the markup or the script', () => {
    const markup = page({ body: 'see https://tracker.example/p.gif' });
    const script = page({ script: 'const u="http://cdn.example/x.js"' });
    assert.deepEqual(checkPage(clean(markup)), [
      '404.html: external URL https://tracker.example/p.gif',
    ]);
    assert.deepEqual(checkPage(clean(script)), ['404.html: external URL http://cdn.example/x.js']);
  });

  it('allows a data: favicon, even with the SVG namespace inside', () => {
    const icon = `data:image/svg+xml,%3Csvg xmlns='${SVG_NS}'%3E%3C/svg%3E`;
    const html = page({ head: `<link rel="icon" type="image/svg+xml" href="${icon}">` });
    assert.deepEqual(checkPage(clean(html)), []);
  });

  it('fails a favicon or other link that points at a URL', () => {
    const icon = page({ head: '<link rel="icon" href="https://cdn.example/f.ico">' });
    assert.deepEqual(checkPage(clean(icon)), ['404.html: external URL https://cdn.example/f.ico']);
    const sheet = `<link rel="stylesheet" href="data:text/css,@import 'http://x.example/a.css'">`;
    assert.deepEqual(checkPage(clean(page({ head: sheet }))), [
      '404.html: external URL http://x.example/a.css',
    ]);
  });

  it('fails a leftover template token', () => {
    assert.deepEqual(checkPage(clean(page({ body: '{{KICKER}}' }))), [
      '404.html: leftover template token {{KICKER}}',
    ]);
  });

  it('fails a banned string in the script', () => {
    assert.deepEqual(checkPage(clean(page({ script: 'document.body.innerHTML=s' }))), [
      '404.html: script uses banned innerHTML',
    ]);
  });

  it('fails a CTA href that no message declares, or that does not validate', () => {
    const html = page({ href: '/elsewhere' });
    assert.deepEqual(checkPage(clean(html)), [
      '404.html: CTA href "/elsewhere" is not a validated message href',
    ]);
    const bad = page({ href: 'javascript:alert(1)' });
    const problems = checkPage({ html: bad, csp: cspFor(bad), ctaHrefs: ['javascript:alert(1)'] });
    assert.equal(problems.length, 2);
    assert.match(problems[0], /message CTA href is not allowed/);
  });

  it('fails a hash mismatch', () => {
    const html = page();
    const problems = checkPage({ html, csp: cspFor(page({ script: '1' })), ctaHrefs: ['/'] });
    assert.deepEqual(problems, ['csp.txt: script-src hash does not match 404.html']);
  });
});

describe('checkSource', () => {
  let root;

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'benjo-404-check-'));
    await mkdir(join(root, 'src', 'shell'), { recursive: true });
    await mkdir(join(root, 'src', 'games', 'bad'), { recursive: true });
    const files = {
      'src/shell/storage.js': '// localStorage only here\nexport const s = localStorage;\n',
      'src/shell/ok.js': '// never use innerHTML or fetch(); see https://example.com\nexport {};\n',
      'src/shell/ns.js': `export const NS = '${SVG_NS}';\n`,
      'src/games/bad/index.js': 'localStorage.x = 1;\nexport const u = "https://cdn.example/a";\n',
      'src/template.html': `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='${SVG_NS}.x'%3E">`,
    };
    await Promise.all(
      Object.entries(files).map(([name, text]) => writeFile(join(root, name), text)),
    );
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('flags code, not comments, and allows localStorage only in storage.js', async () => {
    assert.deepEqual(await checkSource(root, ['/']), [
      'src/games/bad/index.js: uses banned localStorage',
      'src/games/bad/index.js: external URL https://cdn.example/a',
    ]);
  });
});
