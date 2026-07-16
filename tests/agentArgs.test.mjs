import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildAgentArgv, modelFlagBeforeStdio } = require('../dist-test/agentArgs.js');

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
