import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getConfig } from '../util/config';
import type { ContextItem } from '../session/sessionManager';

/**
 * Collects automatic + manual context for prompts (@file, selection, etc.).
 */
export class ContextCollector {
  async collectAutoContext(): Promise<ContextItem[]> {
    const cfg = getConfig();
    const items: ContextItem[] = [];
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return items;
    }

    if (cfg.autoIncludeSelection && !editor.selection.isEmpty) {
      const text = editor.document.getText(editor.selection);
      if (text.trim()) {
        items.push({
          id: `sel_${Date.now()}`,
          kind: 'selection',
          label: `${path.basename(editor.document.fileName)}:selection`,
          path: editor.document.uri.fsPath,
          detail: `L${editor.selection.start.line + 1}-L${editor.selection.end.line + 1}`,
          text,
          mimeType: mimeFromPath(editor.document.fileName),
        });
      }
    } else if (cfg.autoIncludeActiveFile && editor.document.uri.scheme === 'file') {
      const text = await this.readFileLimited(editor.document.uri.fsPath);
      if (text != null) {
        items.push({
          id: `file_${Date.now()}`,
          kind: 'file',
          label: path.basename(editor.document.fileName),
          path: editor.document.uri.fsPath,
          detail: editor.document.uri.fsPath,
          text,
          mimeType: mimeFromPath(editor.document.fileName),
        });
      }
    }

    return items;
  }

  async fromUri(uri: vscode.Uri, isFolder = false): Promise<ContextItem | null> {
    if (isFolder || (await isDirectory(uri))) {
      return {
        id: `folder_${Date.now()}`,
        kind: 'folder',
        label: path.basename(uri.fsPath) || uri.fsPath,
        path: uri.fsPath,
        detail: uri.fsPath,
        text: `Folder: ${uri.fsPath}`,
      };
    }

    const text = await this.readFileLimited(uri.fsPath);
    return {
      id: `file_${Date.now()}`,
      kind: 'file',
      label: path.basename(uri.fsPath),
      path: uri.fsPath,
      detail: uri.fsPath,
      text: text ?? undefined,
      mimeType: mimeFromPath(uri.fsPath),
    };
  }

  fromSelection(editor: vscode.TextEditor): ContextItem {
    const text = editor.document.getText(editor.selection);
    return {
      id: `sel_${Date.now()}`,
      kind: 'selection',
      label: `${path.basename(editor.document.fileName)}:selection`,
      path: editor.document.uri.fsPath,
      detail: `L${editor.selection.start.line + 1}-L${editor.selection.end.line + 1}`,
      text,
      mimeType: mimeFromPath(editor.document.fileName),
    };
  }

  async readFileLimited(filePath: string): Promise<string | null> {
    const max = getConfig().maxContextFileBytes;
    try {
      // Prefer open document (unsaved changes)
      const open = vscode.workspace.textDocuments.find(
        (d) => d.uri.fsPath === filePath
      );
      if (open) {
        const t = open.getText();
        if (Buffer.byteLength(t, 'utf8') > max) {
          return t.slice(0, max) + '\n/* …truncated… */';
        }
        return t;
      }
      const buf = await fs.readFile(filePath);
      if (buf.byteLength > max) {
        return buf.subarray(0, max).toString('utf8') + '\n/* …truncated… */';
      }
      return buf.toString('utf8');
    } catch {
      return null;
    }
  }
}

async function isDirectory(uri: vscode.Uri): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return (stat.type & vscode.FileType.Directory) !== 0;
  } catch {
    return false;
  }
}

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'text/typescript',
    '.tsx': 'text/tsx',
    '.js': 'text/javascript',
    '.jsx': 'text/jsx',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.py': 'text/x-python',
    '.rs': 'text/x-rust',
    '.go': 'text/x-go',
    '.java': 'text/x-java',
    '.cs': 'text/x-csharp',
    '.css': 'text/css',
    '.html': 'text/html',
    '.yml': 'text/yaml',
    '.yaml': 'text/yaml',
  };
  return map[ext] ?? 'text/plain';
}
