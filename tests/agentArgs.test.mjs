import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildAgentArgv,
  buildAgentArgsFromConfig,
  modelFlagBeforeStdio,
  topLevelFlagsBeforeAgent,
  isTopLevelOnlyFlag,
  TOP_LEVEL_ONLY_FLAGS,
} = require('../dist-test/agentArgs.js');

describe('buildAgentArgv', () => {
  it('places -m and --no-leader after agent, before stdio', () => {
    const args = buildAgentArgv({
      model: 'grok-composer-2.5-fast',
      noLeader: true,
    });
    assert.deepEqual(args, [
      'agent',
      '--no-leader',
      '-m',
      'grok-composer-2.5-fast',
      'stdio',
    ]);
    assert.equal(modelFlagBeforeStdio(args), true);
  });

  it('does not put model after stdio', () => {
    const args = buildAgentArgv({
      baseArgs: ['agent', 'stdio'],
      model: 'grok-4.5',
    });
    const stdioIdx = args.indexOf('stdio');
    const mIdx = args.indexOf('-m');
    assert.ok(mIdx >= 0);
    assert.ok(mIdx < stdioIdx);
  });

  it('skips -m when already present', () => {
    const args = buildAgentArgv({
      baseArgs: ['agent', '-m', 'keep-me', 'stdio'],
      model: 'other',
    });
    assert.equal(args.filter((a) => a === '-m').length, 1);
    assert.ok(args.includes('keep-me'));
    assert.ok(!args.includes('other'));
  });
});

// #37 — `grok agent` rejects these with "unexpected argument"; they are
// top-level-only options (verified on CLI 1.0.62 stable + 1.0.66 alpha).
const TOP_LEVEL_CASES = [
  { name: 'cliPermissionMode', cfg: { cliPermissionMode: 'plan' }, expect: ['--permission-mode', 'plan'] },
  { name: 'cliPermissionMode acceptEdits', cfg: { cliPermissionMode: 'acceptEdits' }, expect: ['--permission-mode', 'acceptEdits'] },
  { name: 'maxTurns', cfg: { maxTurns: 7 }, expect: ['--max-turns', '7'] },
  { name: 'noSubagents', cfg: { noSubagents: true }, expect: ['--no-subagents'] },
  { name: 'noPlan', cfg: { noPlan: true }, expect: ['--no-plan'] },
  { name: 'disableWebSearch', cfg: { disableWebSearch: true }, expect: ['--disable-web-search'] },
  { name: 'sandbox', cfg: { sandbox: ' workspace ' }, expect: ['--sandbox', 'workspace'] },
  { name: 'tools', cfg: { tools: 'read_file,grep' }, expect: ['--tools', 'read_file,grep'] },
  { name: 'disallowedTools', cfg: { disallowedTools: 'web_search' }, expect: ['--disallowed-tools', 'web_search'] },
  { name: 'rules', cfg: { rules: '- answer in German' }, expect: ['--rules', '- answer in German'] },
];

describe('buildAgentArgsFromConfig: top-level flags before agent (#37)', () => {
  for (const c of TOP_LEVEL_CASES) {
    it(`${c.name} → ${c.expect[0]} before agent`, () => {
      const args = buildAgentArgsFromConfig(c.cfg, ['agent', 'stdio']);
      const agentIdx = args.indexOf('agent');
      const flagIdx = args.indexOf(c.expect[0]);
      assert.ok(flagIdx >= 0, `${c.expect[0]} missing: ${args.join(' ')}`);
      assert.ok(flagIdx < agentIdx, `${c.expect[0]} must precede agent: ${args.join(' ')}`);
      assert.deepEqual(args.slice(flagIdx, flagIdx + c.expect.length), c.expect);
      assert.deepEqual(args.slice(agentIdx), ['agent', '--no-leader', 'stdio']);
      assert.equal(topLevelFlagsBeforeAgent(args), true);
    });
  }

  it('all settings combined → exact argv layout', () => {
    const args = buildAgentArgsFromConfig(
      {
        cliPermissionMode: 'plan',
        maxTurns: 3,
        noSubagents: true,
        noPlan: true,
        disableWebSearch: true,
        sandbox: 'workspace',
        tools: 'read_file',
        disallowedTools: 'web_search',
        rules: 'be brief',
        debug: true,
        reasoningEffort: 'high',
      },
      ['agent', 'stdio'],
      'grok-4.7'
    );
    assert.deepEqual(args, [
      '--permission-mode', 'plan',
      '--max-turns', '3',
      '--no-subagents',
      '--no-plan',
      '--disable-web-search',
      '--sandbox', 'workspace',
      '--tools', 'read_file',
      '--disallowed-tools', 'web_search',
      '--rules', 'be brief',
      'agent',
      '--no-leader',
      '-m', 'grok-4.7',
      '--reasoning-effort', 'high',
      '--debug',
      'stdio',
    ]);
    assert.equal(topLevelFlagsBeforeAgent(args), true);
    assert.equal(modelFlagBeforeStdio(args), true);
  });

  it('agent-level flags stay between agent and stdio', () => {
    const args = buildAgentArgsFromConfig(
      { alwaysApprove: true, debug: true, reasoningEffort: 'low' },
      ['agent', 'stdio'],
      'grok-4.5'
    );
    assert.deepEqual(args, [
      'agent', '--no-leader', '-m', 'grok-4.5', '--reasoning-effort', 'low', '--always-approve', '--debug', 'stdio',
    ]);
  });

  it('bypassPermissions maps to agent-level --always-approve, no --permission-mode', () => {
    const args = buildAgentArgsFromConfig({ cliPermissionMode: 'bypassPermissions' }, ['agent', 'stdio']);
    assert.ok(!args.includes('--permission-mode'));
    const i = args.indexOf('--always-approve');
    assert.ok(i > args.indexOf('agent') && i < args.indexOf('stdio'));
  });

  it('alwaysApprove suppresses --permission-mode', () => {
    const args = buildAgentArgsFromConfig({ alwaysApprove: true, cliPermissionMode: 'plan' }, ['agent', 'stdio']);
    assert.ok(!args.includes('--permission-mode'));
  });

  it('UI permissionMode allow-always → agent-level --always-approve', () => {
    const args = buildAgentArgsFromConfig({ permissionMode: 'allow-always' }, ['agent', 'stdio']);
    const i = args.indexOf('--always-approve');
    assert.ok(i > args.indexOf('agent') && i < args.indexOf('stdio'));
  });

  it('maxTurns 0 / null emits nothing', () => {
    assert.ok(!buildAgentArgsFromConfig({ maxTurns: 0 }, []).includes('--max-turns'));
    assert.ok(!buildAgentArgsFromConfig({ maxTurns: null }, []).includes('--max-turns'));
  });

  it('empty cliArgs default to agent stdio', () => {
    assert.deepEqual(buildAgentArgsFromConfig({ noPlan: true }, []), ['--no-plan', 'agent', '--no-leader', 'stdio']);
  });

  it('does not duplicate a top-level flag already present in cliArgs', () => {
    const args = buildAgentArgsFromConfig(
      { cliPermissionMode: 'plan', maxTurns: 9 },
      ['--max-turns', '2', 'agent', 'stdio']
    );
    assert.equal(args.filter((a) => a === '--max-turns').length, 1);
    assert.ok(args.includes('2') && !args.includes('9'));
    assert.deepEqual(args.slice(0, 5), ['--max-turns', '2', '--permission-mode', 'plan', 'agent']);
    assert.equal(topLevelFlagsBeforeAgent(args), true);
  });

  it('extraCliArgs stay agent-level (raw passthrough)', () => {
    const args = buildAgentArgsFromConfig({ extraCliArgs: ['--plugin-dir', '/tmp/p'] }, ['agent', 'stdio']);
    assert.deepEqual(args, ['agent', '--no-leader', '--plugin-dir', '/tmp/p', 'stdio']);
  });
});

describe('top-level flag helpers', () => {
  it('TOP_LEVEL_ONLY_FLAGS lists exactly the nine top-level-only flags', () => {
    assert.deepEqual([...TOP_LEVEL_ONLY_FLAGS].sort(), [
      '--disable-web-search', '--disallowed-tools', '--max-turns', '--no-plan', '--no-subagents',
      '--permission-mode', '--rules', '--sandbox', '--tools',
    ]);
  });

  it('isTopLevelOnlyFlag: agent-level flags are not top-level-only', () => {
    for (const f of ['-m', '--model', '--reasoning-effort', '--always-approve', '--no-leader', '--debug']) {
      assert.equal(isTopLevelOnlyFlag(f), false, f);
    }
    assert.equal(isTopLevelOnlyFlag('--permission-mode=plan'), true);
  });

  it('topLevelFlagsBeforeAgent detects the old (broken) layout', () => {
    assert.equal(topLevelFlagsBeforeAgent(['agent', '--permission-mode', 'plan', 'stdio']), false);
    assert.equal(topLevelFlagsBeforeAgent(['--permission-mode', 'plan', 'agent', 'stdio']), true);
  });

  it('buildAgentArgv topLevelFlags keeps value pairs even if value starts with -', () => {
    const args = buildAgentArgv({ topLevelFlags: ['--rules', '-x', '--no-plan'], noLeader: false });
    assert.deepEqual(args, ['--rules', '-x', '--no-plan', 'agent', 'stdio']);
  });
});
