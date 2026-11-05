/**
 * PreToolUse `{"decision":"ask"}` on ACP `session/request_permission` (#30).
 * Probed live on Grok CLI 1.0.77 (and already on stable 1.0.70): the request
 * carries `params._meta.hookAsk = { hookName, reason }` and the tool title
 * repeats that as a ` — hook '…' asks: …` suffix.
 *
 * Pure module (no vscode) — unit-tested.
 */
import { shortHookName } from './turnOutcome';
import { parsePermissionTitle } from './unreadable';

export interface HookAskView {
  hookName?: string;
  reason?: string;
  /** `shortHookName(hookName)`, e.g. `project/probe`. */
  shortName?: string;
  /** Card line, e.g. Hook `project/probe` asks: Confirm this deploy */
  label: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** "Hook `project/probe` asks: Confirm this deploy" */
export function formatHookAskLabel(
  shortName: string | undefined,
  reason: string | undefined
): string | undefined {
  if (shortName && reason) {
    return `Hook \`${shortName}\` asks: ${reason}`;
  }
  if (shortName) {
    return `Hook \`${shortName}\` asks`;
  }
  if (reason) {
    return `Hook asks: ${reason}`;
  }
  return undefined;
}

/**
 * Read `params._meta.hookAsk`. Absent, empty, or a non-object → undefined
 * (the card stays as it was). Tool-call `_meta` is not consulted: the probe
 * puts `hookAsk` on the request, next to `x.ai/tool` on the tool call.
 */
export function parseHookAsk(meta: unknown): HookAskView | undefined {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return undefined;
  }
  const raw = (meta as Record<string, unknown>).hookAsk;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const rec = raw as Record<string, unknown>;
  const hookName = str(rec.hookName);
  const reason = str(rec.reason);
  const shortName = shortHookName(hookName || undefined);
  const label = formatHookAskLabel(shortName, reason || undefined);
  if (!label) {
    return undefined;
  }
  return {
    ...(hookName ? { hookName } : {}),
    ...(reason ? { reason } : {}),
    ...(shortName ? { shortName } : {}),
    label,
  };
}

/**
 * Fields the webview `permissionRequest` event needs from an ACP
 * `session/request_permission`: cleaned title plus the raw `_meta`
 * (and a parsed hook ask when one is present).
 */
export function permissionRequestFields(
  title: string | undefined | null,
  meta: unknown
): {
  displayTitle: string;
  unreadable: boolean;
  _meta?: Record<string, unknown>;
  hookAsk?: HookAskView;
} {
  const parsed = parsePermissionTitle(title);
  const hookAsk = parseHookAsk(meta);
  const metaObj =
    meta && typeof meta === 'object' && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : undefined;
  return {
    displayTitle: parsed.title,
    unreadable: parsed.unreadable,
    ...(metaObj ? { _meta: metaObj } : {}),
    ...(hookAsk ? { hookAsk } : {}),
  };
}
