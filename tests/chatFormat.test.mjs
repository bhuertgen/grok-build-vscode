import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  stripTrailingDecorations,
  formatUserMessageWithAttachments,
  buildHistorySeedTranscript,
  parseAtMention,
  parseSlashQuery,
} = require('../dist-test/chatFormat.js');

describe('stripTrailingDecorations', () => {
  it('removes trailing --- rules', () => {
    const src = 'Hello\n\n---\n---\n';
    assert.equal(stripTrailingDecorations(src), 'Hello');
  });

  it('collapses excessive blank lines', () => {
    assert.equal(stripTrailingDecorations('a\n\n\n\nb'), 'a\n\nb');
  });

  it('keeps internal single hr content shape', () => {
    const src = 'A\n\n---\n\nB';
    assert.equal(stripTrailingDecorations(src), 'A\n\n---\n\nB');
  });
});

describe('formatUserMessageWithAttachments', () => {
  it('returns text unchanged without attachments', () => {
    assert.equal(formatUserMessageWithAttachments('hi', []), 'hi');
  });

  it('prefixes @mentions when missing from text', () => {
    const out = formatUserMessageWithAttachments('Lies die Datei', [
      { kind: 'file', label: 'hello.txt', relativePath: 'notes/hello.txt' },
    ]);
    assert.equal(out, '@notes/hello.txt\nLies die Datei');
  });

  it('does not duplicate existing @mention', () => {
    const out = formatUserMessageWithAttachments('@notes/hello.txt\nOK', [
      { kind: 'file', label: 'hello.txt', relativePath: 'notes/hello.txt' },
    ]);
    assert.equal(out, '@notes/hello.txt\nOK');
  });

  it('works with only attachments', () => {
    const out = formatUserMessageWithAttachments('', [
      { kind: 'file', label: 'a.md', relativePath: 'a.md' },
    ]);
    assert.equal(out, '@a.md');
  });
});

describe('buildHistorySeedTranscript', () => {
  it('returns empty when no user/agent content', () => {
    assert.equal(buildHistorySeedTranscript([]), '');
    assert.equal(
      buildHistorySeedTranscript([{ role: 'system', content: 'x' }]),
      ''
    );
  });

  it('includes user and agent turns', () => {
    const t = buildHistorySeedTranscript([
      { role: 'user', content: 'Hallo' },
      { role: 'agent', content: 'Hi' },
    ]);
    assert.match(t, /User:\nHallo/);
    assert.match(t, /Grok:\nHi/);
    assert.match(t, /Restored chat history/);
  });
});

describe('parseAtMention', () => {
  it('detects bare @', () => {
    const r = parseAtMention('@');
    assert.ok(r);
    assert.equal(r.query, '');
    assert.equal(r.start, 0);
  });

  it('detects @query after space', () => {
    const r = parseAtMention('siehe @rea');
    assert.ok(r);
    assert.equal(r.query, 'rea');
  });

  it('ignores email-like mid-word', () => {
    assert.equal(parseAtMention('a@b.com'), null);
  });

  it('respects cursor position', () => {
    const v = 'foo @bar baz';
    // cursor after @bar
    const r = parseAtMention(v, 8);
    assert.ok(r);
    assert.equal(r.query, 'bar');
  });
});

describe('parseSlashQuery', () => {
  it('parses /help', () => {
    const r = parseSlashQuery('/help');
    assert.ok(r);
    assert.equal(r.query, 'help');
    assert.equal(r.hasArgs, false);
  });

  it('detects args', () => {
    const r = parseSlashQuery('/model grok');
    assert.ok(r);
    assert.equal(r.hasArgs, true);
  });

  it('rejects non-slash', () => {
    assert.equal(parseSlashQuery('help'), null);
  });
});
