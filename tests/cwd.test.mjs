import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as path from 'node:path';

const require = createRequire(import.meta.url);
const { normalizeCwdKey, sameCwd } = require('../dist-test/cwd.js');

describe('normalizeCwdKey / sameCwd', () => {
  it('treats slash variants as same on Windows-style paths', () => {
    const a = 'D:\\tmp\\sandbox';
    const b = 'D:/tmp/sandbox';
    assert.equal(sameCwd(a, b), true);
  });

  it('is case-insensitive for drive letters', () => {
    assert.equal(sameCwd('D:\\Projects\\Foo', 'd:\\Projects\\Foo'), true);
  });

  it('distinguishes different folders', () => {
    assert.equal(sameCwd('D:\\a', 'D:\\b'), false);
  });

  it('resolves relative segments', () => {
    const base = path.resolve('foo');
    const withDot = path.join(base, '.', 'bar', '..', 'bar');
    assert.equal(sameCwd(path.join(base, 'bar'), withDot), true);
  });

  it('normalizeCwdKey lowercases and uses forward slashes', () => {
    const k = normalizeCwdKey('D:\\Tmp\\X');
    assert.equal(k.includes('\\'), false);
    assert.equal(k, k.toLowerCase());
  });
});
