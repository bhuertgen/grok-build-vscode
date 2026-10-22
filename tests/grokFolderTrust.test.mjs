import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const require = createRequire(import.meta.url);
const {
  parseTrustedFolders,
  folderTrustDisabledInConfig,
  folderTrustDisabledByEnv,
  resolveFolderTrust,
  detectProjectSources,
  inspectFolderTrust,
  needsGrokTrust,
  describeProjectSources,
  grokTrustBannerState,
  trustStorePath,
} = require('../dist-test/grokFolderTrust.js');

let tmp;
let home;
let grokHome;
const write = (p, text = '') => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
};
const opts = () => ({ env: { GROK_HOME: grokHome }, homeDir: home, platform: 'linux' });

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'grok-trust-')));
  home = path.join(tmp, 'home');
  grokHome = path.join(home, '.grok');
  fs.mkdirSync(grokHome, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('parseTrustedFolders', () => {
  it('reads [folders."<path>"] tables (CLI 1.0.67 format)', () => {
    const m = parseTrustedFolders(
      '# managed by grok\n[folders."/workspace/hookstop-repro"]\ntrusted = true\ndecided_at = 1792281600\n\n' +
        "[folders.'/srv/denied']\ntrusted = false\n" +
        '[folders."C:\\\\Users\\\\me\\\\repo"]\ntrusted = true\n'
    );
    assert.equal(m.get('/workspace/hookstop-repro'), true);
    assert.equal(m.get('/srv/denied'), false);
    assert.equal(m.get('C:\\Users\\me\\repo'), true);
    assert.equal(m.size, 3);
  });

  it('ignores other tables and broken content', () => {
    const m = parseTrustedFolders('[other]\ntrusted = true\n[folders."/a"\ntrusted = true\nnot toml at all');
    assert.equal(m.size, 0);
  });
});

describe('folder trust switches', () => {
  it('[folder_trust] enabled = false disables the gate', () => {
    assert.equal(folderTrustDisabledInConfig('[folder_trust]\nenabled = false # off\n'), true);
    assert.equal(folderTrustDisabledInConfig('[folder_trust]\nenabled = true\n'), false);
    assert.equal(folderTrustDisabledInConfig('[other]\nenabled = false\n'), false);
  });

  it('GROK_FOLDER_TRUST=0/false disables the gate', () => {
    for (const v of ['0', 'false', 'OFF']) {
      assert.equal(folderTrustDisabledByEnv({ GROK_FOLDER_TRUST: v }), true, v);
    }
    assert.equal(folderTrustDisabledByEnv({ GROK_FOLDER_TRUST: '1' }), false);
    assert.equal(folderTrustDisabledByEnv({}), false);
  });

  it('GROK_HOME moves the trust store', () => {
    assert.equal(trustStorePath(opts()), path.join(grokHome, 'trusted_folders.toml'));
    assert.equal(
      trustStorePath({ env: {}, homeDir: '/home/u', platform: 'linux' }),
      '/home/u/.grok/trusted_folders.toml'
    );
  });
});

describe('resolveFolderTrust', () => {
  const rp = (p) => p;
  it('exact entry and ancestor inside the same repo are trusted', () => {
    const store = new Map([['/repo', true]]);
    assert.equal(resolveFolderTrust('/repo', store, '/repo', { platform: 'linux', realpath: rp }).state, 'trusted');
    const sub = resolveFolderTrust('/repo/pkg/a', store, '/repo', { platform: 'linux', realpath: rp });
    assert.equal(sub.state, 'trusted');
    assert.equal(sub.trustedBy, '/repo');
  });

  it('an ancestor outside the repo (nested checkout) does not count', () => {
    const store = new Map([['/work', true]]);
    assert.equal(
      resolveFolderTrust('/work/nested', store, '/work/nested', { platform: 'linux', realpath: rp }).state,
      'untrusted'
    );
  });

  it('nearest decision wins (denied subfolder)', () => {
    const store = new Map([
      ['/repo', true],
      ['/repo/vendor', false],
    ]);
    assert.equal(
      resolveFolderTrust('/repo/vendor/x', store, '/repo', { platform: 'linux', realpath: rp }).state,
      'denied'
    );
  });

  it('Windows paths compare case-insensitively', () => {
    const store = new Map([['C:\\Users\\Me\\Repo', true]]);
    assert.equal(
      resolveFolderTrust('c:\\users\\me\\repo', store, undefined, { platform: 'win32', realpath: rp }).state,
      'trusted'
    );
  });
});

describe('detectProjectSources', () => {
  it('finds hooks, rules, skills and MCP from repo root down to the folder', () => {
    const repo = path.join(tmp, 'repo');
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
    write(path.join(repo, '.grok/hooks/pre.json'), '{"hooks":{}}');
    write(path.join(repo, 'AGENTS.md'), '# rules');
    write(path.join(repo, 'pkg/CLAUDE.md'), '# more');
    write(path.join(repo, '.grok/skills/commit/SKILL.md'), '---');
    write(path.join(repo, '.mcp.json'), '{}');
    write(path.join(repo, '.claude/settings.json'), '{"permissions":{}}'); // no hooks key
    write(path.join(repo, '.cursor/rules/style.mdc'), 'x');
    const got = detectProjectSources(path.join(repo, 'pkg'), repo, 'linux');
    const keys = got.map((s) => `${s.kind}:${s.path}`).sort();
    assert.deepEqual(keys, [
      'hooks:.grok/hooks/pre.json',
      'mcp:.mcp.json',
      'rules:.cursor/rules',
      'rules:AGENTS.md',
      'rules:pkg/CLAUDE.md',
      'skills:.grok/skills',
    ]);
  });

  it('.claude/settings.json counts as hooks only with a "hooks" key; .grok/config.toml hooks/mcp tables', () => {
    const dir = path.join(tmp, 'plain');
    write(path.join(dir, '.claude/settings.local.json'), '{ "hooks": { "PreToolUse": [] } }');
    write(path.join(dir, '.grok/config.toml'), '[mcp_servers.db]\ncommand = "x"\n[[hooks.PreToolUse]]\n');
    const keys = detectProjectSources(dir, undefined, 'linux').map((s) => `${s.kind}:${s.path}`).sort();
    assert.deepEqual(keys, ['hooks:.claude/settings.local.json', 'hooks:.grok/config.toml', 'mcp:.grok/config.toml']);
  });

  it('empty folder → no sources', () => {
    const dir = path.join(tmp, 'empty');
    fs.mkdirSync(dir);
    assert.deepEqual(detectProjectSources(dir, undefined, 'linux'), []);
  });
});

describe('inspectFolderTrust', () => {
  const mkRepo = () => {
    const repo = path.join(tmp, 'ws');
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
    write(path.join(repo, '.grok/hooks/pre.json'), '{}');
    write(path.join(repo, 'AGENTS.md'), 'x');
    return repo;
  };

  it('untrusted folder with hooks → needs trust', () => {
    const info = inspectFolderTrust(mkRepo(), opts());
    assert.equal(info.state, 'untrusted');
    assert.equal(needsGrokTrust(info), true);
    assert.equal(describeProjectSources(info.sources), 'hooks (.grok/hooks/pre.json), project rules (AGENTS.md)');
  });

  it('trusted via trusted_folders.toml → no banner', () => {
    const repo = mkRepo();
    write(path.join(grokHome, 'trusted_folders.toml'), `[folders."${repo}"]\ntrusted = true\ndecided_at = 1\n`);
    const info = inspectFolderTrust(path.join(repo), opts());
    assert.equal(info.state, 'trusted');
    assert.equal(needsGrokTrust(info), false);
  });

  it('folder trust disabled via env or config → no banner', () => {
    const repo = mkRepo();
    assert.equal(inspectFolderTrust(repo, { ...opts(), env: { GROK_HOME: grokHome, GROK_FOLDER_TRUST: '0' } }).state, 'disabled');
    write(path.join(grokHome, 'config.toml'), '[folder_trust]\nenabled = false\n');
    const info = inspectFolderTrust(repo, opts());
    assert.equal(info.state, 'disabled');
    assert.equal(needsGrokTrust(info), false);
  });

  it('home directory is exempt', () => {
    write(path.join(home, 'AGENTS.md'), 'x');
    assert.equal(inspectFolderTrust(home, opts()).state, 'exempt');
  });

  it('untrusted folder without project sources → no banner', () => {
    const dir = path.join(tmp, 'nothing');
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    const info = inspectFolderTrust(dir, opts());
    assert.equal(info.state, 'untrusted');
    assert.equal(needsGrokTrust(info), false);
  });
});

describe('grokTrustBannerState', () => {
  const info = {
    folder: '/workspace/hooktrust-ws',
    state: 'untrusted',
    sources: [{ kind: 'hooks', path: '.grok/hooks/pre.json' }],
  };
  const ctx = { vscodeTrusted: true, dismissed: false, trustRequested: false };

  it('shows with "Trust folder" in a trusted VS Code workspace', () => {
    const b = grokTrustBannerState(info, ctx, 'linux');
    assert.equal(b.show, true);
    assert.equal(b.canTrust, true);
    assert.equal(b.folderName, 'hooktrust-ws');
    assert.deepEqual(b.kinds, ['hooks']);
    assert.match(b.message, /ignores this project's hooks \(\.grok\/hooks\/pre\.json\)/);
  });

  it('Restricted Mode: banner without "Trust folder"', () => {
    const b = grokTrustBannerState(info, { ...ctx, vscodeTrusted: false }, 'linux');
    assert.equal(b.show, true);
    assert.equal(b.canTrust, false);
    assert.match(b.message, /Trust the workspace in VS Code first/);
  });

  it('hidden when dismissed, trust already requested, trusted or no sources', () => {
    assert.equal(grokTrustBannerState(info, { ...ctx, dismissed: true }, 'linux').show, false);
    assert.equal(grokTrustBannerState(info, { ...ctx, trustRequested: true }, 'linux').show, false);
    assert.equal(grokTrustBannerState({ ...info, state: 'trusted' }, ctx, 'linux').show, false);
    assert.equal(grokTrustBannerState({ ...info, sources: [] }, ctx, 'linux').show, false);
    assert.equal(grokTrustBannerState(undefined, ctx, 'linux').show, false);
    assert.equal(grokTrustBannerState(info, { ...ctx, dismissed: true }, 'linux').canTrust, false);
  });
});
