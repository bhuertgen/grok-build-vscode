import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

const EXTENSION_ID = 'bhuertgen.grok-build-vscode';

const REQUIRED_COMMANDS = [
  'grokBuild.openChat',
  'grokBuild.openInEditor',
  'grokBuild.newSession',
  'grokBuild.resumeSession',
  'grokBuild.clearHistory',
  'grokBuild.checkCli',
  'grokBuild.setupCli',
  'grokBuild.togglePlanMode',
  'grokBuild.selectModel',
  'grokBuild.selectPermissionMode',
  'grokBuild.addContext',
  'grokBuild.cancel',
];

suite('Extension activation', () => {
  test('extension is present', () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `Extension ${EXTENSION_ID} not found`);
  });

  test('extension activates', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext);
    await ext.activate();
    assert.equal(ext.isActive, true);
  });

  test('required commands are registered', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    await ext?.activate();
    const all = await vscode.commands.getCommands(true);
    const missing = REQUIRED_COMMANDS.filter((c) => !all.includes(c));
    assert.deepEqual(missing, [], `Missing commands: ${missing.join(', ')}`);
  });
});

suite('Configuration defaults', () => {
  test('grokBuild settings exist with sane defaults', () => {
    const cfg = vscode.workspace.getConfiguration('grokBuild');
    assert.equal(cfg.get('cliPath'), 'grok');
    assert.deepEqual(cfg.get('cliArgs'), ['agent', 'stdio']);
    assert.ok(
      cfg.get('openLocation') === 'editor' || cfg.get('openLocation') === 'sidebar'
    );
    assert.ok(
      cfg.get('defaultMode') === 'execute' || cfg.get('defaultMode') === 'plan'
    );
    assert.ok(typeof cfg.get('sessionHistoryLimit') === 'number');
    assert.ok((cfg.get('sessionHistoryLimit') as number) > 0);
    assert.ok(typeof cfg.get('maxContextFileBytes') === 'number');
  });
});

suite('Workspace trust API', () => {
  test('isTrusted is boolean in test host', () => {
    // With --disable-workspace-trust, typically trusted; still must be boolean
    assert.equal(typeof vscode.workspace.isTrusted, 'boolean');
  });
});
