/**
 * How `terminal/create` is spawned and how Stop kills it.
 *
 * Grok CLI 1.0.77 puts the whole shell line in `command` and omits `args`
 * (`/usr/bin/bash -lc 'echo …'`). `spawn(command, [], { shell: false })`
 * treats that string as the executable path: ENOENT, and Node's `close`
 * code is `-2`. The CLI then rejects the exit status
 * (`failed to deserialize response`) because an ACP exit code is unsigned.
 *
 * A command with no separate args runs through the shell. Separate `args`
 * stay a direct argv spawn so a path with spaces is one argument.
 * Windows already uses one `shell: true` command line (`quoteWinCommand`).
 *
 * `shell: true` is `/bin/sh -c` (or `cmd.exe`). `proc.kill()` signals that
 * shell only, so the command it started keeps running after Stop. On Linux
 * and macOS the child is a process-group leader (`detached`) and Stop
 * signals the group. On Windows Stop uses `taskkill /T /F` on the tree.
 *
 * Pure module (no vscode) — unit-tested.
 */

import { spawn, type ChildProcess } from 'node:child_process';

export interface TerminalSpawnPlan {
  /** `spawn`'s file argument: an executable, or a shell command line. */
  file: string;
  /** Argv. Empty when `shell` is true (the command line is `file`). */
  args: string[];
  shell: boolean;
  windowsHide?: boolean;
  /**
   * Unix: new session, so the shell is a process-group leader and Stop can
   * signal the command it started. Omitted on Windows (a new console).
   */
  detached?: boolean;
}

export function planTerminalSpawn(
  platform: string,
  command: string,
  args: readonly string[] | null | undefined
): TerminalSpawnPlan {
  const argv = Array.isArray(args) ? [...args] : [];
  if (platform === 'win32') {
    return {
      file: quoteWinCommand(command, argv),
      args: [],
      shell: true,
      windowsHide: true,
    };
  }
  // Linux and macOS: own process group (see killTerminalProcess).
  if (argv.length === 0) {
    return { file: command, args: [], shell: true, detached: true };
  }
  return { file: command, args: argv, shell: false, detached: true };
}

/**
 * ACP exit codes are unsigned. Node reports a failed spawn as a negative
 * `close` code (`-2` for ENOENT). Publish that as `1`. `null` stays `null`
 * (killed by a signal, or not exited).
 */
export function normalizeTerminalExitCode(code: number | null | undefined): number | null {
  if (typeof code !== 'number' || !Number.isFinite(code)) {
    return null;
  }
  if (!Number.isInteger(code) || code < 0) {
    return 1;
  }
  return code;
}

/** How Stop ends a terminal. `process-group` is Linux and macOS. */
export type TerminalKillKind = 'process-group' | 'taskkill';

/**
 * Linux/macOS signal the process group (`-pid`). Windows cannot, and
 * `child.kill()` does not stop processes `cmd.exe` started, so the tree
 * is `taskkill /T /F`.
 */
export function planTerminalKill(platform: string): TerminalKillKind {
  return platform === 'win32' ? 'taskkill' : 'process-group';
}

/** `taskkill /pid <pid> /t /f` — tree, forced. */
export function taskkillArgs(pid: number): string[] {
  return ['/pid', String(pid), '/t', '/f'];
}

/** SIGTERM, then SIGKILL if the process has not exited. */
export const TERMINAL_KILL_GRACE_MS = 500;

export interface TerminalKillTarget {
  pid?: number;
  kill(signal?: NodeJS.Signals): boolean;
  exitCode?: number | null;
  signalCode?: NodeJS.Signals | null;
}

export interface TerminalKillHooks {
  /** `pid` is negative: the process group. */
  signalGroup?(pid: number, signal: NodeJS.Signals): void;
  spawnTaskkill?(pid: number): void;
  /** Follow-up SIGKILL. Default is an unref'd timer. */
  schedule?(ms: number, fn: () => void): void;
}

function processHasExited(proc: TerminalKillTarget): boolean {
  return proc.exitCode != null || proc.signalCode != null;
}

function defaultSchedule(ms: number, fn: () => void): void {
  const timer = setTimeout(fn, ms);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

function defaultSignalGroup(pid: number, signal: NodeJS.Signals): void {
  process.kill(pid, signal);
}

function defaultTaskkill(pid: number, proc: TerminalKillTarget): void {
  let child: ChildProcess;
  try {
    child = spawn('taskkill', taskkillArgs(pid), {
      windowsHide: true,
      stdio: 'ignore',
    });
  } catch {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
    return;
  }
  child.unref();
  child.on('error', () => {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
  });
}

/**
 * Stop a `terminal/create` process and the command it started.
 * A missing pid falls back to `proc.kill()` (SIGTERM). A group signal that
 * fails (the pid is not a group leader) falls back the same way.
 * Safe to call twice.
 */
export function killTerminalProcess(
  proc: TerminalKillTarget,
  platform: string,
  hooks: TerminalKillHooks = {}
): void {
  const pid = proc.pid;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
    try {
      proc.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    return;
  }

  if (planTerminalKill(platform) === 'taskkill') {
    if (hooks.spawnTaskkill) {
      try {
        hooks.spawnTaskkill(pid);
      } catch {
        try {
          proc.kill();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    defaultTaskkill(pid, proc);
    return;
  }

  const signalGroup = hooks.signalGroup ?? defaultSignalGroup;
  const send = (signal: NodeJS.Signals) => {
    try {
      signalGroup(-pid, signal);
    } catch {
      try {
        proc.kill(signal);
      } catch {
        /* ignore */
      }
    }
  };
  send('SIGTERM');
  const schedule = hooks.schedule ?? defaultSchedule;
  schedule(TERMINAL_KILL_GRACE_MS, () => {
    if (processHasExited(proc)) {
      return;
    }
    send('SIGKILL');
  });
}

export interface SessionTerminalRef {
  id: string;
  sessionId: string;
  exited: boolean;
}

/**
 * Terminals Stop must kill and release.
 * Still-running commands for this session, including ones the agent left
 * in the background (they have not exited and have not been released).
 * Other sessions, and terminals that already exited, stay: the agent can
 * still read their output and call `terminal/release`.
 */
export function terminalIdsToCancel(
  terminals: Iterable<SessionTerminalRef>,
  sessionId: string
): string[] {
  const ids: string[] = [];
  for (const t of terminals) {
    if (t.exited) {
      continue;
    }
    // A terminal with no session id still belongs to this process (one
    // ACP session per client). A different session id is left alone.
    if (t.sessionId === sessionId || !t.sessionId) {
      ids.push(t.id);
    }
  }
  return ids;
}

/** Build a single cmd.exe-safe command line (for shell:true without args[]). */
function quoteWinCommand(command: string, args: readonly string[]): string {
  const parts = [command, ...args].map((p) => {
    if (!p) {
      return '""';
    }
    if (/[\s"]/g.test(p)) {
      return `"${p.replace(/"/g, '\\"')}"`;
    }
    return p;
  });
  return parts.join(' ');
}
