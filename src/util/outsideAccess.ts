/**
 * Session grants for agent file access outside the workspace (#45).
 * Pure module (no vscode) — unit-tested.
 *
 * - "Allow for this session" → that op + path until clear(); a write grant
 *   also covers reads of the same path.
 * - "Allow once" → the current request only. For reads (and for the read
 *   that follows an approved write) re-reads of the same path within
 *   `graceMs` do not ask again: the CLI reads a file several times around
 *   one tool call (preview, re-read before write). Writes stay one-shot.
 *
 * Callers pass a comparison key (`scopeKey`). Overlapping requests for the
 * same op+key share one dialog via `coalesceOutsidePrompt`: a session grant
 * satisfies whoever was waiting; Allow once does not cover a second write.
 */
export type OutsideOp = 'read' | 'write';
export type OutsideChoice = 'once' | 'session' | 'deny';

export class OutsideAccessGrants {
  private session = new Set<string>();
  private readGrace = new Map<string, number>();

  constructor(private readonly graceMs = 60_000) {}

  /** Why access is already allowed, or undefined → ask the user. */
  allowed(op: OutsideOp, key: string, now = Date.now()): 'session' | 'recent-once' | undefined {
    if (this.session.has(`${op}:${key}`) || this.session.has(`write:${key}`)) {
      return 'session';
    }
    if (op === 'read' && (this.readGrace.get(key) ?? 0) > now) {
      return 'recent-once';
    }
    return undefined;
  }

  /** Record the user's answer; returns true when the request may proceed. */
  record(op: OutsideOp, key: string, choice: OutsideChoice, now = Date.now()): boolean {
    if (choice === 'session') {
      this.session.add(`${op}:${key}`);
      return true;
    }
    if (choice === 'once') {
      this.readGrace.set(key, now + this.graceMs);
      return true;
    }
    return false;
  }

  clear(): void {
    this.session.clear();
    this.readGrace.clear();
  }
}

/**
 * One dialog at a time for an op+path. Callers that arrive while it is open
 * wait, then look at the grants again. "Allow for this session" covers them.
 * "Allow once" does not cover another write (a read still hits the grace).
 * A denial is not remembered: the next caller asks again.
 */
export async function coalesceOutsidePrompt(
  grants: OutsideAccessGrants,
  inflight: Map<string, Promise<boolean>>,
  op: OutsideOp,
  key: string,
  ask: () => Promise<boolean>
): Promise<boolean> {
  const promptKey = `${op}:${key}`;
  for (;;) {
    if (grants.allowed(op, key)) {
      return true;
    }
    const pending = inflight.get(promptKey);
    if (pending) {
      try {
        await pending;
      } catch {
        // The in-flight dialog failed; this caller decides for itself.
      }
      continue;
    }
    const mine = ask().finally(() => {
      if (inflight.get(promptKey) === mine) {
        inflight.delete(promptKey);
      }
    });
    inflight.set(promptKey, mine);
    return mine;
  }
}
