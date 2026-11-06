/**
 * How `terminal/create` is spawned.
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
 * Pure module (no vscode) — unit-tested.
 */

export interface TerminalSpawnPlan {
  /** `spawn`'s file argument: an executable, or a shell command line. */
  file: string;
  /** Argv. Empty when `shell` is true (the command line is `file`). */
  args: string[];
  shell: boolean;
  windowsHide?: boolean;
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
  if (argv.length === 0) {
    return { file: command, args: [], shell: true };
  }
  return { file: command, args: argv, shell: false };
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
