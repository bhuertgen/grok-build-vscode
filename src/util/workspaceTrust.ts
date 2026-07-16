import * as vscode from 'vscode';

/**
 * VS Code Restricted Mode = workspace is not trusted.
 * File writes, tasks, and some terminal actions are limited until the user trusts the folder.
 */
export function isWorkspaceTrusted(): boolean {
  return vscode.workspace.isTrusted;
}

export function getTrustBannerMessage(): string {
  return (
    'VS Code is in Restricted Mode (workspace not trusted). ' +
    'Grok cannot reliably write files or run tools until you trust this folder.'
  );
}

/**
 * Throws a clear error if the workspace is untrusted — use before writes / risky actions.
 */
export function assertWorkspaceTrustedForWrite(pathHint?: string): void {
  if (isWorkspaceTrusted()) {
    return;
  }
  const where = pathHint ? ` (${pathHint})` : '';
  throw new Error(
    `Workspace is in Restricted Mode — write blocked${where}. ` +
      'Trust this folder: Status bar “Restricted Mode” → Manage Workspace Trust, ' +
      'or Command Palette → “Workspaces: Manage Workspace Trust”.'
  );
}

export async function promptTrustWorkspace(): Promise<void> {
  if (isWorkspaceTrusted()) {
    return;
  }
  const choice = await vscode.window.showWarningMessage(
    getTrustBannerMessage(),
    { modal: false },
    'Manage Workspace Trust',
    'Learn more'
  );
  if (choice === 'Manage Workspace Trust') {
    await vscode.commands.executeCommand('workbench.trust.manage');
  } else if (choice === 'Learn more') {
    await vscode.env.openExternal(
      vscode.Uri.parse(
        'https://code.visualstudio.com/docs/editing/workspaces/workspace-trust'
      )
    );
  }
}
