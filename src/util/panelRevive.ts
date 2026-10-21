/**
 * What to do with a Grok editor panel that VS Code restores through the
 * WebviewPanelSerializer (#51). Pure module (no vscode) — unit-tested.
 *
 * VS Code stops and restarts the extension host when a local workspace goes
 * from Trusted to Restricted Mode, and restores editor webviews on a window
 * reload. The restored panel gets a fresh webview bound to the new host; we
 * keep exactly one Grok editor panel.
 */
export function revivedPanelAction(hasCurrentPanel: boolean): 'adopt' | 'dispose' {
  return hasCurrentPanel ? 'dispose' : 'adopt';
}

/**
 * VS Code does NOT re-resolve a live webview panel after an extension-host
 * restart (verified in 1.141.1, Trusted → Restricted Mode): the serializer
 * is not called and the old tab stays visible, bound to the stopped host, so
 * "+" and the composer do nothing. Work in `deactivate()` cannot fix it
 * either: the main-thread side is already disconnected, so a dispose() or a
 * workspaceState write from there never arrives.
 *
 * So after activation (and after the serializer had its chance) we look for
 * Grok editor tabs that no live panel owns and replace them with a fresh
 * panel in the same column.
 */
export function orphanedTabAction(hasLivePanel: boolean, grokTabCount: number): 'none' | 'replace' {
  return !hasLivePanel && grokTabCount > 0 ? 'replace' : 'none';
}

/** TabInputWebview.viewType carries a host prefix, e.g. `mainThreadWebview-grokBuild.editorChat`. */
export function isGrokEditorChatViewType(viewType: string | undefined, ownViewType: string): boolean {
  return typeof viewType === 'string' && (viewType === ownViewType || viewType.endsWith(`-${ownViewType}`));
}

/** workspaceState key: `vscode.env.sessionId` of the last activation. */
export const LAST_SESSION_KEY = 'grokBuild.lastActivationSessionId';

/**
 * An activation with the same `vscode.env.sessionId` as the previous one is
 * an extension-host restart inside the same window (the id changes on every
 * window load / reload).
 */
export function isExtensionHostRestart(previous: string | undefined, current: string | undefined): boolean {
  return !!previous && !!current && previous === current;
}
