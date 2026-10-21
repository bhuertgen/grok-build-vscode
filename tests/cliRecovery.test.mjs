import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { newSessionGate, clearStaleStartErrors } = require('../dist-test/cliRecovery.js');
const { CliStatus } = require('../dist-test/cliStatus.js');

describe('newSessionGate (#41 "+" button / New Session)', () => {
  it('invalid explicit cliPath → invalid_path (Open Setting prompt)', () => {
    const s = new CliStatus();
    s.setDetection({ ok: false, cliPath: '/nope/grok', invalidPath: true, error: 'grokBuild.cliPath points to /nope/grok – not found.' });
    assert.equal(newSessionGate(s.snapshot), 'invalid_path');
  });
  it('CLI missing (default path) → missing (Setup CLI prompt)', () => {
    const s = new CliStatus();
    s.setDetection({ ok: false, cliPath: 'grok', error: 'not found' });
    assert.equal(newSessionGate(s.snapshot), 'missing');
  });
  it('valid cliPath → ok (new session starts)', () => {
    const s = new CliStatus();
    s.setDetection({ ok: true, cliPath: 'grok', version: 'grok 1.0.62 (1474f9cbdd91) [stable]' });
    assert.equal(newSessionGate(s.snapshot), 'ok');
  });
  it('checking → checking; no status object → ok', () => {
    assert.equal(newSessionGate(new CliStatus().snapshot), 'checking');
    assert.equal(newSessionGate(undefined), 'ok');
  });
});

describe('webview "+" button stays clickable when the CLI is not ready', () => {
  it('btnNew is not disabled from cliOk (otherwise clicks never reach the gate)', () => {
    const src = fs.readFileSync(new URL('../webview/main.js', import.meta.url), 'utf8');
    const assigns = src.match(/els\.btnNew\.disabled\s*=\s*[^;]+;/g) ?? [];
    assert.ok(assigns.length > 0);
    for (const a of assigns) {
      assert.doesNotMatch(a, /cliOk|cli\.ready|state\.cli/, a);
    }
    assert.match(src, /els\.btnNew\.addEventListener\('click'[\s\S]{0,80}post\('newSession'/);
  });
});

describe('clearStaleStartErrors (CLI ready again after re-detect)', () => {
  it('error sessions → idle without lastError; others untouched', () => {
    const sessions = [
      { status: 'error', lastError: 'grokBuild.cliPath points to /nope/grok – not found.' },
      { status: 'ready' },
      { status: 'connecting' },
      { status: 'error' },
    ];
    assert.equal(clearStaleStartErrors(sessions), 2);
    assert.deepEqual(sessions.map((s) => s.status), ['idle', 'ready', 'connecting', 'idle']);
    assert.equal(sessions[0].lastError, undefined);
  });
  it('nothing to clear → 0', () => {
    assert.equal(clearStaleStartErrors([{ status: 'ready' }]), 0);
  });
});
