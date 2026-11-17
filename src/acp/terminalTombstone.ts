/**
 * Terminals the agent asks about after they were released.
 *
 * Grok calls `terminal/output` (and sometimes `terminal/wait_for_exit`)
 * after `terminal/release`, and again after Stop, which releases the id.
 * The output was already captured. A small cache answers those reads.
 * An id that was never here, or has fallen out of the cache, is a normal
 * ACP error — not an output-channel error on every poll.
 *
 * Pure module (no vscode) — unit-tested.
 */

import { normalizeTerminalExitCode } from './terminalSpawn';
import type { TerminalOutputResponse } from './types';

/** How many released terminals keep their output. Oldest is dropped. */
export const RELEASED_TERMINAL_CACHE = 16;

/** Same JSON-RPC server error the other handlers already return. */
export const UNKNOWN_TERMINAL_ERROR_CODE = -32000;

export interface ReleasedTerminalSnapshot {
  output: string;
  truncated: boolean;
  exited: boolean;
  exitCode?: number | null;
  signal?: string | null;
  waiters: Array<
    (status: { exitCode?: number | null; signal?: string | null }) => void
  >;
}

/**
 * Bounded map of released terminals, newest last.
 * Entries are the live record, so a kill that exits after release still
 * fills in `exitCode` on the next read.
 */
export class ReleasedTerminalCache<T extends ReleasedTerminalSnapshot> {
  private readonly ids: string[] = [];
  private readonly byId = new Map<string, T>();

  constructor(private readonly limit = RELEASED_TERMINAL_CACHE) {}

  get size(): number {
    return this.ids.length;
  }

  remember(id: string, terminal: T): void {
    if (!id) {
      return;
    }
    const existing = this.ids.indexOf(id);
    if (existing >= 0) {
      this.ids.splice(existing, 1);
    }
    this.byId.set(id, terminal);
    this.ids.push(id);
    while (this.ids.length > this.limit) {
      const drop = this.ids.shift();
      if (drop) {
        this.byId.delete(drop);
      }
    }
  }

  get(id: string): T | undefined {
    return this.byId.get(id);
  }

  clear(): void {
    this.ids.length = 0;
    this.byId.clear();
  }
}

export class UnknownTerminalError extends Error {
  readonly code = UNKNOWN_TERMINAL_ERROR_CODE;
  readonly terminalId: string;

  constructor(terminalId: string) {
    super(`Unknown terminal: ${terminalId}`);
    this.name = 'UnknownTerminalError';
    this.terminalId = terminalId;
  }
}

export function isUnknownTerminalError(err: unknown): err is UnknownTerminalError {
  return err instanceof UnknownTerminalError;
}

export function terminalOutputBody(t: ReleasedTerminalSnapshot): TerminalOutputResponse {
  return {
    output: t.output,
    truncated: t.truncated,
    exitStatus: t.exited
      ? {
          exitCode: normalizeTerminalExitCode(t.exitCode),
          signal: t.signal ?? null,
        }
      : null,
  };
}

/** Exit status for `terminal/wait_for_exit` when the command has already finished. */
export function finishedExitStatus(
  t: ReleasedTerminalSnapshot
): { exitCode: number | null; signal: string | null } | undefined {
  if (!t.exited) {
    return undefined;
  }
  return {
    exitCode: normalizeTerminalExitCode(t.exitCode),
    signal: t.signal ?? null,
  };
}

/**
 * Live terminal, else a released one still in the cache.
 * Undefined means the id is unknown.
 */
export function resolveTerminal<T extends ReleasedTerminalSnapshot>(
  live: ReadonlyMap<string, T>,
  released: ReleasedTerminalCache<T>,
  id: string
): T | undefined {
  return live.get(id) ?? released.get(id);
}

/** Output for a live or recently released terminal. Throws if the id is gone. */
export function answerTerminalOutput<T extends ReleasedTerminalSnapshot>(
  live: ReadonlyMap<string, T>,
  released: ReleasedTerminalCache<T>,
  id: string
): TerminalOutputResponse {
  const t = resolveTerminal(live, released, id);
  if (!t) {
    throw new UnknownTerminalError(id);
  }
  return terminalOutputBody(t);
}

/**
 * `terminal/kill` only applies to a terminal that is still live.
 * An unknown or already released id is a no-op (undefined).
 */
export function liveTerminalForKill<T>(
  live: ReadonlyMap<string, T>,
  id: string
): T | undefined {
  return live.get(id);
}

/**
 * `terminal/release` drops a live terminal into the cache.
 * An unknown or already released id is a no-op (undefined).
 */
export function releaseTerminalRecord<T extends ReleasedTerminalSnapshot>(
  live: Map<string, T>,
  released: ReleasedTerminalCache<T>,
  id: string
): T | undefined {
  const t = live.get(id);
  if (!t) {
    return undefined;
  }
  live.delete(id);
  released.remember(id, t);
  return t;
}

export type TerminalMissLog = 'warn' | 'debug';

/**
 * First miss for a method + terminal id is a warning. The same pair again
 * is debug, so a polling agent does not fill the output channel.
 */
export function terminalMissLogLevel(
  seen: Set<string>,
  method: string,
  terminalId: string
): TerminalMissLog {
  const key = `${method}\0${terminalId}`;
  if (seen.has(key)) {
    return 'debug';
  }
  seen.add(key);
  return 'warn';
}
