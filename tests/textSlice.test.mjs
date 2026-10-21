import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sliceTextLines } = require('../dist-test/textSlice.js');

// Previous implementation (LF-normalising) — used to check range parity.
const legacy = (text, line, limit) => {
  const lines = text.split(/\r?\n/);
  const start = Math.max(0, (line ?? 1) - 1);
  const end = limit != null ? start + limit : lines.length;
  return lines.slice(start, end).join('\n');
};

describe('sliceTextLines (#47)', () => {
  const crlf = 'a\r\nb\r\nc\r\nd\r\n';
  const lf = 'a\nb\nc\nd\n';

  it('no line/limit returns the text unchanged', () => {
    assert.equal(sliceTextLines(crlf), crlf);
    assert.equal(sliceTextLines(crlf, null, null), crlf);
  });

  it('CRLF stays CRLF for partial reads', () => {
    assert.equal(sliceTextLines(crlf, 2, 2), 'b\r\nc');
    assert.equal(sliceTextLines(crlf, 1, 3), 'a\r\nb\r\nc');
    assert.equal(sliceTextLines(crlf, 3), 'c\r\nd\r\n');
    assert.equal(sliceTextLines(crlf, null, 2), 'a\r\nb');
  });

  it('LF stays LF', () => {
    assert.equal(sliceTextLines(lf, 2, 2), 'b\nc');
    assert.equal(sliceTextLines(lf, 3), 'c\nd\n');
  });

  it('mixed endings are preserved as-is', () => {
    const mixed = 'a\r\nb\nc\r\nd';
    assert.equal(sliceTextLines(mixed, 1, 3), 'a\r\nb\nc');
    assert.equal(sliceTextLines(mixed, 2), 'b\nc\r\nd');
  });

  it('edge cases: start beyond EOF, limit 0, line < 1, limit past EOF', () => {
    assert.equal(sliceTextLines(crlf, 99, 5), '');
    assert.equal(sliceTextLines(crlf, 99), '');
    assert.equal(sliceTextLines(crlf, 2, 0), '');
    assert.equal(sliceTextLines(crlf, 0, 1), 'a');
    assert.equal(sliceTextLines(crlf, -3, 1), 'a');
    assert.equal(sliceTextLines(crlf, 4, 100), 'd\r\n');
    assert.equal(sliceTextLines('', 1, 1), '');
    assert.equal(sliceTextLines('no newline', 1, 1), 'no newline');
  });

  it('LF results match the previous implementation for every range', () => {
    for (const t of [lf, 'a\nb', '\n\n', 'x', '']) {
      for (let line = 0; line <= 6; line++) {
        for (const limit of [undefined, 0, 1, 2, 5]) {
          assert.equal(sliceTextLines(t, line, limit), legacy(t, line, limit), JSON.stringify([t, line, limit]));
        }
      }
    }
  });

  it('CRLF results equal the LF results after normalisation', () => {
    for (let line = 1; line <= 5; line++) {
      for (const limit of [undefined, 1, 2, 4]) {
        assert.equal(sliceTextLines(crlf, line, limit).replace(/\r\n/g, '\n'), legacy(crlf, line, limit));
      }
    }
  });
});
