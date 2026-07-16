import * as vscode from 'vscode';
import type { SessionManager } from '../session/sessionManager';
import type { EditController } from '../edits/editController';
import { ChatViewProvider } from './chatViewProvider';
import { getCliStatus } from '../cli/cliStatus';

/**
 * Grok Build chat as an editor tab in the middle workbench area.
 * Keeps the Explorer (files) on the left — ideal split layout:
 *   [ Explorer ] | [ Code / Grok tab ] | (optional secondary bar)
 */
export class EditorChatPanel {
  public static current: EditorChatPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly provider: ChatViewProvider;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    sessions: SessionManager,
    edits: EditController
  ) {
    this.panel = panel;
    this.provider = new ChatViewProvider(
      extensionUri,
      sessions,
      edits,
      getCliStatus(),
      { editorHost: true }
    );

    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
        vscode.Uri.joinPath(extensionUri, 'webview'),
        vscode.Uri.joinPath(extensionUri, 'media'),
        vscode.Uri.joinPath(extensionUri, 'dist', 'media'),
      ],
    };

    const icon = vscode.Uri.joinPath(extensionUri, 'media', 'icon.svg');
    this.panel.iconPath = { light: icon, dark: icon };

    // Adapt WebviewPanel → WebviewView surface for ChatViewProvider
    const visibilityEmitter = new vscode.EventEmitter<void>();
    this.disposables.push(
      this.panel.onDidChangeViewState(() => {
        visibilityEmitter.fire();
      })
    );

    const fakeView = {
      webview: this.panel.webview,
      get visible() {
        return panel.visible;
      },
      onDidChangeVisibility: visibilityEmitter.event,
      show: (preserveFocus?: boolean) => {
        panel.reveal(panel.viewColumn, preserveFocus);
      },
    } as unknown as vscode.WebviewView;

    this.provider.resolveWebviewView(
      fakeView,
      {} as vscode.WebviewViewResolveContext,
      {} as vscode.CancellationToken
    );

    // Keep tab title in sync with active session
    const syncTitle = () => {
      const s = sessions.getActive();
      this.panel.title = s?.title ? `Grok: ${s.title}` : 'Grok Build';
    };
    sessions.on('sessionChanged', syncTitle);
    sessions.on('activeChanged', syncTitle);
    this.disposables.push({
      dispose: () => {
        sessions.off('sessionChanged', syncTitle);
        sessions.off('activeChanged', syncTitle);
      },
    });
    syncTitle();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  /**
   * Open or reveal Grok in the middle editor area.
   * @param column Prefer Active (current middle group) or Beside (split right of code)
   */
  static show(
    extensionUri: vscode.Uri,
    sessions: SessionManager,
    edits: EditController,
    column?: vscode.ViewColumn
  ): EditorChatPanel {
    // Active = middle editor group (keeps Explorer free on the left)
    const col = column ?? vscode.ViewColumn.Active;

    if (EditorChatPanel.current) {
      EditorChatPanel.current.panel.reveal(col, false);
      EditorChatPanel.current.provider.pushState();
      EditorChatPanel.current.provider.focusInput();
      return EditorChatPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      'grokBuild.editorChat',
      'Grok Build',
      { viewColumn: col, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        enableFindWidget: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
          vscode.Uri.joinPath(extensionUri, 'webview'),
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, 'dist', 'media'),
        ],
      }
    );

    EditorChatPanel.current = new EditorChatPanel(
      panel,
      extensionUri,
      sessions,
      edits
    );
    EditorChatPanel.current.provider.focusInput();
    return EditorChatPanel.current;
  }

  /** Open as a split next to the current editor (code | Grok). */
  static showBeside(
    extensionUri: vscode.Uri,
    sessions: SessionManager,
    edits: EditController
  ): EditorChatPanel {
    return EditorChatPanel.show(
      extensionUri,
      sessions,
      edits,
      vscode.ViewColumn.Beside
    );
  }

  focusInput(): void {
    this.provider.focusInput();
  }

  insertText(text: string): void {
    this.provider.insertText(text);
  }

  pushState(): void {
    this.provider.pushState();
  }

  dispose(): void {
    EditorChatPanel.current = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
    try {
      this.panel.dispose();
    } catch {
      /* already disposed */
    }
  }
}
