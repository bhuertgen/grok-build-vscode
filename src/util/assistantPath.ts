/**
 * Resolve a path clicked in an assistant message to an existing file.
 * Pure aside from the injected `isFile` check — unit-tested without vscode.
 *
 * Percent-encoding is decoded before the lookup (CLI 1.0.86: `%20` is a
 * space). The original spelling is still tried when that file is missing,
 * so a name that literally contains `%20` still opens. A path that already
 * contains a literal space is unchanged.
 */
import * as path from 'node:path';
import { decodePercentEncodedPath } from './messageLinks';

export interface ResolveAssistantOptions {
  /** Workspace folder roots. Relative paths are tried against each, in order. */
  roots: readonly string[];
  homedir?: string;
  /** True only for a regular file (not a directory or device). */
  isFile: (fsPath: string) => boolean;
  platform?: NodeJS.Platform;
}

function pushUnique(list: string[], value: string): void {
  if (value && !list.includes(value)) {
    list.push(value);
  }
}

function usableSpelling(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 1024 &&
    !/[\0\r\n]/.test(value) &&
    !/^(?:https?|file):/i.test(value)
  );
}

/** Decoded path first, then the text as written when they differ. */
function spellingsFor(input: string): string[] {
  const decoded = decodePercentEncodedPath(input);
  if (decoded !== input && usableSpelling(decoded)) {
    return [decoded, input];
  }
  return [input];
}

function candidatesFor(
  input: string,
  opts: ResolveAssistantOptions,
  platform: NodeJS.Platform,
  home: string
): string[] {
  const P = platform === 'win32' ? path.win32 : path.posix;
  const written: string[] = [];
  pushUnique(written, input);
  pushUnique(written, input.replace(/\\/g, '/'));
  if (platform === 'win32') {
    pushUnique(written, input.replace(/\//g, '\\'));
  }

  const candidates: string[] = [];
  for (const w of written) {
    let p = w;
    if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
      if (!home) {
        continue;
      }
      const rest = p.slice(1).replace(/^[/\\]/, '');
      p = rest ? P.join(home, rest) : home;
    }
    const winDrive = /^[A-Za-z]:[\\/]/.test(p);
    const abs = P.isAbsolute(p) || (platform !== 'win32' && winDrive);
    if (abs) {
      pushUnique(candidates, P.normalize(p));
      if ((p.startsWith('/') || p.startsWith('\\')) && !p.startsWith('//') && !p.startsWith('\\\\')) {
        const rel = p.replace(/^[/\\]+/, '');
        for (const root of opts.roots) {
          if (!root || !rel) {
            continue;
          }
          pushUnique(candidates, P.normalize(P.join(root, rel)));
        }
      }
    } else {
      for (const root of opts.roots) {
        if (!root) {
          continue;
        }
        pushUnique(candidates, P.normalize(P.join(root, p)));
      }
    }
  }
  return candidates;
}

/**
 * Absolute paths are opened as-is when they exist.
 * A leading-slash path that is not a real absolute file is also tried
 * relative to each workspace root (`/src/foo.ts` → `<root>/src/foo.ts`).
 * `~/…` expands with `homedir`. Returns null when no regular file matches.
 */
export function resolveAssistantFile(
  raw: string,
  opts: ResolveAssistantOptions
): string | null {
  let input = raw.trim();
  if (!usableSpelling(input)) {
    return null;
  }
  if (
    (input.startsWith('"') && input.endsWith('"') && input.length >= 2) ||
    (input.startsWith("'") && input.endsWith("'") && input.length >= 2)
  ) {
    input = input.slice(1, -1).trim();
  }
  if (!usableSpelling(input)) {
    return null;
  }

  const platform = opts.platform ?? process.platform;
  const home = opts.homedir ?? '';
  for (const spelling of spellingsFor(input)) {
    for (const candidate of candidatesFor(spelling, opts, platform, home)) {
      if (opts.isFile(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}
