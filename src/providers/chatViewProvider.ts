import * as fs from 'node:fs';
import * as vscode from 'vscode';
import type { SessionManager, SessionState } from '../session/sessionManager';
import type { EditController } from '../edits/editController';
import { ContextPicker } from '../context/contextPicker';
import { getLogger } from '../util/logger';
import { getConfig } from '../util/config';
import { permissionModeLabel } from '../session/sessionManager';
import {
  getTrustBannerMessage,
  isWorkspaceTrusted,
} from '../util/workspaceTrust';
import type { CliStatus } from '../cli/cliStatus';

export interface ChatViewProviderOptions {
  /**
   * True when this provider hosts the middle editor panel.
   * Sidebar host redirects to the editor when openLocation=editor.
   */
  editorHost?: boolean;
}

/**
 * Webview chat UI — used for both sidebar and middle editor panel.
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'grokBuild.chatView';

  private view?: vscode.WebviewView;
  private readonly log = getLogger();
  private readonly picker = new ContextPicker();
  private redirectingToEditor = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly sessions: SessionManager,
    private readonly edits: EditController,
    private readonly cliStatus?: CliStatus,
    private readonly options: ChatViewProviderOptions = {}
  ) {
    sessions.on('sessionChanged', () => this.pushState());
    sessions.on('sessionCreated', () => this.pushState());
    sessions.on('sessionClosed', () => this.pushState());
    sessions.on('activeChanged', () => this.pushState());
    sessions.on('requestContextPicker', () => {
      void this.onMessage({ type: 'addContext' });
    });
    sessions.on('permissionRequest', (payload: unknown) => {
      void this.view?.webview.postMessage({
        type: 'permissionRequest',
        ...(payload as object),
      });
      this.pushState();
    });
    sessions.on('permissionResolved', () => this.pushState());
    edits.on('queued', () => this.pushState());
    edits.on('applied', () => this.pushState());
    edits.on('rejected', () => this.pushState());

    // When CLI becomes ready, auto-open first session if none exist
    cliStatus?.on('changed', (snap: { ready: boolean }) => {
      void (async () => {
        if (snap.ready && this.sessions.listSessions().length === 0) {
          try {
            await this.sessions.ensureBootstrapSession();
          } catch (err) {
            this.log.warn('Auto-create session after CLI ready failed', err);
          }
        }
        this.pushState();
      })();
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
        vscode.Uri.joinPath(this.extensionUri, 'webview'),
        vscode.Uri.joinPath(this.extensionUri, 'media'),
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'media'),
      ],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        await this.onMessage(msg);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.log.error('Webview message handler error', message);
        void vscode.window.showErrorMessage(`Grok Build: ${message}`);
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.pushState();
        // Activity-bar click always opens the left sidebar — redirect to middle editor
        void this.maybeRedirectSidebarToEditor();
      }
    });

    this.pushState();
    // First resolve (icon click / first open)
    void this.maybeRedirectSidebarToEditor();
  }

  /**
   * When default open location is the middle editor, treat the left activity-bar
   * view as a launcher: open Grok as editor tab and restore the Explorer.
   */
  private async maybeRedirectSidebarToEditor(): Promise<void> {
    if (this.options.editorHost) {
      return;
    }
    if (getConfig().openLocation !== 'editor') {
      return;
    }
    if (this.redirectingToEditor) {
      return;
    }
    this.redirectingToEditor = true;
    try {
      this.log.info('Redirecting Grok sidebar → middle editor (openLocation=editor)');
      await vscode.commands.executeCommand('grokBuild.openInEditor');
      // Put file tree back on the left
      try {
        await vscode.commands.executeCommand('workbench.view.explorer');
      } catch {
        /* explorer may be unavailable without a folder */
      }
    } catch (err) {
      this.log.warn('Redirect to editor failed', err);
    } finally {
      setTimeout(() => {
        this.redirectingToEditor = false;
      }, 800);
    }
  }

  focusInput(): void {
    void this.view?.webview.postMessage({ type: 'focusInput' });
  }

  insertText(text: string): void {
    void this.view?.webview.postMessage({ type: 'insertText', text });
  }

  pushState(): void {
    if (!this.view) {
      return;
    }
    const sessions = this.sessions.listSessions().map((s) => this.serialize(s));
    const active = this.sessions.getActive();
    const pendingEdits = this.edits.listPending(active?.localId);
    void this.view.webview.postMessage({
      type: 'state',
      sessions,
      activeId: active?.localId ?? null,
      pendingEdits,
      cli: this.cliStatus?.snapshot ?? {
        ready: true,
        checking: false,
        cliPath: null,
        version: null,
        error: null,
        updateAvailable: false,
        updateCurrent: null,
        updateLatest: null,
        updateMessage: null,
        updateChannel: null,
        extensionUpdateAvailable: false,
        extensionUpdateCurrent: null,
        extensionUpdateLatest: null,
        extensionUpdateMessage: null,
        extensionReleaseUrl: null,
        extensionVsixUrl: null,
      },
      processCount: this.sessions.processCount,
      settings: this.settingsSnapshot(),
      workspaceTrusted: isWorkspaceTrusted(),
      trustMessage: isWorkspaceTrusted() ? null : getTrustBannerMessage(),
      /** Project-scoped chat history (Claude Code–style resume list) */
      history: this.sessions.listHistoryForWorkspace(40),
    });
  }

  private serialize(s: SessionState) {
    return {
      localId: s.localId,
      title: s.title,
      mode: s.mode,
      model: s.model,
      status: s.status,
      busy: s.busy,
      lastError: s.lastError,
      messages: s.messages,
      toolCalls: s.toolCalls.map((t) => serializeToolCall(t)),
      /** Active / recent tools for multi-agent status strip */
      agents: s.toolCalls
        .filter(
          (t) =>
            t.status === 'pending' ||
            t.status === 'in_progress' ||
            (t.finishedAt && Date.now() - t.finishedAt < 120_000)
        )
        .slice(-20)
        .map((t) => serializeToolCall(t)),
      plan: s.plan,
      usage: s.usage,
      contextItems: s.contextItems,
      availableCommands: s.availableCommands ?? [],
      agentContext: s.agentContext ?? 'new',
      seedHistoryOnNextPrompt: !!s.seedHistoryOnNextPrompt,
      contextNoticeDismissed: !!s.contextNoticeDismissed,
    };
  }

  private settingsSnapshot() {
    const cfg = getConfig();
    const activeId = this.sessions.getActive()?.localId;
    return {
      permissionMode: cfg.permissionMode,
      permissionLabel: permissionModeLabel(cfg),
      alwaysApprove: cfg.alwaysApprove,
      cliPermissionMode: cfg.cliPermissionMode || null,
      defaultModel: cfg.defaultModel || null,
      models: this.sessions.getModelChoicesForUi(activeId),
      permissions: this.sessions.getPermissionChoicesForUi(),
    };
  }

  private async ensureCanStartSession(): Promise<boolean> {
    if (this.cliStatus?.checking) {
      void vscode.window.showInformationMessage(
        'Still checking for the Grok CLI…'
      );
      return false;
    }
    if (this.cliStatus && !this.cliStatus.ready) {
      const action = await vscode.window.showWarningMessage(
        'Grok CLI not found. This extension needs the official CLI (`grok agent stdio`).',
        'Setup CLI…',
        'Cancel'
      );
      if (action === 'Setup CLI…') {
        await vscode.commands.executeCommand('grokBuild.setupCli');
      }
      return this.cliStatus.ready;
    }
    return true;
  }

  private async onMessage(msg: { type: string; [key: string]: unknown }): Promise<void> {
    switch (msg.type) {
      case 'ready':
        if (
          this.sessions.listSessions().length === 0 &&
          this.cliStatus?.ready
        ) {
          await this.sessions.ensureBootstrapSession();
        }
        this.pushState();
        break;

      case 'newSession':
        if (!(await this.ensureCanStartSession())) {
          return;
        }
        await this.sessions.createSession();
        this.pushState();
        break;

      case 'setActive':
        this.sessions.setActive(msg.localId as string);
        break;

      case 'closeSession':
        await this.sessions.closeSession(msg.localId as string);
        if (
          this.sessions.listSessions().length === 0 &&
          this.cliStatus?.ready
        ) {
          await this.sessions.createSession();
        }
        break;

      case 'sendPrompt':
        await this.sessions.sendPrompt(
          msg.localId as string,
          msg.text as string,
          {
            images: msg.images as
              | Array<{ mimeType: string; data: string }>
              | undefined,
          }
        );
        break;

      case 'cancel':
        this.sessions.cancel(msg.localId as string);
        break;

      case 'toggleMode':
        await this.sessions.togglePlanMode(msg.localId as string);
        break;

      case 'addContext': {
        // Open bottom context-kind menu in webview (no top QuickPick hub)
        void this.view?.webview.postMessage({
          type: 'openPicker',
          picker: 'context',
        });
        break;
      }

      case 'removeContext':
        this.sessions.removeContext(
          msg.localId as string,
          msg.itemId as string
        );
        break;

      case 'selectModel':
        // Webview opens its own bottom picker; palette still uses QuickPick
        if (typeof msg.modelId === 'string' && msg.modelId) {
          const id =
            (msg.localId as string) ||
            this.sessions.getActive()?.localId;
          if (id) {
            await this.sessions.applyModel(id, msg.modelId);
          }
        } else {
          // Request: webview should show bottom menu (no QuickPick)
          this.pushState();
          void this.view?.webview.postMessage({ type: 'openPicker', picker: 'model' });
        }
        this.pushState();
        break;

      case 'applyModel': {
        const id =
          (msg.localId as string) || this.sessions.getActive()?.localId;
        try {
          if (id && typeof msg.modelId === 'string') {
            await this.sessions.applyModel(id, msg.modelId);
          }
        } catch (err) {
          this.log.error('applyModel failed', err);
        } finally {
          this.pushState();
        }
        break;
      }

      case 'selectPermissionMode':
        try {
          if (typeof msg.mode === 'string' && msg.mode) {
            await this.sessions.applyPermissionMode(
              msg.localId as string | undefined,
              msg.mode
            );
          } else {
            this.pushState();
            void this.view?.webview.postMessage({
              type: 'openPicker',
              picker: 'permission',
            });
          }
        } finally {
          this.pushState();
        }
        break;

      case 'applyPermissionMode':
        try {
          await this.sessions.applyPermissionMode(
            msg.localId as string | undefined,
            String(msg.mode ?? '')
          );
        } finally {
          this.pushState();
        }
        break;

      case 'openContextKind': {
        const kind = String(msg.kind ?? '');
        const active = this.sessions.getActive();
        if (!active) {
          break;
        }
        try {
          const item = await this.picker.pickKind(kind);
          if (item) {
            this.sessions.addContext(active.localId, item);
          }
        } catch (err) {
          this.log.error('openContextKind failed', err);
        } finally {
          this.pushState();
        }
        break;
      }

      /** @-mention: fuzzy file list from current workspace */
      case 'queryWorkspaceFiles': {
        const query = String(msg.query ?? '');
        const files = await this.picker.listWorkspaceFiles(query, 60);
        void this.view?.webview.postMessage({
          type: 'workspaceFiles',
          query,
          files,
        });
        break;
      }

      case 'addContextPath': {
        const active = this.sessions.getActive();
        const fsPath = String(msg.path ?? '');
        if (!active || !fsPath) {
          break;
        }
        const item = await this.picker.fromPath(fsPath);
        if (item) {
          this.sessions.addContext(active.localId, item);
          this.pushState();
          void this.view?.webview.postMessage({
            type: 'contextAdded',
            label: item.label,
          });
        }
        break;
      }

      case 'openAtFilePicker': {
        const active = this.sessions.getActive();
        if (!active) {
          break;
        }
        const query = String(msg.query ?? '');
        const item = await this.picker.pickWorkspaceFile(query);
        if (item) {
          this.sessions.addContext(active.localId, item);
          this.pushState();
          void this.view?.webview.postMessage({
            type: 'contextAdded',
            label: item.label,
          });
        }
        break;
      }

      case 'resumeSession':
        if (!(await this.ensureCanStartSession())) {
          return;
        }
        await this.sessions.openHistoryPicker();
        this.pushState();
        break;

      case 'resumeSessionId': {
        if (!(await this.ensureCanStartSession())) {
          return;
        }
        const localId = String(msg.localId ?? '');
        if (localId) {
          await this.sessions.resumeFromStore(localId);
        }
        this.pushState();
        break;
      }

      case 'seedHistory': {
        const active = this.sessions.getActive();
        const id = String(msg.localId ?? active?.localId ?? '');
        if (id) {
          this.sessions.enableHistorySeed(id);
        }
        this.pushState();
        break;
      }

      case 'dismissContextNotice': {
        const active = this.sessions.getActive();
        const id = String(msg.localId ?? active?.localId ?? '');
        if (id) {
          this.sessions.dismissHistoryBanner(id);
        }
        this.pushState();
        break;
      }

      case 'showDiff':
        await this.edits.showDiff(msg.editId as string);
        break;

      case 'applyEdit':
        await this.edits.apply(msg.editId as string);
        this.pushState();
        break;

      case 'rejectEdit':
        await this.edits.reject(msg.editId as string);
        this.pushState();
        break;

      case 'applyAllEdits': {
        const active = this.sessions.getActive();
        await this.edits.applyAll(active?.localId);
        this.pushState();
        break;
      }

      case 'setupCli':
        await vscode.commands.executeCommand('grokBuild.setupCli');
        break;

      case 'checkCli':
        await vscode.commands.executeCommand('grokBuild.checkCli');
        break;

      case 'updateCli':
        await vscode.commands.executeCommand('grokBuild.updateCli');
        break;

      case 'dismissCliUpdate':
        this.cliStatus?.dismissUpdateBanner();
        this.pushState();
        break;

      case 'dismissExtUpdate':
        this.cliStatus?.dismissExtensionUpdateBanner();
        this.pushState();
        break;

      case 'openExtRelease': {
        const url = String(msg.url ?? '');
        if (url) {
          await vscode.env.openExternal(vscode.Uri.parse(url));
        }
        break;
      }

      case 'manageWorkspaceTrust':
        await vscode.commands.executeCommand('workbench.trust.manage');
        break;

      case 'permissionResponse': {
        const permId = String(msg.id ?? '');
        const decision = String(msg.decision ?? 'cancel') as
          | 'allow'
          | 'allow_always'
          | 'reject'
          | 'cancel';
        const options = (msg.options ?? []) as Array<{
          optionId: string;
          name: string;
          kind: string;
        }>;
        this.sessions.respondPermissionFromUi(permId, decision, options as never);
        this.pushState();
        break;
      }

      case 'toast':
        if (typeof msg.text === 'string') {
          void vscode.window.showInformationMessage(msg.text);
        }
        break;

      case 'openExternal':
        if (typeof msg.url === 'string') {
          await vscode.env.openExternal(vscode.Uri.parse(msg.url));
        }
        break;

      default:
        this.log.debug('Unknown webview message', msg.type);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const distWebview = vscode.Uri.joinPath(
      this.extensionUri,
      'dist',
      'webview'
    );
    const fallbackWebview = vscode.Uri.joinPath(this.extensionUri, 'webview');

    const styleOnDisk =
      tryUri(distWebview, 'styles.css') ?? tryUri(fallbackWebview, 'styles.css')!;
    const scriptOnDisk =
      tryUri(distWebview, 'main.js') ?? tryUri(fallbackWebview, 'main.js')!;

    const styleUri = webview.asWebviewUri(styleOnDisk);
    const scriptUri = webview.asWebviewUri(scriptOnDisk);

    const logoOnDisk = vscode.Uri.joinPath(
      this.extensionUri,
      'media',
      'grok.svg'
    );
    const logoUri = webview.asWebviewUri(logoOnDisk);

    // Match VS Code defaults: editor.fontSize is 14 by default
    const editorFontSize = vscode.workspace
      .getConfiguration('editor')
      .get<number>('fontSize', 14);
    const chatFontSize = vscode.workspace
      .getConfiguration('chat')
      .get<number>('editor.fontSize', editorFontSize);
    // Prefer chat font size if set, else editor (standard VS Code = 14)
    const fontSize = Math.max(13, chatFontSize || editorFontSize || 14);
    // Agent answers a bit larger than the user bubble for readability
    const fontSizeAgent = fontSize + 1;

    const htmlPath =
      tryUri(distWebview, 'index.html') ?? tryUri(fallbackWebview, 'index.html');
    let html = fs.readFileSync(htmlPath!.fsPath, 'utf8');
    html = html
      .replace(/\{\{cspSource\}\}/g, webview.cspSource)
      .replace(/\{\{styleUri\}\}/g, styleUri.toString())
      .replace(/\{\{scriptUri\}\}/g, scriptUri.toString())
      .replace(/\{\{logoUri\}\}/g, logoUri.toString())
      .replace(/\{\{fontSize\}\}/g, String(fontSize))
      .replace(/\{\{fontSizeAgent\}\}/g, String(fontSizeAgent));
    return html;
  }
}

function serializeToolCall(t: {
  id: string;
  title: string;
  kind: string;
  status: string;
  startedAt: number;
  finishedAt?: number;
  content?: unknown[];
  rawInput?: unknown;
  locations?: Array<{ path: string; line?: number }>;
}) {
  const { input, output } = extractToolIo(t);
  const durationMs =
    t.finishedAt && t.startedAt
      ? Math.max(0, t.finishedAt - t.startedAt)
      : undefined;
  return {
    id: t.id,
    title: t.title,
    kind: t.kind,
    status: t.status,
    startedAt: t.startedAt,
    finishedAt: t.finishedAt,
    durationMs,
    input,
    output,
    locations: t.locations,
  };
}

function extractToolIo(t: {
  content?: unknown[];
  rawInput?: unknown;
}): { input: string; output: string } {
  let input = '';
  let output = '';
  if (t.rawInput != null) {
    try {
      input =
        typeof t.rawInput === 'string'
          ? t.rawInput
          : JSON.stringify(t.rawInput, null, 2);
    } catch {
      input = String(t.rawInput);
    }
  }
  for (const block of t.content ?? []) {
    if (!block || typeof block !== 'object') {
      continue;
    }
    const b = block as Record<string, unknown>;
    if (b.type === 'diff') {
      const p = String(b.path ?? '');
      const newText = String(b.newText ?? '').slice(0, 4000);
      output += (output ? '\n' : '') + `diff ${p}\n${newText}`;
    } else if (b.type === 'content') {
      const c = b.content as { type?: string; text?: string } | undefined;
      if (c?.type === 'text' && c.text) {
        output += (output ? '\n' : '') + c.text;
      }
    } else if (b.type === 'terminal') {
      output += (output ? '\n' : '') + `terminal:${String(b.terminalId ?? '')}`;
    }
  }
  if (input.length > 6000) {
    input = input.slice(0, 6000) + '\n…';
  }
  if (output.length > 8000) {
    output = output.slice(0, 8000) + '\n…';
  }
  return { input, output };
}

function tryUri(base: vscode.Uri, file: string): vscode.Uri | undefined {
  const u = vscode.Uri.joinPath(base, file);
  try {
    if (fs.existsSync(u.fsPath)) {
      return u;
    }
  } catch {
    /* ignore */
  }
  if (base.fsPath.includes('dist')) {
    return u;
  }
  return undefined;
}
