import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { isGermanLocale, localize } = require('../dist-test/locale.js');

describe('locale helper (#48)', () => {
  it('detects German display languages only', () => {
    for (const l of ['de', 'DE', 'de-DE', 'de-AT', ' de-ch ']) assert.equal(isGermanLocale(l), true, l);
    for (const l of ['en', 'en-US', 'deu', 'fr', '', undefined, null]) assert.equal(isGermanLocale(l), false, String(l));
  });

  it('localize picks the variant', () => {
    const t = { en: 'Allowed', de: 'Erlaubt' };
    assert.equal(localize(t, 'de-DE'), 'Erlaubt');
    assert.equal(localize(t, 'en'), 'Allowed');
    assert.equal(localize(t), 'Allowed');
  });

  it('exactly one locale-detection implementation in src/', () => {
    const files = ['permissionOutcome', 'unreadable', 'turnOutcome'].map((f) =>
      fs.readFileSync(new URL(`../src/util/${f}.ts`, import.meta.url), 'utf8'));
    for (const s of files) {
      assert.ok(!/\/\^de\\b\/i/.test(s), 'no inline /^de\\b/i check');
      assert.ok(/from '\.\/locale'/.test(s), 'uses ./locale');
    }
  });
});
