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
