import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const {
  normalizeDistribution,
  decideExtensionUpdateCheck,
  isGalleryInstall,
  BUILD_DISTRIBUTION,
} = require('../dist-test/distribution.js');

describe('distribution / extension update check gating', () => {
  it('normalizes store flags, everything else is a manual VSIX', () => {
    for (const v of ['store', 'STORE', ' store ', 'marketplace', 'open-vsx', 'openvsx']) {
      assert.equal(normalizeDistribution(v), 'store', v);
    }
    for (const v of ['vsix', '', 'github', undefined, null, 1, {}]) {
      assert.equal(normalizeDistribution(v), 'vsix', String(v));
    }
  });

  it('defaults to vsix when the build flag is not defined', () => {
    assert.equal(BUILD_DISTRIBUTION, 'vsix');
  });

  it('manual VSIX installs keep the GitHub release check', () => {
    assert.deepEqual(decideExtensionUpdateCheck({ distribution: 'vsix' }), { check: true, reason: 'vsix' });
    assert.deepEqual(
      decideExtensionUpdateCheck({ distribution: 'vsix', galleryInstall: false, settingEnabled: true }),
      { check: true, reason: 'vsix' }
    );
  });

  it('store builds skip the check, even with the setting on', () => {
    assert.deepEqual(
      decideExtensionUpdateCheck({ distribution: 'store', settingEnabled: true }),
      { check: false, reason: 'store-build' }
    );
  });

  it('gallery installs skip the check even without the build flag', () => {
    assert.deepEqual(
      decideExtensionUpdateCheck({ distribution: 'vsix', galleryInstall: true }),
      { check: false, reason: 'gallery-install' }
    );
  });

  it('setting off disables the check for VSIX installs', () => {
    assert.deepEqual(
      decideExtensionUpdateCheck({ distribution: 'vsix', settingEnabled: false }),
      { check: false, reason: 'disabled-by-setting' }
    );
  });

  it('detects gallery installs from VS Code install metadata only', () => {
    assert.equal(isGalleryInstall({ __metadata: { source: 'gallery' } }), true);
    assert.equal(isGalleryInstall({ __metadata: { source: 'Gallery' } }), true);
    for (const pkg of [undefined, null, {}, { __metadata: {} }, { __metadata: { source: 'vsix' } }, { __metadata: { source: 'resource' } }]) {
      assert.equal(isGalleryInstall(pkg), false, JSON.stringify(pkg));
    }
  });

  it('esbuild inlines GROK_BUILD_DISTRIBUTION as the build flag', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-dist-'));
    try {
      for (const [flag, expected] of [['store', 'store'], ['vsix', 'vsix']]) {
        const out = path.join(dir, `${flag}.cjs`);
        await esbuild.build({
          entryPoints: ['src/util/distribution.ts'],
          outfile: out,
          bundle: true,
          platform: 'node',
          format: 'cjs',
          logLevel: 'silent',
          define: { __GROK_BUILD_DISTRIBUTION__: JSON.stringify(flag) },
        });
        assert.equal(require(out).BUILD_DISTRIBUTION, expected, flag);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('extension build and update check are wired to the flag and setting', () => {
    const esb = fs.readFileSync('esbuild.mjs', 'utf8');
    assert.match(esb, /__GROK_BUILD_DISTRIBUTION__:\s*JSON\.stringify\(\s*process\.env\.GROK_BUILD_DISTRIBUTION/);
    const upd = fs.readFileSync('src/util/extensionUpdate.ts', 'utf8');
    assert.match(upd, /decideExtensionUpdateCheck\(/);
    assert.match(upd, /checkExtensionUpdates/);
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const setting = pkg.contributes.configuration.properties['grokBuild.checkExtensionUpdates'];
    assert.equal(setting?.type, 'boolean');
    assert.equal(setting?.default, true);
    const wfPath = ['.github/workflows/publish.yml', '.github/workflow-drafts/publish.yml'].find((p) => fs.existsSync(p));
    assert.ok(wfPath, 'publish workflow present');
    const wf = fs.readFileSync(wfPath, 'utf8');
    assert.match(wf, /GROK_BUILD_DISTRIBUTION:\s*store/);
  });
});
