import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  assessCliCompat,
  shouldShowCompatBanner,
  CLI_HARD_MIN,
  CLI_SOFT_MIN,
  CLI_TESTED_WITH,
} = require('../dist-test/compat.js');
const { compareVersions, extractVersionToken } = require('../dist-test/semver.js');

describe('semver helpers', () => {
  it('extracts version from grok --version banner', () => {
    assert.equal(extractVersionToken('grok 1.0.3 (abc) [stable]'), '1.0.3');
    assert.equal(extractVersionToken('1.2.0-beta.1'), '1.2.0-beta.1');
    assert.equal(extractVersionToken('no version here'), undefined);
  });

  it('compares versions', () => {
    assert.ok(compareVersions('1.0.1', '1.0.0') > 0);
    assert.ok(compareVersions('0.9.9', '1.0.0') < 0);
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  });
});

describe('assessCliCompat', () => {
  it('missing → not usable + banner', () => {
    const a = assessCliCompat({ detected: false, error: 'not found' });
    assert.equal(a.level, 'missing');
    assert.equal(a.usable, false);
    assert.equal(shouldShowCompatBanner(a.level), true);
    assert.match(a.message, /not found/i);
  });

  it('hard floor: below 1.0.0 is too_old', () => {
    const a = assessCliCompat({
      detected: true,
      rawVersion: 'grok 0.9.5 (deadbeef)',
    });
    assert.equal(a.level, 'too_old');
    assert.equal(a.version, '0.9.5');
    assert.equal(a.usable, false);
    assert.equal(a.hardMin, CLI_HARD_MIN);
    assert.match(a.message, /too old/i);
  });

  it('1.0.67+ is ok (tested stable)', () => {
    for (const v of ['grok 1.0.67 (2fe064390d07) [stable]', '1.0.68', '1.1.0']) {
      const a = assessCliCompat({ detected: true, rawVersion: v });
      assert.equal(a.level, 'ok', v);
      assert.equal(a.usable, true);
      assert.equal(shouldShowCompatBanner(a.level), false);
      assert.match(a.message, /≥ 1\.0\.67/);
    }
  });

  it('soft floor follows the latest tested stable: 1.0.67', () => {
    assert.equal(CLI_SOFT_MIN, '1.0.67');
    assert.equal(CLI_TESTED_WITH, '1.0.67');
    assert.equal(CLI_HARD_MIN, '1.0.0');
  });

  it('1.0.0..1.0.66 is usable with soft warning recommending 1.0.67', () => {
    for (const v of ['1.0.0', '1.0.52', '1.0.62', 'grok 1.0.66 (858cb4f88f75) [alpha]', '1.0.66-alpha.1']) {
      const a = assessCliCompat({ detected: true, rawVersion: v });
      assert.equal(a.level, 'soft_warn', v);
      assert.equal(a.usable, true, v);
      assert.equal(shouldShowCompatBanner(a.level), true, v);
      assert.match(a.message, /≥ 1\.0\.67 is recommended/, v);
    }
  });

  it('unknown raw version is soft-usable with banner', () => {
    const a = assessCliCompat({
      detected: true,
      rawVersion: 'grok-dev-build',
    });
    assert.equal(a.level, 'unknown');
    assert.equal(a.usable, true);
    assert.equal(shouldShowCompatBanner(a.level), true);
  });

  it('floors target CLI 1.0.x era', () => {
    assert.equal(CLI_HARD_MIN, '1.0.0');
    assert.equal(CLI_SOFT_MIN, '1.0.67');
  });

  it('soft_warn when below soft but above hard', () => {
    const a = assessCliCompat({
      detected: true,
      rawVersion: '1.0.0',
      hardMin: '1.0.0',
      softMin: '1.2.0',
    });
    assert.equal(a.level, 'soft_warn');
    assert.equal(a.usable, true);
    assert.equal(shouldShowCompatBanner(a.level), true);
  });
});
