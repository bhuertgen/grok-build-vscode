/**
 * Resolve a path clicked in an assistant message to an existing file.
 * Pure aside from the injected `isFile` check — unit-tested without vscode.
 */
import * as path from 'node:path';

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
  if (!input || input.length > 1024 || /[\0\r\n]/.test(input)) {
    return null;
  }
  if (/^(?:https?|file):/i.test(input)) {
    return null;
  }
  if (
    (input.startsWith('"') && input.endsWith('"') && input.length >= 2) ||
    (input.startsWith("'") && input.endsWith("'") && input.length >= 2)
  ) {
    input = input.slice(1, -1).trim();
  }
  if (!input) {
    return null;
  }

  const platform = opts.platform ?? process.platform;
  const P = platform === 'win32' ? path.win32 : path.posix;
  const home = opts.homedir ?? '';

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

  for (const candidate of candidates) {
    if (opts.isFile(candidate)) {
      return candidate;
    }
  }
  return null;
}
