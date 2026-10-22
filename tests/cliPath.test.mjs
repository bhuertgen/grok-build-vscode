import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  isDefaultCliPath,
  looksLikePath,
  resolveCliCandidates,
  checkExplicitCliPath,
  invalidCliPathMessage,
  resolveSpawnCliPath,
} = require('../dist-test/cliPath.js');
const { CliStatus } = require('../dist-test/cliStatus.js');

const linux = { platform: 'linux', home: '/home/u' };

// Real-fs adapter equivalent to detect.ts nodeCliPathFs
const realFs = {
  stat(p) { try { return fs.statSync(p); } catch { return null; } },
  isExecutable(p) { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } },
};

describe('cliPath: default vs explicit (#41)', () => {
  it('empty / grok / grok.exe are the default setting', () => {
    for (const v of ['', '  ', 'grok', ' grok ', 'grok.exe', undefined, null]) {
      assert.equal(isDefaultCliPath(v), true, String(v));
    }
    for (const v of ['/nope/grok', '/home/u/.grok/bin/grok', 'grok-alpha', 'C:\\grok\\grok.exe']) {
      assert.equal(isDefaultCliPath(v), false, v);
    }
  });

  it('empty path → old fallback list (PATH, ~/.local/bin, ~/.grok/bin, /usr/local/bin)', () => {
    for (const v of ['', 'grok']) {
      const r = resolveCliCandidates(v, linux);
      assert.equal(r.explicit, false);
      assert.deepEqual(r.candidates, ['grok', '/home/u/.local/bin/grok', '/home/u/.grok/bin/grok', '/usr/local/bin/grok']);
    }
  });

  it('windows default fallbacks', () => {
    const r = resolveCliCandidates('', { platform: 'win32', home: 'C:\\Users\\u', localAppData: 'C:\\Users\\u\\AppData\\Local' });
    assert.equal(r.explicit, false);
    assert.equal(r.candidates[0], 'grok');
    assert.ok(r.candidates.includes('C:\\Users\\u\\.grok\\bin\\grok.exe'));
  });

  it('explicit path → only that path, no fallback', () => {
    const r = resolveCliCandidates(' /nope/grok ', linux);
    assert.deepEqual(r, { explicit: true, candidates: ['/nope/grok'] });
  });

  it('looksLikePath', () => {
    assert.equal(looksLikePath('/a/grok'), true);
    assert.equal(looksLikePath('C:\\grok.exe'), true);
    assert.equal(looksLikePath('~/grok'), true);
    assert.equal(looksLikePath('grok-alpha'), false);
  });
});

describe('checkExplicitCliPath on the real filesystem', () => {
  let dir, exe, plain;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipath-'));
    exe = path.join(dir, 'grok');
    plain = path.join(dir, 'grok-noexec');
    fs.writeFileSync(exe, '#!/bin/sh\necho "grok 9.9.9"\n');
    fs.chmodSync(exe, 0o755);
    fs.writeFileSync(plain, 'x');
    fs.chmodSync(plain, 0o644);
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('valid executable → ok', () => {
    assert.equal(checkExplicitCliPath(exe, realFs, 'linux'), null);
  });
  it('nonexistent → not_found', () => {
    assert.equal(checkExplicitCliPath('/nope/grok', realFs, 'linux'), 'not_found');
  });
  it('directory → is_directory', () => {
    assert.equal(checkExplicitCliPath(dir, realFs, 'linux'), 'is_directory');
  });
  it('not executable → not_executable (POSIX only)', () => {
    assert.equal(checkExplicitCliPath(plain, realFs, 'linux'), 'not_executable');
    assert.equal(checkExplicitCliPath(plain, realFs, 'win32'), null);
  });
  it('bare command name is left to PATH lookup', () => {
    assert.equal(checkExplicitCliPath('grok-alpha', realFs, 'linux'), null);
  });
  it('message names the path and the problem', () => {
    const m = invalidCliPathMessage('/nope/grok', 'not_found');
    assert.match(m, /grokBuild\.cliPath points to \/nope\/grok/);
    assert.match(m, /not found/);
    assert.match(invalidCliPathMessage('/x', 'not_executable'), /not executable/);
  });
});

describe('resolveSpawnCliPath: spawn uses the same resolution as detection', () => {
  it('explicit path → exactly that path, even if detection found another', () => {
    assert.equal(
      resolveSpawnCliPath('/nope/grok', { ok: true, cliPath: '/home/u/.grok/bin/grok', configuredPath: '' }),
      '/nope/grok'
    );
  });
  it('default → binary resolved by detection for the same setting', () => {
    assert.equal(
      resolveSpawnCliPath('grok', { ok: true, cliPath: '/home/u/.grok/bin/grok', configuredPath: 'grok' }),
      '/home/u/.grok/bin/grok'
    );
    assert.equal(
      resolveSpawnCliPath('', { ok: true, cliPath: '/home/u/.grok/bin/grok', configuredPath: 'grok' }),
      '/home/u/.grok/bin/grok'
    );
  });
  it('default with stale/failed/foreign detection → grok', () => {
    assert.equal(resolveSpawnCliPath('grok', null), 'grok');
    assert.equal(resolveSpawnCliPath('grok', { ok: false, cliPath: '/x', configuredPath: 'grok' }), 'grok');
    assert.equal(resolveSpawnCliPath('grok', { ok: true, cliPath: '/x/grok', configuredPath: '/x/grok' }), 'grok');
  });
});

describe('CliStatus snapshot with invalid cliPath', () => {
  it('invalid path → not ready, invalidCliPath, no version (even with earlier update info)', () => {
    const s = new CliStatus();
    s.setUpdateInfo({ checked: true, updateAvailable: false, currentVersion: '1.0.62' });
    s.setDetection({ ok: false, cliPath: '/nope/grok', configuredPath: '/nope/grok', invalidPath: true,
      error: invalidCliPathMessage('/nope/grok', 'not_found') });
    const snap = s.snapshot;
    assert.equal(snap.ready, false);
    assert.equal(snap.invalidCliPath, true);
    assert.equal(snap.version, null);
    assert.equal(snap.compatLevel, 'missing');
    assert.match(snap.error, /\/nope\/grok/);
  });
  it('fixing the path clears the error state without reload', () => {
    const s = new CliStatus();
    s.setDetection({ ok: false, cliPath: '/nope/grok', invalidPath: true, error: 'x' });
    s.setDetection({ ok: true, cliPath: 'grok', configuredPath: 'grok', version: 'grok 1.0.67 (2fe064390d07) [stable]' });
    const snap = s.snapshot;
    assert.equal(snap.ready, true);
    assert.equal(snap.invalidCliPath, false);
    assert.equal(snap.showCompatBanner, false);
    assert.match(snap.version, /1\.0\.67/);
  });
});
