/**
 * Open session tabs per workspace folder (#51 follow-up). Pure module (no
 * vscode) — unit-tested.
 *
 * Before, only ONE session (last active / newest with messages) was reopened
 * after a window reload or an extension-host restart, so every other open
 * tab disappeared from the strip (it stayed in History). Now the list of
 * open tabs and the active tab are stored eagerly whenever they change and
 * restored as a whole.
 */
export interface OpenTabsRecord {
  /** Local session ids in tab-strip order */
  ids: string[];
  active?: string;
  updatedAt: number;
}

export interface RestorePlan {
  ids: string[];
  active?: string;
}

/**
 * Which stored sessions to reopen, in order, and which one to activate.
 * `exists(id)` = a stored session for this folder exists. Falls back to the
 * old single resume target when there is no usable tab list.
 */
export function planRestore(
  record: OpenTabsRecord | undefined | null,
  exists: (id: string) => boolean,
  fallbackId?: string
): RestorePlan {
  const seen = new Set<string>();
  const ids = (record?.ids ?? []).filter((id) => {
    if (typeof id !== 'string' || !id || seen.has(id) || !exists(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
  if (!ids.length) {
    return fallbackId && exists(fallbackId) ? { ids: [fallbackId], active: fallbackId } : { ids: [] };
  }
  const active = record?.active && seen.has(record.active) ? record.active : ids[ids.length - 1];
  return { ids, active };
}

/** Record for the current tabs (order kept, duplicates dropped). */
export function openTabsRecord(ids: readonly string[], active: string | null | undefined, now: number): OpenTabsRecord {
  const uniq = [...new Set(ids.filter((id) => typeof id === 'string' && id))];
  return { ids: uniq, active: active && uniq.includes(active) ? active : uniq[uniq.length - 1], updatedAt: now };
}

/**
 * Session updates that count as chat activity. Only these move a tab in the
 * strip (sorted by `updatedAt`). Metadata the agent sends on every connect
 * or resume (available commands, model, config, mode, title) used to bump
 * `updatedAt` too, so restored tabs came back in the order their agents
 * happened to connect.
 */
const ACTIVITY_UPDATES = new Set([
  'agent_message_chunk',
  'agent_thought_chunk',
  'user_message_chunk',
  'tool_call',
  'tool_call_update',
  'plan',
]);

export function isChatActivityUpdate(kind: string | undefined): boolean {
  return typeof kind === 'string' && ACTIVITY_UPDATES.has(kind);
}
