/**
 * Regression: line breaks in streamed agent replies (QA-INT-06, 2026-10-13).
 * "count 1..60, one per line" rendered as "1" then "2345…60".
 * Root cause: CSS `.msg .body br + br { display:none }` — `+` skips text
 * nodes, so every <br> after the first was hidden.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainJs = fs.readFileSync(new URL('../webview/main.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../webview/styles.css', import.meta.url), 'utf8');

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
const formatMarkdown = new Function(
  ['sanitizeMessageContent', 'formatMarkdown', 'escapeHtml'].map(grab).join('\n') +
    '\nreturn formatMarkdown;'
)();

function accumulate(chunks) {
  let content = '';
  const renders = [];
  for (const c of chunks) {
    content += c; // same as sessionManager agent_message_chunk append
    renders.push(formatMarkdown(content));
  }
  return { content, last: renders[renders.length - 1], renders };
}

describe('streamed newlines', () => {
  const full = Array.from({ length: 60 }, (_, i) => String(i + 1)).join('\n');

  it('chunks that are only "\\n" keep every line break', () => {
    const chunks = [];
    for (let i = 1; i <= 60; i++) {
      chunks.push(String(i));
      if (i < 60) chunks.push('\n');
    }
    const r = accumulate(chunks);
    assert.equal(r.content, full);
    assert.equal((r.last.match(/<br>/g) || []).length, 59);
    assert.equal(r.last, formatMarkdown(full));
  });

  it('chunks split around \\n (trailing / leading / mid) render like full text', () => {
    const chunks = ['1\n', '2', '\n3\n4', '\n', '\n', '5', '\n6'];
    const r = accumulate(chunks);
    assert.equal(r.content, '1\n2\n3\n4\n\n5\n6');
    assert.equal(r.last, formatMarkdown(r.content));
    assert.equal(r.last, '<p>1<br>2<br>3<br>4</p><p>5<br>6</p>');
  });

  it('a lone "\\n" chunk mid-stream does not drop content', () => {
    const r = accumulate(['a', '\n']);
    assert.equal(r.renders[1], '<p>a</p>');
    assert.equal(accumulate(['a', '\n', 'b']).last, '<p>a<br>b</p>');
  });

  it('CSS never hides <br> via sibling combinators', () => {
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(noComments, /br\s*[+~]\s*br/);
  });
});
