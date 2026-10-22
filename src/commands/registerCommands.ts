import * as vscode from 'vscode';
import { getGrokTrustMonitor } from '../cli/grokTrust';
import type { SessionManager } from '../session/sessionManager';
import type { EditController } from '../edits/editController';
import type { ChatViewProvider } from '../providers/chatViewProvider';
import { EditorChatPanel } from '../providers/editorChatProvider';
import { ContextPicker } from '../context/contextPicker';
import { ContextCollector } from '../context/contextCollector';
import { getConfig, getWorkspaceCwd } from '../util/config';
import { getLogger } from '../util/logger';
import { detectGrokCli, getInstallInstructions } from '../cli/detect';
import { checkCliUpdate, runCliUpdate } from '../cli/updateCheck';
import { getCliStatus } from '../cli/cliStatus';
import {
  mentionFromSelection,
  pickSelectionRange,
} from '../util/fileRangeMention';

export function registerCommands(
  context: vscode.ExtensionContext,
  sessions: SessionManager,
  edits: EditController,
  chatView: ChatViewProvider
): void {
  const picker = new ContextPicker();
  const collector = new ContextCollector();
  const log = getLogger();

  // Last focused file editor: a webview (chat panel / editor-tab chat) can
  // leave activeTextEditor undefined when Alt+K / menus run.
  let lastFileEditor: vscode.TextEditor | undefined =
    vscode.window.activeTextEditor?.document.uri.scheme === 'file'
      ? vscode.window.activeTextEditor
      : undefined;
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((e) => {
      if (e && e.document.uri.scheme === 'file') {
        lastFileEditor = e;
      }
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor.document.uri.scheme === 'file') {
        lastFileEditor = e.textEditor;
      }
    })
  );

  /**
   * Editor for @file#range: explicit Uri arg (editor/context or title menu)
   * → matching visible editor; else active file editor; else last file
   * editor that is still visible.
   */
  const resolveRangeEditor = (arg?: unknown): vscode.TextEditor | undefined => {
    const visible = vscode.window.visibleTextEditors;
    if (arg instanceof vscode.Uri) {
      const hit =
        (vscode.window.activeTextEditor?.document.uri.toString() === arg.toString()
          ? vscode.window.activeTextEditor
          : undefined) ?? visible.find((e) => e.document.uri.toString() === arg.toString());
      if (hit) {
        return hit;
      }
    }
    const active = vscode.window.activeTextEditor;
    if (active && active.document.uri.scheme === 'file') {
      return active;
    }
    if (lastFileEditor && visible.includes(lastFileEditor)) {
      return lastFileEditor;
    }
    return visible.find((e) => e.document.uri.scheme === 'file');
  };

  const ensureSession = async () => {
    let s = sessions.getActive();
    if (!s) {
      // Restore last project chat if any, otherwise new session
      s = (await sessions.ensureBootstrapSession()) ?? undefined;
    }
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
      // Same gate as the chat "+" button (#41)
      if (!(await chatView.ensureCanStartSession())) {
        return;
      }
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

    vscode.commands.registerCommand('grokBuild.trustFolderForGrok', async () => {
      await getGrokTrustMonitor()?.trustFolder();
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
      // QuickPick BEFORE focusing the chat. openGrokUi() posts focusInput
      // to the webview, which steals focus and dismisses a QuickPick opened
      // afterwards (Alt+G opened the chat and the picker never stayed up).
      // Pre-existing; not introduced by Alt+K. Alt+K does not open a picker.
      const item = await picker.pick();
      if (!item) {
        return;
      }
      sessions.addContext(s.localId, item);
      await openGrokUi();
      chatView.pushState();
      EditorChatPanel.current?.pushState();
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

    vscode.commands.registerCommand('grokBuild.insertSelectionRange', async (arg?: unknown) => {
      const editor = resolveRangeEditor(arg);
      if (!editor || editor.document.uri.scheme !== 'file') {
        void vscode.window.showWarningMessage(
          'No file editor. Open a file and select lines first.'
        );
        return;
      }
      const rel = vscode.workspace.asRelativePath(editor.document.uri, false);
      const picked = pickSelectionRange(editor.selections ?? [editor.selection]);
      getLogger().info(
        `insertSelectionRange editor=${rel} selections=${JSON.stringify(
          (editor.selections ?? []).map((x) => [x.start.line, x.start.character, x.end.line, x.end.character])
        )} picked=${picked.kind}`
      );
      const built = mentionFromSelection({
        relativePath: rel.replace(/\\/g, '/'),
        startLine: picked.kind === 'ok' ? picked.startLine : NaN,
        endLine: picked.kind === 'ok' ? picked.endLine : NaN,
        selectionCount: picked.kind === 'multi' ? picked.count : 1,
        empty: picked.kind === 'empty',
      });
      if (!built.ok) {
        void vscode.window.showWarningMessage(built.message);
        return;
      }
      const range = new vscode.Range(
        built.startLine - 1,
        0,
        built.endLine - 1,
        editor.document.lineAt(Math.min(built.endLine - 1, editor.document.lineCount - 1)).text.length
      );
      const s = await ensureSession();
      const item = collector.fromSelection(editor, range);
      item.label = `${built.mention.replace(/^@/, '')}`;
      item.detail = `L${built.startLine}-L${built.endLine}`;
      item.startLine = built.startLine;
      item.endLine = built.endLine;
      sessions.addContext(s.localId, item);
      await openGrokUi();
      const hint = `${built.mention} `;
      EditorChatPanel.current?.insertText(hint);
      chatView.insertText(hint);
      EditorChatPanel.current?.pushState();
      chatView.pushState();
    }),

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
      const choice = await vscode.window.showWarningMessage(
        'Clear Grok Build chat history?',
        { modal: true },
        'This project only',
        'Clear all'
      );
      if (choice === 'This project only') {
        const n = await sessions.store.clearForCwd(getWorkspaceCwd());
        void vscode.window.showInformationMessage(
          n === 0
            ? 'No history for this project.'
            : `Deleted ${n} chat(s) for this project.`
        );
      } else if (choice === 'Clear all') {
        await sessions.store.clearAll();
        void vscode.window.showInformationMessage('All session history cleared.');
      }
    }),

    vscode.commands.registerCommand('grokBuild.checkCli', async () => {
      const cfg = getConfig();
      const cli = getCliStatus();
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Checking Grok CLI…',
        },
        async () => detectGrokCli()
      );
      if (result.ok) {
        const upd = await checkCliUpdate(result.cliPath);
        cli.update(result);
        cli.setUpdateInfo(upd);
        if (upd.updateAvailable) {
          const act = await vscode.window.showWarningMessage(
            upd.message ??
              `Grok CLI update available: ${upd.currentVersion} → ${upd.latestVersion}`,
            'Update now',
            'Later'
          );
          if (act === 'Update now') {
            await vscode.commands.executeCommand('grokBuild.updateCli');
          }
        } else {
          void vscode.window.showInformationMessage(
            `Grok CLI ready: ${result.version ?? upd.currentVersion ?? 'OK'} (${result.cliPath}). ${upd.message ?? ''} Hybrid: grok agent stdio.`
          );
        }
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

    vscode.commands.registerCommand('grokBuild.updateCli', async () => {
      const cli = getCliStatus();
      const path = cli.detection?.cliPath;
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Updating Grok CLI…',
          cancellable: false,
        },
        async () => runCliUpdate(path ?? undefined)
      );
      if (result.ok) {
        const again = await detectGrokCli(path ?? undefined);
        cli.update(again);
        const upd = await checkCliUpdate(path ?? undefined);
        cli.setUpdateInfo(upd);
        void vscode.window.showInformationMessage(
          result.output ||
            `Grok CLI updated${again.version ? `: ${again.version}` : ''}.`
        );
      } else {
        const act = await vscode.window.showErrorMessage(
          `CLI update failed: ${result.output || 'unknown error'}`,
          'Open terminal hint'
        );
        if (act === 'Open terminal hint') {
          await vscode.env.clipboard.writeText('grok update');
          void vscode.window.showInformationMessage(
            'Command copied: grok update — paste in a terminal.'
          );
        }
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
