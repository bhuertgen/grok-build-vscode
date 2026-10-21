import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { revivedPanelAction, orphanedTabAction, isGrokEditorChatViewType, isExtensionHostRestart, LAST_SESSION_KEY } = require('../dist-test/panelRevive.js');
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('editor chat panel revive (#51)', () => {
  it('adopts a restored panel when none is open, disposes a duplicate otherwise', () => {
    assert.equal(revivedPanelAction(false), 'adopt');
    assert.equal(revivedPanelAction(true), 'dispose');
  });

  it('replaces orphaned Grok tabs only when no live panel owns one', () => {
    assert.equal(orphanedTabAction(false, 1), 'replace');
    assert.equal(orphanedTabAction(false, 2), 'replace');
    assert.equal(orphanedTabAction(false, 0), 'none');
    assert.equal(orphanedTabAction(true, 1), 'none');
  });

  it('recognises the TabInputWebview viewType with or without host prefix', () => {
    assert.equal(isGrokEditorChatViewType('mainThreadWebview-grokBuild.editorChat', 'grokBuild.editorChat'), true);
    assert.equal(isGrokEditorChatViewType('grokBuild.editorChat', 'grokBuild.editorChat'), true);
    assert.equal(isGrokEditorChatViewType('mainThreadWebview-other.editorChat', 'grokBuild.editorChat'), false);
    assert.equal(isGrokEditorChatViewType('xgrokBuild.editorChat', 'grokBuild.editorChat'), false);
    assert.equal(isGrokEditorChatViewType(undefined, 'grokBuild.editorChat'), false);
  });

  it('extension-host restart = same env.sessionId as the previous activation', () => {
    const id = 'd7f5051a-42b4-4c15-ac6d-7beb76f6873b1792573221538';
    assert.equal(isExtensionHostRestart(id, id), true);
    assert.equal(isExtensionHostRestart(id, '16537e66-6c58-43d7-b9c5-bd6654f92dac1792573300562'), false, 'window reload');
    assert.equal(isExtensionHostRestart(undefined, id), false, 'first activation');
    assert.equal(isExtensionHostRestart(id, undefined), false);
    assert.equal(LAST_SESSION_KEY, 'grokBuild.lastActivationSessionId');
  });

  it('activation gates orphan recovery on the host-restart check', () => {
    const ext = read('src/extension.ts');
    assert.match(ext, /isExtensionHostRestart\(\s*context\.workspaceState\.get<string>\(LAST_SESSION_KEY\),\s*vscode\.env\.sessionId/);
    assert.match(ext, /if \(hostRestart\) \{[\s\S]*recoverOrphanedEditorChat/);
    assert.match(ext, /tabGroups\.close\(tabs, true\)/);
  });

  it('serializer, viewType and activation event are wired consistently', () => {
    const pkg = JSON.parse(read('package.json'));
    const provider = read('src/providers/editorChatProvider.ts');
    const ext = read('src/extension.ts');
    const viewType = /static readonly viewType = '([^']+)'/.exec(provider)?.[1];
    assert.equal(viewType, 'grokBuild.editorChat');
    assert.ok(provider.includes('createWebviewPanel(\n      EditorChatPanel.viewType'), 'panel created with the shared viewType');
    assert.ok(pkg.activationEvents.includes(`onWebviewPanel:${viewType}`), 'activation event for revive');
    assert.match(ext, /registerWebviewPanelSerializer\(EditorChatPanel\.viewType/);
    assert.match(ext, /EditorChatPanel\.revive\(/);
  });

  it('trust grant refreshes the editor panel too, not only the sidebar', () => {
    const ext = read('src/extension.ts');
    const block = ext.slice(ext.indexOf('const pushTrustState'), ext.indexOf('onDidGrantWorkspaceTrust'));
    assert.match(block, /EditorChatPanel\.current\?\.pushState\(\)/);
  });
});
