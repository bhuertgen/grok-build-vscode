import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  formatFileRangeMention,
  mentionFromSelection,
  parseFileRangeMentions,
  sliceLines,
  rangeContextBlock,
  linesFromEditorSelection,
} = require('../dist-test/fileRangeMention.js');

describe('formatFileRangeMention', () => {
  it('builds a stable token and swaps reversed lines', () => {
    assert.equal(formatFileRangeMention('src/app.ts', 5, 10), '@src/app.ts#5-10');
    assert.equal(formatFileRangeMention('\\src\\app.ts', 10, 5), '@src/app.ts#5-10');
  });
});

describe('mentionFromSelection', () => {
  it('inserts @file#start-end', () => {
    const r = mentionFromSelection({
      relativePath: 'src/app.ts',
      startLine: 5,
      endLine: 10,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.mention, '@src/app.ts#5-10');
    }
  });

  it('rejects empty selection', () => {
    const r = mentionFromSelection({
      relativePath: 'a.ts',
      startLine: 1,
      endLine: 1,
      empty: true,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.message, /No selection/);
    }
  });

  it('rejects multi-cursor', () => {
    const r = mentionFromSelection({
      relativePath: 'a.ts',
      startLine: 1,
      endLine: 2,
      selectionCount: 2,
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.message, /Multiple selections/);
    }
  });
});

describe('parseFileRangeMentions', () => {
  it('parses one or more mentions', () => {
    const text = 'see @src/app.ts#5-10 and @lib/util.ts#2-2 please';
    const found = parseFileRangeMentions(text);
    assert.equal(found.length, 2);
    assert.equal(found[0].path, 'src/app.ts');
    assert.equal(found[0].startLine, 5);
    assert.equal(found[0].endLine, 10);
    assert.equal(found[1].raw, '@lib/util.ts#2-2');
  });

  it('normalizes reversed ranges', () => {
    const found = parseFileRangeMentions('@a.ts#9-3');
    assert.equal(found[0].startLine, 3);
    assert.equal(found[0].endLine, 9);
  });
});

describe('sliceLines', () => {
  const body = 'a\nb\nc\nd\n';
  it('slices 1-based inclusive lines', () => {
    assert.equal(sliceLines(body, 2, 3), 'b\nc');
  });
  it('returns null past EOF', () => {
    assert.equal(sliceLines(body, 20, 21), null);
  });
});

describe('rangeContextBlock', () => {
  it('keeps the mention next to the body', () => {
    const block = rangeContextBlock('@a.ts#1-1', 'hello');
    assert.match(block, /^@a\.ts#1-1\n```\nhello\n```$/);
  });
});

describe('linesFromEditorSelection', () => {
  it('drops the exclusive next line when the caret is at column 0', () => {
    const lines = linesFromEditorSelection({
      start: { line: 4, character: 0 },
      end: { line: 10, character: 0 },
    });
    assert.deepEqual(lines, { startLine: 5, endLine: 10 });
  });
  it('returns null for a caret', () => {
    assert.equal(
      linesFromEditorSelection({
        start: { line: 0, character: 3 },
        end: { line: 0, character: 3 },
      }),
      null
    );
  });
});
