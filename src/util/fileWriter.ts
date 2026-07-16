import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

/**
 * Shared file write used by EditController and ACP fs/write handlers.
 * Kept outside AcpClient so multi-process sessions share one apply path.
 */
export async function applyTextWrite(
  filePath: string,
  content: string
): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const openDoc = vscode.workspace.textDocuments.find(
    (d) => d.uri.fsPath === uri.fsPath
  );
  if (openDoc) {
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      openDoc.positionAt(0),
      openDoc.positionAt(openDoc.getText().length)
    );
    edit.replace(uri, fullRange, content);
    await vscode.workspace.applyEdit(edit);
    await openDoc.save();
    return;
  }

  await fs.writeFile(filePath, content, 'utf8');
}
