/**
 * Webview markdown: path / #123 placeholders become controls, and existing
 * https links are not wrapped a second time. Extracts the real functions
 * from webview/main.js (same approach as streamNewlines.test.mjs).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const GrokMessageLinks = require('../dist-test/messageLinks.js');

const mainJs = fs.readFileSync(new URL('../webview/main.js', import.meta.url), 'utf8');

function grab(name) {
  const i = mainJs.indexOf('  function ' + name + '(');
  assert.ok(i >= 0, 'missing ' + name);
  let d = 0;
  for (let k = mainJs.indexOf('{', i); k < mainJs.length; k++) {
    if (mainJs[k] === '{') d++;
    else if (mainJs[k] === '}' && --d === 0) return mainJs.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + name);
}

function load(forgeIssueTemplate) {
  const state = { forgeIssueTemplate };
  return new Function(
    'state',
    'GrokMessageLinks',
    ['sanitizeMessageContent', 'escapeHtml', 'renderMessageLink', 'applyMessageLinkPlaceholders', 'formatMarkdown']
      .map(grab)
      .join('\n') + '\nreturn formatMarkdown;'
  )(state, GrokMessageLinks);
}

describe('webview assistant link html', () => {
  const formatMarkdown = load('https://github.com/acme/widgets/issues/{n}');

  it('opens a relative path at line and col and leaves https links alone', () => {
    const html = formatMarkdown(
      'See src/cli/compat.ts:42:7 and [docs](https://example.com/a) and #65.',
      { linkify: true }
    );
    assert.match(
      html,
      /<button type="button" class="path-link" data-path="src\/cli\/compat.ts" data-line="42" data-col="7">src\/cli\/compat.ts:42:7<\/button>/
    );
    assert.match(html, /<a href="https:\/\/example.com\/a" rel="noreferrer">docs<\/a>/);
    assert.match(
      html,
      /<a href="https:\/\/github.com\/acme\/widgets\/issues\/65" rel="noreferrer">#65<\/a>/
    );
    assert.doesNotMatch(html, /<a[^>]*>[^<]*<button/);
    assert.doesNotMatch(html, /<button[^>]*>[^<]*<a /);
  });

  it('puts the control inside inline code, not around an https link', () => {
    const html = formatMarkdown('Look at `src/cli/compat.ts`.', { linkify: true });
    assert.match(
      html,
      /<code><button type="button" class="path-link" data-path="src\/cli\/compat.ts">src\/cli\/compat.ts<\/button><\/code>/
    );
  });

  it('does not link paths inside fenced code', () => {
    const html = formatMarkdown(
      '```ts\nconst p = "src/cli/compat.ts";\n```\n\nAfter src/util/cwd.ts',
      { linkify: true }
    );
    const pre = html.match(/<pre>[\s\S]*?<\/pre>/)[0];
    assert.match(pre, /const p = &quot;src\/cli\/compat.ts&quot;/);
    assert.doesNotMatch(pre, /path-link/);
    assert.match(html, /data-path="src\/util\/cwd.ts"/);
  });

  it('skips file links in user text and skips #123 without a remote', () => {
    const plain = formatMarkdown('src/cli/compat.ts and #65', { linkify: false });
    assert.doesNotMatch(plain, /path-link|<a /);
    assert.match(plain, /src\/cli\/compat.ts/);

    const noRemote = load(null);
    const html = noRemote('See #65.', { linkify: true });
    assert.doesNotMatch(html, /<a /);
    assert.match(html, /#65/);
  });
});
