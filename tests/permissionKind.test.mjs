import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isWriteLikePermission } = require('../dist-test/permissionKind.js');

describe('isWriteLikePermission (#46)', () => {
  it('read-only kinds are never write-like, whatever the title', () => {
    assert.equal(isWriteLikePermission({ kind: 'read', title: 'Read file `src/a.ts`' }), false);
    assert.equal(isWriteLikePermission({ kind: 'search', title: 'List files' }), false);
    assert.equal(isWriteLikePermission({ kind: 'fetch', title: 'Fetch https://x/edit' }), false);
    assert.equal(isWriteLikePermission({ kind: 'think', title: 'Plan file edits' }), false);
  });

  it('edit / delete / move / execute are write-like', () => {
    for (const kind of ['edit', 'delete', 'move', 'execute']) {
      assert.equal(isWriteLikePermission({ kind, title: 'Something' }), true, kind);
    }
  });

  it('title fallback only for missing / other kinds', () => {
    assert.equal(isWriteLikePermission({ kind: 'other', title: 'Write `/tmp/a.txt`' }), true);
    assert.equal(isWriteLikePermission({ title: 'Create directory' }), true);
    assert.equal(isWriteLikePermission({ kind: 'other', title: 'Rename symbol' }), true);
    assert.equal(isWriteLikePermission({ kind: 'other', title: 'Overwrite config' }), true);
    assert.equal(isWriteLikePermission({ kind: 'other', title: 'Read file `x`' }), false);
    assert.equal(isWriteLikePermission({ kind: 'other', title: 'List files' }), false);
    assert.equal(isWriteLikePermission({ kind: null, title: '' }), false);
  });

  it('ignores backtick-quoted paths in the title', () => {
    assert.equal(isWriteLikePermission({ kind: 'other', title: 'Read `src/edit/create.ts`' }), false);
  });

  it('Grok x.ai/tool meta kind is used when ACP kind is missing', () => {
    assert.equal(isWriteLikePermission({ kind: 'other', title: 'Tool', _meta: { 'x.ai/tool': { kind: 'write' } } }), true);
    assert.equal(isWriteLikePermission({ title: 'Write-ish name', _meta: { 'x.ai/tool': { kind: 'read' } } }), false);
  });

  it('undefined tool call is not write-like', () => {
    assert.equal(isWriteLikePermission(undefined), false);
  });
});
