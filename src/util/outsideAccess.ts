/**
 * Session grants for agent file access outside the workspace (#45).
 * Pure module (no vscode) — unit-tested.
 *
 * - "Allow for this session" → that op + path until clear(); a write grant
 *   also covers reads of the same path.
 * - A session **write** whose path is under the OS temp directory covers
 *   every file in that directory (reads included). The directory is the
 *   real system temp path (`osTempScopeKey`, folded with `scopeKey`), not a
 *   folder that is only named "temp". Other paths stay one file. A session
 *   read stays one file. "Allow once" stays one file.
 * - "Allow once" → the current request only. For reads (and for the read
 *   that follows an approved write) re-reads of the same path within
 *   `graceMs` do not ask again: the CLI reads a file several times around
 *   one tool call (preview, re-read before write). Writes stay one-shot.
 *
 * Callers pass a comparison key (`scopeKey`). Overlapping requests for the
 * same op+key share one dialog via `coalesceOutsidePrompt`. Writes under
 * the OS temp directory share one dialog. A session grant satisfies whoever
 * was waiting; Allow once does not cover a second write.
 */
import { isUnderScopeKey, osTempScopeKey } from './pathScope';

export type OutsideOp = 'read' | 'write';
export type OutsideChoice = 'once' | 'session' | 'deny';

export interface OutsideAccessOptions {
  /**
   * `scopeKey` of the OS temp directory. Omit to use the real system temp
   * directory. Pass `null` for per-file grants only.
   */
  osTempKey?: string | null;
  /** Separators for an explicit `osTempKey`. Default: the host platform. */
  platform?: NodeJS.Platform;
}

export class OutsideAccessGrants {
  private session = new Set<string>();
  private readGrace = new Map<string, number>();
  /** Session write grant for every file under the OS temp directory. */
  private osTempWrite = false;
  private readonly osTempKey?: string;
  private readonly platform: NodeJS.Platform;

  constructor(private readonly graceMs = 60_000, opts?: OutsideAccessOptions) {
    if (opts && opts.osTempKey !== undefined) {
      this.osTempKey = opts.osTempKey || undefined;
      this.platform = opts.platform ?? process.platform;
    } else {
      this.osTempKey = osTempScopeKey() || undefined;
      this.platform = process.platform;
    }
  }

  /** True when `key` is the OS temp directory or a file inside it. */
  isInOsTemp(key: string): boolean {
    return !!this.osTempKey && isUnderScopeKey(key, this.osTempKey, this.platform);
  }

  /**
   * In-flight dialog id. Writes inside the OS temp directory share one
   * prompt: session allow covers another temp file that arrived while it
   * was open. Allow once still asks for that second file.
   */
  promptKey(op: OutsideOp, key: string): string {
    if (op === 'write' && this.isInOsTemp(key)) {
      return `write:${this.osTempKey}`;
    }
    return `${op}:${key}`;
  }

  /** Why access is already allowed, or undefined → ask the user. */
  allowed(op: OutsideOp, key: string, now = Date.now()): 'session' | 'recent-once' | undefined {
    if (this.session.has(`${op}:${key}`) || this.session.has(`write:${key}`)) {
      return 'session';
    }
    if (this.osTempWrite && this.isInOsTemp(key)) {
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
      if (op === 'write' && this.isInOsTemp(key)) {
        this.osTempWrite = true;
      } else {
        this.session.add(`${op}:${key}`);
      }
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
    this.osTempWrite = false;
  }
}

/**
 * One dialog at a time for an op+path. Callers that arrive while it is open
 * wait, then look at the grants again. "Allow for this session" covers them.
 * "Allow once" does not cover another write (a read still hits the grace).
 * Writes under the OS temp directory share that one dialog.
 * A denial is not remembered: the next caller asks again.
 */
export async function coalesceOutsidePrompt(
  grants: OutsideAccessGrants,
  inflight: Map<string, Promise<boolean>>,
  op: OutsideOp,
  key: string,
  ask: () => Promise<boolean>
): Promise<boolean> {
  const promptKey = grants.promptKey(op, key);
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
