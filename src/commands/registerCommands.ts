import * as vscode from 'vscode';
import type { SessionManager } from '../session/sessionManager';
import type { EditController } from '../edits/editController';
import type { ChatViewProvider } from '../providers/chatViewProvider';
import { EditorChatPanel } from '../providers/editorChatProvider';
import { ContextPicker } from '../context/contextPicker';
import { ContextCollector } from '../context/contextCollector';
import { getConfig } from '../util/config';
import { getLogger } from '../util/logger';
import { detectGrokCli, getInstallInstructions } from '../cli/detect';

export function registerCommands(
  context: vscode.ExtensionContext,
  sessions: SessionManager,
  edits: EditController,
  chatView: ChatViewProvider
): void {
  const picker = new ContextPicker();
  const collector = new ContextCollector();
  const log = getLogger();

  const ensureSession = async () => {
    let s = sessions.getActive();
    if (!s) {
      s = await sessions.createSession();
    }
    return s;
  };

  /** Left activity-bar sidebar (replaces Explorer while focused). */
  const focusGrokSidebar = async () => {
    for (const cmd of [
      'workbench.view.extension.grok-build',
      'grokBuild.chatView.focus',
    ]) {
      try {
        await vscode.commands.executeCommand(cmd);
      } catch {
        /* ignore */
      }
    }
  };

  /**
   * Preferred UI: middle editor tab so Explorer stays on the left.
   * Config: grokBuild.openLocation = editor | sidebar
   * Activity-bar clicks also redirect to editor when openLocation=editor.
   */
  const openGrokUi = async (opts?: {
    force?: 'editor' | 'sidebar' | 'beside';
  }) => {
    await ensureSession();
    const location = opts?.force ?? getConfig().openLocation;

    if (location === 'sidebar') {
      await focusGrokSidebar();
      chatView.pushState();
      chatView.focusInput();
      return;
    }

    if (location === 'beside' || opts?.force === 'beside') {
      EditorChatPanel.showBeside(
        context.extensionUri,
        sessions,
        edits
      );
      return;
    }

    // Default: middle editor area (Explorer stays free on the left)
    EditorChatPanel.show(context.extensionUri, sessions, edits);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('grokBuild.newSession', async () => {
      try {
        await sessions.createSession();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Grok Build: ${message}`);
        return;
      }
      await openGrokUi();
      chatView.pushState();
      EditorChatPanel.current?.pushState();
    }),

    vscode.commands.registerCommand('grokBuild.openChat', async () => {
      await openGrokUi();
    }),

    vscode.commands.registerCommand('grokBuild.openInEditor', async () => {
      await openGrokUi({ force: 'editor' });
    }),

    vscode.commands.registerCommand('grokBuild.openBeside', async () => {
      await openGrokUi({ force: 'beside' });
    }),

    vscode.commands.registerCommand('grokBuild.openInSidebar', async () => {
      await openGrokUi({ force: 'sidebar' });
    }),

    vscode.commands.registerCommand('grokBuild.togglePlanMode', async () => {
      const s = await ensureSession();
      const mode = await sessions.togglePlanMode(s.localId);
      void vscode.window.setStatusBarMessage(
        `Grok Build mode: ${mode}`,
        3000
      );
    }),

    vscode.commands.registerCommand('grokBuild.setPlanMode', async () => {
      const s = await ensureSession();
      await sessions.setMode(s.localId, 'plan');
    }),

    vscode.commands.registerCommand('grokBuild.setExecuteMode', async () => {
      const s = await ensureSession();
      await sessions.setMode(s.localId, 'execute');
    }),

    vscode.commands.registerCommand('grokBuild.addContext', async () => {
      const s = await ensureSession();
      await openGrokUi();
      const item = await picker.pick();
      if (item) {
        sessions.addContext(s.localId, item);
        chatView.pushState();
        EditorChatPanel.current?.pushState();
      }
    }),

    vscode.commands.registerCommand(
      'grokBuild.addFileContext',
      async (uri?: vscode.Uri) => {
        const s = await ensureSession();
        const target =
          uri ??
          vscode.window.activeTextEditor?.document.uri ??
          undefined;
        if (!target) {
          void vscode.window.showWarningMessage('No file selected.');
          return;
        }
        const item = await collector.fromUri(target, false);
        if (item) {
          sessions.addContext(s.localId, item);
          await openGrokUi();
          const hint = `Regarding @${item.label}: `;
          EditorChatPanel.current?.insertText(hint);
          chatView.insertText(hint);
          EditorChatPanel.current?.pushState();
          chatView.pushState();
        }
      }
    ),

    vscode.commands.registerCommand(
      'grokBuild.addFolderContext',
      async (uri?: vscode.Uri) => {
        const s = await ensureSession();
        if (!uri) {
          void vscode.window.showWarningMessage('No folder selected.');
          return;
        }
        const item = await collector.fromUri(uri, true);
        if (item) {
          sessions.addContext(s.localId, item);
          await openGrokUi();
          const hint = `Regarding folder @${item.label}: `;
          EditorChatPanel.current?.insertText(hint);
          chatView.insertText(hint);
          EditorChatPanel.current?.pushState();
          chatView.pushState();
        }
      }
    ),

    vscode.commands.registerCommand('grokBuild.addSelectionContext', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        void vscode.window.showWarningMessage('No selection.');
        return;
      }
      const s = await ensureSession();
      const item = collector.fromSelection(editor);
      sessions.addContext(s.localId, item);
      await openGrokUi();
      const hint = 'About the selected code: ';
      EditorChatPanel.current?.insertText(hint);
      chatView.insertText(hint);
      EditorChatPanel.current?.pushState();
      chatView.pushState();
    }),

    vscode.commands.registerCommand('grokBuild.cancel', () => {
      sessions.cancel();
    }),

    vscode.commands.registerCommand('grokBuild.applyEdit', async (editId?: string) => {
      if (editId) {
        await edits.apply(editId);
      }
    }),

    vscode.commands.registerCommand('grokBuild.rejectEdit', async (editId?: string) => {
      if (editId) {
        await edits.reject(editId);
      }
    }),

    vscode.commands.registerCommand('grokBuild.applyAllEdits', async () => {
      const n = await edits.applyAll(sessions.getActive()?.localId);
      void vscode.window.showInformationMessage(`Applied ${n} edit(s).`);
    }),

    vscode.commands.registerCommand('grokBuild.showDiff', async (editId?: string) => {
      const pending = edits.listPending();
      if (editId) {
        await edits.showDiff(editId);
        return;
      }
      if (pending.length === 0) {
        void vscode.window.showInformationMessage('No pending edits.');
        return;
      }
      if (pending.length === 1) {
        await edits.showDiff(pending[0].id);
        return;
      }
      const picked = await vscode.window.showQuickPick(
        pending.map((e) => ({ label: e.path, id: e.id })),
        { placeHolder: 'Show diff for edit' }
      );
      if (picked) {
        await edits.showDiff(picked.id);
      }
    }),

    vscode.commands.registerCommand('grokBuild.selectModel', async () => {
      await sessions.selectModel();
      chatView.pushState();
      EditorChatPanel.current?.pushState();
    }),

    vscode.commands.registerCommand('grokBuild.selectPermissionMode', async () => {
      await sessions.selectPermissionMode();
      chatView.pushState();
      EditorChatPanel.current?.pushState();
    }),

    vscode.commands.registerCommand('grokBuild.resumeSession', async () => {
      await sessions.openHistoryPicker();
      await openGrokUi();
      chatView.pushState();
      EditorChatPanel.current?.pushState();
    }),

    vscode.commands.registerCommand('grokBuild.clearHistory', async () => {
      const ok = await vscode.window.showWarningMessage(
        'Clear all saved Grok Build session history?',
        { modal: true },
        'Clear'
      );
      if (ok === 'Clear') {
        await sessions.store.clearAll();
        void vscode.window.showInformationMessage('Session history cleared.');
      }
    }),

    vscode.commands.registerCommand('grokBuild.checkCli', async () => {
      const cfg = getConfig();
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Checking Grok CLI…',
        },
        async () => detectGrokCli()
      );
      if (result.ok) {
        void vscode.window.showInformationMessage(
          `Grok CLI ready: ${result.version ?? 'OK'} (${result.cliPath}). Hybrid mode: each session runs \`grok agent stdio\`.`
        );
        return;
      }
      const install = getInstallInstructions();
      const action = await vscode.window.showErrorMessage(
        result.error ??
          `Grok CLI not found (configured path: ${cfg.cliPath}).`,
        'Setup CLI…',
        'Copy install command',
        'Open docs'
      );
      if (action === 'Setup CLI…') {
        await vscode.commands.executeCommand('grokBuild.setupCli');
      } else if (action === 'Copy install command') {
        await vscode.env.clipboard.writeText(install.command);
        void vscode.window.showInformationMessage('Install command copied.');
      } else if (action === 'Open docs') {
        await vscode.env.openExternal(vscode.Uri.parse(install.docsUrl));
      }
    }),

    vscode.commands.registerCommand('grokBuild.focusInput', async () => {
      await openGrokUi();
      EditorChatPanel.current?.focusInput();
      chatView.focusInput();
    })
  );

  log.info('Commands registered');
}
