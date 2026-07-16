import * as vscode from 'vscode';
import { getLogger } from './util/logger';
import { SessionStore } from './session/sessionStore';
import { SessionManager } from './session/sessionManager';
import { EditController, DiffContentProvider } from './edits/editController';
import { ChatViewProvider } from './providers/chatViewProvider';
import { registerCommands } from './commands/registerCommands';
import { ensureCliReady, resetCliOnboardSkip } from './cli/onboard';
import { detectGrokCli } from './cli/detect';
import { getCliStatus } from './cli/cliStatus';
import { checkCliUpdate } from './cli/updateCheck';
import { checkExtensionUpdate } from './util/extensionUpdate';
import {
  getTrustBannerMessage,
  isWorkspaceTrusted,
  promptTrustWorkspace,
} from './util/workspaceTrust';

let sessions: SessionManager | undefined;

/**
 * Hybrid architecture entry point:
 * - Extension = native VS Code UX (webview, context, diffs, multi-session)
 * - Backend   = official Grok Build CLI via ACP (`grok agent stdio`)
 * - One CLI process per chat session
 */
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const log = getLogger();
  const cliStatus = getCliStatus();
  log.info('Activating Grok Build for VS Code (hybrid ACP client)');

  const store = new SessionStore(context.globalState);
  const edits = new EditController();
  sessions = new SessionManager(store, edits);

  const chatView = new ChatViewProvider(
    context.extensionUri,
    sessions,
    edits,
    cliStatus
  );

  const diffProvider = new DiffContentProvider(edits);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      'grok-build-diff',
      diffProvider
    )
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatView,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  registerCommands(context, sessions, edits, chatView);

  context.subscriptions.push(
    vscode.commands.registerCommand('grokBuild.setupCli', async () => {
      await resetCliOnboardSkip(context);
      cliStatus.setChecking();
      chatView.pushState();
      const result = await ensureCliReady(context, { force: true });
      cliStatus.update(result.detection);
      chatView.pushState();
      if (result.ready) {
        void vscode.window.showInformationMessage(
          `Grok CLI ready${result.detection.version ? `: ${result.detection.version}` : ''} (${result.detection.cliPath})`
        );
        // Restore last project chat or create empty session
        if (sessions && sessions.listSessions().length === 0) {
          await sessions.ensureBootstrapSession();
          chatView.pushState();
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('grokBuild')) {
        log.refreshLevel();
      }
    })
  );

  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  status.command = 'grokBuild.openChat';
  // Status bar: codicons only support built-in set; brand mark lives in activity bar (media/icon.svg)
  status.text = '$(globe) Grok';
  status.tooltip = 'Open Grok Build (ACP → grok agent stdio)';
  status.show();
  context.subscriptions.push(status);

  const refreshStatusBar = () => {
    const snap = cliStatus.snapshot;
    status.backgroundColor = undefined;
    if (cliStatus.checking) {
      status.text = '$(sync~spin) Grok';
      status.tooltip = 'Checking Grok CLI…';
      status.command = 'grokBuild.openChat';
      return;
    }
    if (!snap.ready) {
      status.text = '$(warning) Grok';
      status.tooltip =
        'Grok CLI not found — click to run Setup CLI…';
      status.command = 'grokBuild.setupCli';
      return;
    }
    if (snap.updateAvailable || snap.extensionUpdateAvailable) {
      status.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      if (snap.extensionUpdateAvailable && !snap.updateAvailable) {
        status.text = `$(cloud-download) Grok Ext ${snap.extensionUpdateLatest ?? ''}`.trim();
        status.tooltip =
          (snap.extensionUpdateMessage ?? 'Extension update available') +
          '\nClick to open Grok Build · GitHub Release';
      } else if (snap.updateAvailable && !snap.extensionUpdateAvailable) {
        status.text = `$(cloud-download) Grok CLI ${snap.updateLatest ?? ''}`.trim();
        status.tooltip =
          (snap.updateMessage ?? 'Grok CLI update available') +
          '\nClick to open Grok Build · Update: grok update';
      } else {
        status.text = '$(cloud-download) Grok updates';
        status.tooltip = [
          snap.extensionUpdateMessage,
          snap.updateMessage,
        ]
          .filter(Boolean)
          .join('\n');
      }
      status.command = 'grokBuild.openChat';
      return;
    }
    const active = sessions?.getActive();
    const mode = active?.mode === 'plan' ? 'Plan' : 'Exec';
    const busy = active?.busy ? '…' : '';
    const n = sessions?.processCount ?? 0;
    status.text = `Grok ${mode}${busy}`;
    status.tooltip = active?.usage
      ? `Grok Build · ${active.usage.used}/${active.usage.size} tokens · ${n} agent process(es) · ${snap.version ?? snap.cliPath}`
      : `Grok Build · CLI ${snap.version ?? 'OK'} · ${n} process(es) · hybrid ACP`;
    status.command = 'grokBuild.openChat';
  };

  sessions.on('sessionChanged', () => refreshStatusBar());
  cliStatus.on('changed', () => {
    refreshStatusBar();
    chatView.pushState();
  });

  context.subscriptions.push({
    dispose: () => {
      void sessions?.dispose();
      log.dispose();
    },
  });

  // Workspace Trust / Restricted Mode
  const pushTrustState = () => {
    chatView.pushState();
    // Editor panel gets state via its own provider instance on next push
  };
  if (!isWorkspaceTrusted()) {
    log.warn(getTrustBannerMessage());
    void promptTrustWorkspace();
  }
  context.subscriptions.push(
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      log.info('Workspace trust granted — writes/tools enabled');
      void vscode.window.showInformationMessage(
        'Workspace trusted. Grok Build can write files and run tools now.'
      );
      pushTrustState();
    })
  );

  // CLI detection + update check (async; UI already registered)
  void (async () => {
    cliStatus.setChecking();
    const result = await ensureCliReady(context);
    cliStatus.update(result.detection);
    if (result.ready) {
      log.info(
        `CLI OK: ${result.detection.cliPath}${result.detection.version ? ` (${result.detection.version})` : ''}`
      );
      try {
        const upd = await checkCliUpdate(result.detection.cliPath);
        cliStatus.setUpdateInfo(upd);
        if (upd.updateAvailable) {
          log.info(upd.message ?? 'CLI update available');
        }
      } catch (err) {
        log.debug('CLI update check failed', err);
      }
    } else {
      log.warn('CLI not ready', result.detection.error);
    }
    try {
      const extUpd = await checkExtensionUpdate();
      cliStatus.setExtensionUpdateInfo(extUpd);
      if (extUpd.updateAvailable) {
        log.info(extUpd.message ?? 'Extension update available');
      } else if (extUpd.message) {
        log.debug(extUpd.message);
      }
    } catch (err) {
      log.debug('Extension update check failed', err);
    }
    refreshStatusBar();
    pushTrustState();
  })();

  log.info('Grok Build activated');
}

export function deactivate(): void {
  void sessions?.dispose();
  sessions = undefined;
}

export async function diagnoseCli(): Promise<string> {
  const d = await detectGrokCli();
  return d.ok
    ? `OK ${d.cliPath} ${d.version ?? ''}`.trim()
    : `FAIL ${d.error ?? 'unknown'}`;
}
