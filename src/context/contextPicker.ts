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

    switch (picked.contextKind) {
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
