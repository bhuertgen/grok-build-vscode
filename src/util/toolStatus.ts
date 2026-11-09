/**
 * Tool-call status for the chat webview (#29). Pure — unit-tested.
 *
 * CLI ≥ 1.0.50 marks open tool calls `cancelled` when the turn is cancelled.
 * `cancelled` is a terminal state: not running, not failed, and a later
 * `completed` must not clear it. An unknown status is not treated as done.
 */

const KNOWN_STATUSES = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'] as const;

export type KnownToolStatus = (typeof KNOWN_STATUSES)[number];

export interface ToolRowView {
  /** Spinner / pulse. Only `pending` and `in_progress`. */
  running: boolean;
  /** Class on the status dot. */
  dot: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'unknown';
  /** Meta label. `Cancelled` is the neutral label; unknown stays the raw text. */
  label: string;
  /** Fold into the green "N used · done" summary. Only `completed`. */
  groupAsCompleted: boolean;
}

/** Known statuses are canonical lowercase; anything else is kept trimmed. */
export function canonicalToolStatus(status: unknown): string {
  const raw = typeof status === 'string' ? status.trim() : '';
  const lower = raw.toLowerCase();
  return (KNOWN_STATUSES as readonly string[]).includes(lower) ? lower : raw;
}

export function isRunningToolStatus(status: unknown): boolean {
  const s = canonicalToolStatus(status);
  return s === 'pending' || s === 'in_progress';
}

export function isTerminalToolStatus(status: unknown): boolean {
  const s = canonicalToolStatus(status);
  return s === 'completed' || s === 'failed' || s === 'cancelled';
}

/**
 * How one tool row renders. `durationLabel` is the already-formatted duration
 * for a completed call (`12s`); empty falls back to `done`.
 */
export function toolRowStatus(status: unknown, durationLabel?: string): ToolRowView {
  const s = canonicalToolStatus(status);
  if (s === 'pending' || s === 'in_progress') {
    return { running: true, dot: s, label: 'running', groupAsCompleted: false };
  }
  if (s === 'completed') {
    const duration = typeof durationLabel === 'string' ? durationLabel.trim() : '';
    return {
      running: false,
      dot: 'completed',
      label: duration || 'done',
      groupAsCompleted: true,
    };
  }
  if (s === 'failed') {
    return { running: false, dot: 'failed', label: 'failed', groupAsCompleted: false };
  }
  if (s === 'cancelled') {
    return { running: false, dot: 'cancelled', label: 'Cancelled', groupAsCompleted: false };
  }
  return {
    running: false,
    dot: 'unknown',
    label: s || 'unknown',
    groupAsCompleted: false,
  };
}

/**
 * Merge an incoming ACP status. `cancelled` sticks: a later `completed` or
 * `failed` does not reset it.
 */
export function mergeToolCallStatus(current: unknown, incoming: unknown): string {
  const cur = canonicalToolStatus(current);
  const next = canonicalToolStatus(incoming);
  if (!next) {
    return cur || 'pending';
  }
  if (cur === 'cancelled') {
    return 'cancelled';
  }
  return next;
}

export interface ToolStatusCarrier {
  status: string;
  finishedAt?: number;
}

/**
 * Mark still-open tool calls cancelled. Completed, failed, cancelled, and
 * unknown rows are left alone. Returns how many rows changed.
 * Only the array passed in is touched (one chat's tools, not another tab's).
 */
export function cancelOpenToolCalls<T extends ToolStatusCarrier>(
  tools: readonly T[],
  now = Date.now()
): number {
  let changed = 0;
  for (const tool of tools) {
    if (!isRunningToolStatus(tool.status)) {
      continue;
    }
    tool.status = 'cancelled';
    if (tool.finishedAt == null) {
      tool.finishedAt = now;
    }
    changed++;
  }
  return changed;
}
