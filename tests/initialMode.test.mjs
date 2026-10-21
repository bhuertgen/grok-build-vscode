import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  resolveInitialMode,
  cliStartsInPlanMode,
  planModeTooOldHint,
  PLAN_PERMISSION_MODE_MIN,
} = require('../dist-test/initialMode.js');

// #38 — cliPermissionMode=plan: UI shows Plan at session start (CLI ≥ 1.0.65).
describe('resolveInitialMode', () => {
  it('floor is 1.0.65', () => {
    assert.equal(PLAN_PERMISSION_MODE_MIN, '1.0.65');
  });

  it('no cliPermissionMode → defaultMode unchanged', () => {
    const r = resolveInitialMode({ defaultMode: 'execute', agentVersion: '1.0.66' });
    assert.deepEqual(r, { mode: 'execute', reason: 'setting', version: '1.0.66' });
  });

  it('other permission modes do not force plan', () => {
    for (const p of ['', 'default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions']) {
      const r = resolveInitialMode({ defaultMode: 'execute', cliPermissionMode: p, agentVersion: '1.0.66' });
      assert.equal(r.mode, 'execute', p);
      assert.equal(r.reason, 'setting', p);
    }
  });

  it('plan + CLI 1.0.65 / 1.0.66 / 1.0.66 alpha raw → plan', () => {
    for (const v of ['1.0.65', '1.0.66', 'grok 1.0.66 (858cb4f88f75) [alpha]', '1.1.0']) {
      const r = resolveInitialMode({ defaultMode: 'execute', cliPermissionMode: 'plan', agentVersion: v });
      assert.equal(r.mode, 'plan', v);
      assert.equal(r.reason, 'cli_plan', v);
    }
  });

  it('plan + CLI 1.0.64 / 1.0.62 → defaultMode, reason cli_too_old', () => {
    for (const v of ['1.0.64', '1.0.62']) {
      const r = resolveInitialMode({ defaultMode: 'execute', cliPermissionMode: 'plan', agentVersion: v });
      assert.equal(r.mode, 'execute', v);
      assert.equal(r.reason, 'cli_too_old', v);
      assert.equal(r.version, v);
    }
  });

  it('plan + unknown version → plan (optimistic before initialize)', () => {
    const r = resolveInitialMode({ defaultMode: 'execute', cliPermissionMode: 'plan' });
    assert.equal(r.mode, 'plan');
    assert.equal(r.reason, 'cli_plan');
  });

  it('plan overrides an explicitly requested execute mode (agent really plans)', () => {
    const r = resolveInitialMode({
      requestedMode: 'execute', defaultMode: 'execute', cliPermissionMode: 'plan', agentVersion: '1.0.66',
    });
    assert.equal(r.mode, 'plan');
  });

  it('requestedMode wins over defaultMode when plan is not forced', () => {
    const r = resolveInitialMode({ requestedMode: 'plan', defaultMode: 'execute', agentVersion: '1.0.62' });
    assert.equal(r.mode, 'plan');
    assert.equal(r.reason, 'setting');
  });

  it('alwaysApprove suppresses --permission-mode → no forced plan', () => {
    const r = resolveInitialMode({
      defaultMode: 'execute', cliPermissionMode: 'plan', alwaysApprove: true, agentVersion: '1.0.66',
    });
    assert.equal(r.mode, 'execute');
  });

  it('UI state sequence: optimistic plan → corrected after initialize on old CLI', () => {
    const before = resolveInitialMode({ defaultMode: 'execute', cliPermissionMode: 'plan' });
    assert.equal(before.mode, 'plan');
    const afterOld = resolveInitialMode({ defaultMode: 'execute', cliPermissionMode: 'plan', agentVersion: '1.0.62' });
    assert.equal(afterOld.mode, 'execute');
    const afterNew = resolveInitialMode({ defaultMode: 'execute', cliPermissionMode: 'plan', agentVersion: '1.0.66' });
    assert.equal(afterNew.mode, 'plan');
  });
});

describe('cliStartsInPlanMode / hint', () => {
  it('boundaries', () => {
    assert.equal(cliStartsInPlanMode('1.0.64'), false);
    assert.equal(cliStartsInPlanMode('1.0.65'), true);
    assert.equal(cliStartsInPlanMode('1.0.66'), true);
    assert.equal(cliStartsInPlanMode(undefined), undefined);
    assert.equal(cliStartsInPlanMode('garbage'), undefined);
  });

  it('hint names version and floor', () => {
    const h = planModeTooOldHint('1.0.62');
    assert.match(h, /1\.0\.62/);
    assert.match(h, /1\.0\.65/);
    assert.match(h, /grok update/);
  });
});
