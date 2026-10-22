/**
 * Grok CLI folder-trust banner (P1) — VS Code glue around the pure
 * `util/grokFolderTrust` module. Detects whether Grok trusts the workspace
 * folder and whether the project has hooks, rules, skills or MCP servers that
 * Grok would skip, keeps the banner state, and runs the "Trust folder" flow.
 */
import { EventEmitter } from 'node:events';
import * as nodeFs from 'node:fs';
import * as vscode from 'vscode';
import { getWorkspaceCwd } from '../util/config';
import { normalizeCwdKey } from '../util/cwd';
import {
  grokHomeDir,
  grokTrustBannerState,
  inspectFolderTrust,
  needsGrokTrust,
  trustStorePath,
  type FolderTrustInfo,
  type GrokTrustBannerState,
} from '../util/grokFolderTrust';
import { getLogger } from '../util/logger';
import { isWorkspaceTrusted } from '../util/workspaceTrust';
import type { SessionManager } from '../session/sessionManager';

const DISMISSED_KEY = 'grokBuild.grokTrustBannerDismissed';

export class GrokTrustMonitor extends EventEmitter {
  private info?: FolderTrustInfo;
  private readonly log = getLogger();
  private watcher?: nodeFs.FSWatcher;
  private refreshTimer?: NodeJS.Timeout;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly state: vscode.Memento,
    private readonly sessions: SessionManager
  ) {
    super();
    this.refresh();
    this.watchTrustStore();
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
      vscode.workspace.onDidGrantWorkspaceTrust(() => this.refresh()),
      vscode.window.onDidChangeWindowState((e) => {
        if (e.focused) {
          this.scheduleRefresh();
        }
      })
    );
    sessions.on('sessionCreated', () => this.scheduleRefresh());
  }

  private folder(): string | undefined {
    return vscode.workspace.workspaceFolders?.length ? getWorkspaceCwd() : undefined;
  }

  /** Re-read the trust store and project sources; emits `changed` on a difference. */
  refresh(): void {
    const folder = this.folder();
    let next: FolderTrustInfo | undefined;
    try {
      next = folder ? inspectFolderTrust(folder) : undefined;
    } catch (err) {
      this.log.debug('Folder trust check failed', err);
      next = undefined;
    }
    if (next?.state === 'trusted' && this.sessions.wantsGrokTrust(next.folder)) {
      this.sessions.clearGrokTrustRequest(next.folder);
    }
    const before = JSON.stringify(this.info ?? null);
    this.info = next;
    if (JSON.stringify(next ?? null) !== before) {
      if (next && needsGrokTrust(next)) {
        this.log.info(
          `Grok does not trust ${next.folder}; skipped project sources: ` +
            next.sources.map((s) => `${s.kind}:${s.path}`).join(', ')
        );
      }
      this.emit('changed');
    }
  }

  private scheduleRefresh(delayMs = 300): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.refresh();
    }, delayMs);
  }

  private watchTrustStore(): void {
    try {
      const dir = grokHomeDir();
      const file = 'trusted_folders.toml';
      this.watcher = nodeFs.watch(dir, { persistent: false }, (_ev, name) => {
        if (!name || String(name) === file || String(name) === 'config.toml') {
          this.scheduleRefresh();
        }
      });
      this.watcher.on('error', () => {
        this.watcher?.close();
        this.watcher = undefined;
      });
    } catch {
      /* ~/.grok missing — refresh on focus / session start instead */
    }
  }

  private dismissedFolders(): string[] {
    return this.state.get<string[]>(DISMISSED_KEY, []);
  }

  bannerState(): GrokTrustBannerState {
    const folder = this.info?.folder;
    return grokTrustBannerState(this.info, {
      vscodeTrusted: isWorkspaceTrusted(),
      dismissed: !!folder && this.dismissedFolders().includes(normalizeCwdKey(folder)),
      trustRequested: !!folder && this.sessions.wantsGrokTrust(folder),
    });
  }

  async dismiss(): Promise<void> {
    const folder = this.info?.folder;
    if (!folder) {
      return;
    }
    const key = normalizeCwdKey(folder);
    const list = this.dismissedFolders().filter((f) => f !== key);
    await this.state.update(DISMISSED_KEY, [...list, key]);
    this.emit('changed');
  }

  /** "Trust folder": confirm, then restart the folder's agents with `--trust`. */
  async trustFolder(): Promise<void> {
    const folder = this.folder();
    if (!folder) {
      void vscode.window.showWarningMessage('Open a folder first.');
      return;
    }
    if (!isWorkspaceTrusted()) {
      const pick = await vscode.window.showWarningMessage(
        'Trust this workspace in VS Code first. Restricted Mode blocks trusting it for Grok.',
        'Manage Workspace Trust'
      );
      if (pick) {
        await vscode.commands.executeCommand('workbench.trust.manage');
      }
      return;
    }
    this.refresh();
    const summary = this.bannerState().summary;
    const pick = await vscode.window.showWarningMessage(
      `Trust "${folder}" for Grok CLI?`,
      {
        modal: true,
        detail:
          'Grok will load and run this project\'s hooks (shell commands), rules, skills and MCP servers.' +
          (summary ? `\nFound: ${summary}.` : '') +
          `\n\nThe agent restarts with --trust; open chats keep their conversation (project rules apply to new chats). Grok saves the decision in ${trustStorePath()}; remove the entry there to revoke it.`,
      },
      'Trust and Restart Agent'
    );
    if (pick !== 'Trust and Restart Agent') {
      return;
    }
    const res = await this.sessions.trustFolderForGrok(folder);
    this.log.info(`Folder trusted for Grok: ${folder} (restarted=${res.restarted}, busy=${res.busy})`);
    this.emit('changed');
    // Grok writes trusted_folders.toml on the first --trust start.
    this.scheduleRefresh(1500);
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.watcher?.close();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.removeAllListeners();
  }
}

let monitor: GrokTrustMonitor | undefined;

export function initGrokTrustMonitor(state: vscode.Memento, sessions: SessionManager): GrokTrustMonitor {
  monitor?.dispose();
  monitor = new GrokTrustMonitor(state, sessions);
  return monitor;
}

export function getGrokTrustMonitor(): GrokTrustMonitor | undefined {
  return monitor;
}
