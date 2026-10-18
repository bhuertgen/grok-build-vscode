import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parsePermissionTitle, isProbablyBinary, unreadableLabel } = require('../dist-test/unreadable.js');

describe('parsePermissionTitle', () => {
  it('strips the CLI 1.0.62 unreadable suffix (verbatim live title)', () => {
    const p = parsePermissionTitle('Write `/workspace/binwrite-repro/img.bin` (unreadable, no preview)');
    assert.deepEqual(p, { title: 'Write `/workspace/binwrite-repro/img.bin`', unreadable: true });
  });
  it('accepts plain "(unreadable)" and case variants', () => {
    assert.equal(parsePermissionTitle('Write `a.bin` (unreadable)').unreadable, true);
    assert.equal(parsePermissionTitle('Write `a.bin` (Binary, Unreadable)').title, 'Write `a.bin`');
  });
  it('leaves normal titles alone', () => {
    for (const t of ['Write `src/a.ts`', 'Run `ls (unreadable stuff)` now', 'Edit (preview)', '']) {
      assert.deepEqual(parsePermissionTitle(t), { title: t, unreadable: false });
    }
    assert.deepEqual(parsePermissionTitle(undefined), { title: '', unreadable: false });
  });
});

describe('isProbablyBinary', () => {
  it('NUL bytes → binary', () => {
    assert.equal(isProbablyBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])), true);
  });
  it('invalid UTF-8 → binary', () => {
    assert.equal(isProbablyBinary(Buffer.from([0x66, 0xff, 0xfe, 0x41])), true);
  });
  it('UTF-8 text incl. umlauts / emoji / empty → not binary', () => {
    assert.equal(isProbablyBinary(Buffer.from('Grüße, Straße – 🚀\n', 'utf8')), false);
    assert.equal(isProbablyBinary(Buffer.alloc(0)), false);
  });
  it('multibyte char split at sample boundary is not binary', () => {
    const buf = Buffer.from('a'.repeat(8191) + 'ü' + 'b', 'utf8');
    assert.equal(isProbablyBinary(buf), false);
  });
});

describe('unreadableLabel', () => {
  it('localizes', () => {
    assert.equal(unreadableLabel('de-DE'), 'nicht lesbar – keine Vorschau');
    assert.equal(unreadableLabel('en'), 'unreadable – no preview');
  });
});

const { extractWritePath, isWriteLikeToolCall } = require('../dist-test/unreadable.js');

describe('extractWritePath / isWriteLikeToolCall (QA PR36: CLI title had no suffix)', () => {
  // Verbatim request_permission toolCall from CLI 1.0.62 for a 64-byte non-NUL binary
  const tc = {
    toolCallId: 'c1',
    kind: 'edit',
    title: 'Write `/workspace/binwrite-repro/img.bin`',
    rawInput: { variant: 'Write', file_path: '/workspace/binwrite-repro/img.bin', content: 'test' },
    _meta: { 'x.ai/tool': { name: 'write', kind: 'write', input: { path: '/workspace/binwrite-repro/img.bin' } } },
  };
  it('finds path from rawInput.file_path', () => {
    assert.equal(extractWritePath(tc), '/workspace/binwrite-repro/img.bin');
    assert.equal(isWriteLikeToolCall(tc), true);
  });
  it('falls back to x.ai/tool input and locations', () => {
    assert.equal(extractWritePath({ _meta: { 'x.ai/tool': { input: { path: '/a/b' } } } }), '/a/b');
    assert.equal(extractWritePath({ locations: [{ path: '/c' }] }), '/c');
    assert.equal(extractWritePath({ rawInput: { target_file: '/t' } }), '/t');
    assert.equal(extractWritePath(undefined), undefined);
    assert.equal(extractWritePath({ rawInput: {} }), undefined);
  });
  it('write-like detection', () => {
    assert.equal(isWriteLikeToolCall({ kind: 'other', _meta: { 'x.ai/tool': { kind: 'write' } } }), true);
    assert.equal(isWriteLikeToolCall({ kind: 'execute' }), false);
    assert.equal(isWriteLikeToolCall({ kind: 'read', _meta: { 'x.ai/tool': { kind: 'read' } } }), false);
  });
  it('64 random non-NUL bytes are detected as binary', () => {
    const b = Buffer.from([0x9c, 0x13, 0xe7, 0xfa, 0x41, 0xc3, 0x28, 0xff, 0x80, 0x7f]);
    assert.equal(isProbablyBinary(b), true);
  });
});
