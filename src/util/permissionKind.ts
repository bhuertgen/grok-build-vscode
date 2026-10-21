/**
 * Classify a `session/request_permission` tool call as write-like, for the
 * Restricted Mode auto-reject (#46). Pure module (no vscode) — unit-tested.
 *
 * Decision is made on the ACP `toolCall.kind` first:
 * - write-like: `edit`, `delete`, `move`, `execute`
 * - not write-like: `read`, `search`, `fetch`, `think`, `switch_mode`
 * Only when `kind` is missing or `other` do we fall back to Grok's
 * `_meta["x.ai/tool"].kind` and then to the title. The title heuristic
 * ignores `backtick-quoted` paths and no longer matches the bare word
 * "file" (which hit "Read file x" / "List files").
 */
const WRITE_KINDS = new Set(['edit', 'delete', 'move', 'execute']);
const READ_KINDS = new Set(['read', 'search', 'fetch', 'think', 'switch_mode']);
const WRITE_TITLE = /\b(?:over)?(?:write|edit|create|delete|move|rename)/i;

interface PermissionToolCallLike {
  kind?: string | null;
  title?: string | null;
  _meta?: Record<string, unknown> | null;
}

export function isWriteLikePermission(tc: PermissionToolCallLike | undefined | null): boolean {
  if (!tc) {
    return false;
  }
  const kind = (tc.kind ?? '').trim().toLowerCase();
  if (WRITE_KINDS.has(kind)) {
    return true;
  }
  if (READ_KINDS.has(kind)) {
    return false;
  }
  // kind missing / 'other' / unknown → Grok tool meta, then title
  const meta = tc._meta?.['x.ai/tool'] as Record<string, unknown> | undefined;
  const metaKind = typeof meta?.kind === 'string' ? meta.kind.toLowerCase() : '';
  if (metaKind === 'write' || WRITE_KINDS.has(metaKind)) {
    return true;
  }
  if (metaKind === 'read' || READ_KINDS.has(metaKind)) {
    return false;
  }
  const title = (tc.title ?? '').replace(/`[^`]*`/g, ' ');
  return WRITE_TITLE.test(title);
}
