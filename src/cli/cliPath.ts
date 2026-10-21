/**
 * Single source of truth for which Grok CLI binary to use (#41).
 * Pure module (no vscode) — unit-tested.
 *
 * - Default (`grokBuild.cliPath` empty or `grok`): try `grok` on PATH, then the
 *   usual install locations (previous behaviour).
 * - Explicit path: use ONLY that path. No silent fallback — otherwise the
 *   header showed a fallback binary's version while the agent spawn used the
 *   configured (broken) path and failed.
 * Detection (`grok --version`) and agent spawn both resolve through here.
 */
import * as path from 'node:path';

export interface CliPathEnv {
  platform: string;
  home?: string;
  localAppData?: string;
}

/** True for the default setting: empty, `grok` or `grok.exe`. */
export function isDefaultCliPath(configured: string | undefined | null): boolean {
  const p = (configured ?? '').trim();
  return p === '' || p === 'grok' || p.toLowerCase() === 'grok.exe';
}

/** True if the value looks like a filesystem path (not a bare command name). */
export function looksLikePath(p: string): boolean {
  return p.includes('/') || p.includes('\\') || /^[a-zA-Z]:/.test(p) || p.startsWith('~');
}

export interface CliCandidates {
  /** User configured a specific binary → no fallback */
  explicit: boolean;
  candidates: string[];
}

export function resolveCliCandidates(
  configured: string | undefined | null,
  env: CliPathEnv
): CliCandidates {
  if (!isDefaultCliPath(configured)) {
    return { explicit: true, candidates: [(configured as string).trim()] };
  }
  const list: string[] = ['grok'];
  if (env.platform === 'win32') {
    const home = env.home ?? '';
    const local = env.localAppData ?? '';
    if (home) {
      list.push(path.win32.join(home, '.local', 'bin', 'grok.exe'), path.win32.join(home, '.grok', 'bin', 'grok.exe'));
    }
    if (local) {
      list.push(path.win32.join(local, 'grok', 'grok.exe'));
    }
  } else {
    const home = env.home ?? '';
    if (home) {
      list.push(path.posix.join(home, '.local', 'bin', 'grok'), path.posix.join(home, '.grok', 'bin', 'grok'));
    }
    list.push('/usr/local/bin/grok');
  }
  return { explicit: false, candidates: [...new Set(list)] };
}

/** Minimal fs surface so the check is testable. */
export interface CliPathFs {
  stat(p: string): { isFile(): boolean; isDirectory(): boolean } | null;
  isExecutable(p: string): boolean;
}

export type CliPathProblem = 'not_found' | 'is_directory' | 'not_executable';

/**
 * Check an explicit path before spawning. Bare command names (no path
 * separator, e.g. `grok-alpha`) are left to PATH lookup at spawn time.
 */
export function checkExplicitCliPath(p: string, fsx: CliPathFs, platform: string): CliPathProblem | null {
  if (!looksLikePath(p)) {
    return null;
  }
  const st = fsx.stat(p);
  if (!st) {
    return 'not_found';
  }
  if (st.isDirectory()) {
    return 'is_directory';
  }
  if (platform !== 'win32' && !fsx.isExecutable(p)) {
    return 'not_executable';
  }
  return null;
}

/** User-facing banner / error text. */
export function invalidCliPathMessage(p: string, problem: CliPathProblem): string {
  const what =
    problem === 'not_found'
      ? 'not found'
      : problem === 'is_directory'
        ? 'is a directory, not the grok binary'
        : 'is not executable';
  return `grokBuild.cliPath points to ${p} – ${what}. Fix the setting or clear it to use grok from PATH.`;
}

/**
 * Binary the agent spawn should use. Explicit path → exactly that path.
 * Default → the binary detection resolved for the same setting, else `grok`.
 */
export function resolveSpawnCliPath(
  configured: string | undefined | null,
  lastDetection?: { ok: boolean; cliPath: string; configuredPath?: string } | null
): string {
  if (!isDefaultCliPath(configured)) {
    return (configured as string).trim();
  }
  const cfgNorm = (configured ?? '').trim() || 'grok';
  if (
    lastDetection?.ok &&
    lastDetection.cliPath &&
    ((lastDetection.configuredPath ?? '').trim() || 'grok') === cfgNorm
  ) {
    return lastDetection.cliPath;
  }
  return cfgNorm === 'grok.exe' ? 'grok.exe' : 'grok';
}
