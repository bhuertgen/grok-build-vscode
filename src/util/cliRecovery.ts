/**
 * New-session gating and recovery when the CLI is unusable / usable again (#41).
 * Pure module (no vscode) — unit-tested.
 */

export interface CliGateInput {
  checking?: boolean;
  ready?: boolean;
  invalidCliPath?: boolean;
}

export type CliGate = 'checking' | 'invalid_path' | 'missing' | 'ok';

/** What "+" / New Session / resume should do for the current CLI state. */
export function newSessionGate(cli: CliGateInput | null | undefined): CliGate {
  if (!cli) {
    return 'ok';
  }
  if (cli.checking) {
    return 'checking';
  }
  if (cli.ready === false) {
    return cli.invalidCliPath ? 'invalid_path' : 'missing';
  }
  return 'ok';
}

export interface RecoverableSession {
  status: string;
  lastError?: string;
}

/**
 * Once the CLI is ready again (e.g. cliPath fixed, re-detected without reload),
 * sessions whose agent failed to start lose the stale "Error: …" status. They
 * become `idle`, so the next message reconnects. Returns how many were reset.
 */
export function clearStaleStartErrors(sessions: Iterable<RecoverableSession>): number {
  let n = 0;
  for (const s of sessions) {
    if (s.status === 'error') {
      s.status = 'idle';
      s.lastError = undefined;
      n++;
    }
  }
  return n;
}
