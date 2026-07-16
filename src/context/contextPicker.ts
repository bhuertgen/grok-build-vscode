import * as path from 'node:path';
import * as vscode from 'vscode';
import { ContextCollector } from './contextCollector';
import type { ContextItem } from '../session/sessionManager';
import { getLogger } from '../util/logger';

/**
 * Interactive @-context picker (file / symbol / git / folder).
 */
export class ContextPicker {
  private readonly collector = new ContextCollector();
  private readonly log = getLogger();

  async pick(): Promise<ContextItem | undefined> {
    // Prefer kind chosen in webview bottom menu; this QuickPick is palette fallback only
    type ContextKind = 'file' | 'symbol' | 'git' | 'folder' | 'active';
    type Item = vscode.QuickPickItem & { contextKind: ContextKind };
    const picked = await vscode.window.showQuickPick<Item>(
      [
        {
          label: '$(file) File',
          description: '@file',
          contextKind: 'file',
        },
        {
          label: '$(symbol-method) Symbol',
          description: '@symbol',
          contextKind: 'symbol',
        },
        {
          label: '$(git-commit) Git changes',
          description: '@git',
          contextKind: 'git',
        },
        {
          label: '$(folder) Folder',
          description: '@folder',
          contextKind: 'folder',
        },
        {
          label: '$(file-code) Active file / selection',
          description: 'Current editor',
          contextKind: 'active',
        },
      ],
      { placeHolder: 'Add context to Grok Build' }
    );
    if (!picked) {
      return undefined;
    }
    return this.pickKind(picked.contextKind);
  }

  /** Direct kind pick (used by webview bottom menu — skips the top QuickPick hub). */
  async pickKind(
    kind: 'file' | 'symbol' | 'git' | 'folder' | 'active' | string
  ): Promise<ContextItem | undefined> {
    switch (kind) {
      case 'file':
        return this.pickFile();
      case 'symbol':
        return this.pickSymbol();
      case 'git':
        return this.pickGit();
      case 'folder':
        return this.pickFolder();
      case 'active':
        return this.pickActive();
      default:
        return undefined;
    }
  }

  private async pickFile(): Promise<ContextItem | undefined> {
    // Prefer in-workspace file list (Claude Code–style @file), not OS file dialog
    const files = await this.listWorkspaceFiles('', 200);
    if (files.length > 0) {
      return this.pickWorkspaceFile('');
    }
    // Fallback: OS dialog when workspace is empty / no matches
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Add as context',
      defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
    });
    if (!uris?.[0]) {
      return undefined;
    }
    return (await this.collector.fromUri(uris[0])) ?? undefined;
  }

  /**
   * List workspace files for @-mention autocomplete (filtered).
   */
  async listWorkspaceFiles(
    query = '',
    limit = 80
  ): Promise<Array<{ path: string; label: string; description: string }>> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      return [];
    }
    const exclude =
      '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/.grok/**,**/bin/**,**/obj/**}';
    let uris: vscode.Uri[];
    try {
      uris = await vscode.workspace.findFiles('**/*', exclude, 800);
    } catch (err) {
      this.log.warn('findFiles failed', err);
      return [];
    }
    const q = query.trim().toLowerCase().replace(/\\/g, '/');
    const scored: Array<{
      path: string;
      label: string;
      description: string;
      score: number;
    }> = [];
    for (const u of uris) {
      if (u.scheme !== 'file') {
        continue;
      }
      const rel = vscode.workspace.asRelativePath(u, false).replace(/\\/g, '/');
      const base = path.basename(rel);
      if (q) {
        const relL = rel.toLowerCase();
        const baseL = base.toLowerCase();
        if (!relL.includes(q) && !baseL.includes(q)) {
          continue;
        }
        let score = 0;
        if (baseL.startsWith(q)) {
          score += 100;
        } else if (baseL.includes(q)) {
          score += 50;
        }
        if (relL.startsWith(q)) {
          score += 30;
        } else if (relL.includes(q)) {
          score += 10;
        }
        score -= rel.length * 0.01;
        scored.push({
          path: u.fsPath,
          label: base,
          description: rel,
          score,
        });
      } else {
        scored.push({
          path: u.fsPath,
          label: base,
          description: rel,
          score: -rel.length,
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ path: p, label, description }) => ({
      path: p,
      label,
      description,
    }));
  }

  /**
   * QuickPick over workspace files (used by @ and "Add file").
   * Returns undefined if cancelled or no files (caller may fall back to dialog).
   */
  async pickWorkspaceFile(
    query = ''
  ): Promise<ContextItem | undefined> {
    let files = await this.listWorkspaceFiles(query, 200);
    if (files.length === 0) {
      if (!vscode.workspace.workspaceFolders?.length) {
        void vscode.window.showWarningMessage(
          'Kein Workspace-Ordner geöffnet — @-Dateien brauchen einen Projektordner.'
        );
        return undefined;
      }
      // Empty project: offer OS dialog once
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: 'Add as context',
        defaultUri: vscode.workspace.workspaceFolders[0]?.uri,
      });
      if (!uris?.[0]) {
        return undefined;
      }
      return (await this.collector.fromUri(uris[0])) ?? undefined;
    }

    type Item = vscode.QuickPickItem & { fsPath: string };
    const picked = await vscode.window.showQuickPick<Item>(
      files.map((f) => ({
        label: f.label,
        description: f.description,
        fsPath: f.path,
      })),
      {
        placeHolder: query
          ? `Dateien filtern: ${query}`
          : 'Datei als Kontext hinzufügen (@)',
        matchOnDescription: true,
      }
    );
    if (!picked) {
      return undefined;
    }
    return (
      (await this.collector.fromUri(vscode.Uri.file(picked.fsPath))) ??
      undefined
    );
  }

  async fromPath(fsPath: string): Promise<ContextItem | undefined> {
    try {
      return (
        (await this.collector.fromUri(vscode.Uri.file(fsPath))) ?? undefined
      );
    } catch (err) {
      this.log.warn('fromPath failed', err);
      return undefined;
    }
  }

  private async pickFolder(): Promise<ContextItem | undefined> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      canSelectFiles: false,
      canSelectFolders: true,
      openLabel: 'Add folder as context',
      defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
    });
    if (!uris?.[0]) {
      return undefined;
    }
    return (await this.collector.fromUri(uris[0], true)) ?? undefined;
  }

  private async pickSymbol(): Promise<ContextItem | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage('Open a file to pick a symbol.');
      return undefined;
    }
    try {
      const symbols = (await vscode.commands.executeCommand<
        vscode.DocumentSymbol[]
      >('vscode.executeDocumentSymbolProvider', editor.document.uri)) ?? [];

      const flat = flattenSymbols(symbols);
      if (flat.length === 0) {
        void vscode.window.showInformationMessage(
          'No symbols found in the active file.'
        );
        return undefined;
      }

      const picked = await vscode.window.showQuickPick(
        flat.map((s) => ({
          label: s.name,
          description: vscode.SymbolKind[s.kind] ?? '',
          detail: `L${s.range.start.line + 1}`,
          symbol: s,
        })),
        { placeHolder: 'Select symbol' }
      );
      if (!picked) {
        return undefined;
      }

      const text = editor.document.getText(picked.symbol.range);
      return {
        id: `sym_${Date.now()}`,
        kind: 'symbol',
        label: `${path.basename(editor.document.fileName)}#${picked.symbol.name}`,
        path: editor.document.uri.fsPath,
        detail: vscode.SymbolKind[picked.symbol.kind],
        text,
        mimeType: editor.document.languageId
          ? `text/x-${editor.document.languageId}`
          : 'text/plain',
      };
    } catch (err) {
      this.log.warn('Symbol pick failed', err);
      void vscode.window.showErrorMessage('Could not load symbols for this file.');
      return undefined;
    }
  }

  private async pickGit(): Promise<ContextItem | undefined> {
    try {
      const gitExt = vscode.extensions.getExtension('vscode.git');
      if (!gitExt) {
        void vscode.window.showWarningMessage('VS Code Git extension not available.');
        return undefined;
      }
      await gitExt.activate();
      const api = gitExt.exports?.getAPI?.(1);
      const repo = api?.repositories?.[0];
      if (!repo) {
        void vscode.window.showInformationMessage('No Git repository found.');
        return undefined;
      }

      const changes = [
        ...repo.state.workingTreeChanges,
        ...repo.state.indexChanges,
      ];
      if (changes.length === 0) {
        void vscode.window.showInformationMessage('No Git changes.');
        return undefined;
      }

      const picked = await vscode.window.showQuickPick(
        [
          {
            label: '$(diff) All changes (summary)',
            all: true as const,
          },
          ...changes.map((c: { uri: vscode.Uri }) => ({
            label: path.basename(c.uri.fsPath),
            description: c.uri.fsPath,
            uri: c.uri,
            all: false as const,
          })),
        ],
        { placeHolder: 'Add Git change as context' }
      );
      if (!picked) {
        return undefined;
      }

      if (picked.all) {
        const names = changes
          .map((c: { uri: vscode.Uri }) => c.uri.fsPath)
          .join('\n');
        return {
          id: `git_${Date.now()}`,
          kind: 'git',
          label: `git: ${changes.length} changes`,
          detail: 'working tree + index',
          text: `Git changed files:\n${names}`,
        };
      }

      const uri = (picked as { uri: vscode.Uri }).uri;
      // Prefer diff against HEAD when possible
      let text: string | undefined;
      try {
        const diff = await repo.diffWithHEAD(uri.fsPath);
        text = typeof diff === 'string' ? diff : undefined;
      } catch {
        /* fall through */
      }
      if (!text) {
        text = (await this.collector.readFileLimited(uri.fsPath)) ?? undefined;
      }
      return {
        id: `git_${Date.now()}`,
        kind: 'git',
        label: `git:${path.basename(uri.fsPath)}`,
        path: uri.fsPath,
        detail: uri.fsPath,
        text,
      };
    } catch (err) {
      this.log.warn('Git context failed', err);
      void vscode.window.showErrorMessage('Failed to collect Git context.');
      return undefined;
    }
  }

  private async pickActive(): Promise<ContextItem | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage('No active editor.');
      return undefined;
    }
    if (!editor.selection.isEmpty) {
      return this.collector.fromSelection(editor);
    }
    return (
      (await this.collector.fromUri(editor.document.uri)) ?? undefined
    );
  }
}

function flattenSymbols(
  symbols: vscode.DocumentSymbol[],
  acc: vscode.DocumentSymbol[] = []
): vscode.DocumentSymbol[] {
  for (const s of symbols) {
    acc.push(s);
    if (s.children?.length) {
      flattenSymbols(s.children, acc);
    }
  }
  return acc;
}
