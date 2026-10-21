/**
 * Workspace boundary checks for ACP fs/read_text_file and fs/write_text_file
 * (#45). Pure module (no vscode) — unit-tested.
 *
 * - `..` segments are resolved and symlinks are followed (via `realpath`)
 *   for the path and for every root, so a symlink inside the workspace that
 *   points outside counts as outside. For a path that does not exist yet
 *   (new file), the nearest existing ancestor is resolved.
 * - Windows: case-insensitive, `/` and `\` treated alike, drive letters
 *   compared case-insensitively (same idea as `cwd.ts`).
 * - Several roots (multi-root workspaces). #21 (additional directories) can
 *   pass extra roots here.
 */
import * as nodePath from 'node:path';
import * as nodeFs from 'node:fs';

export interface PathScopeOptions {
  platform?: NodeJS.Platform;
  /** Sync realpath; throws for missing paths. Default: fs.realpathSync.native. */
  realpath?: (p: string) => string;
}

function api(platform: NodeJS.Platform): nodePath.PlatformPath {
  return platform === 'win32' ? nodePath.win32 : nodePath.posix;
}

/** Absolute, `..`-free path with symlinks resolved as far as the path exists. */
export function resolveScopePath(p: string, opts: PathScopeOptions = {}): string {
  const platform = opts.platform ?? process.platform;
  const P = api(platform);
  const realpath = opts.realpath ?? ((x: string) => nodeFs.realpathSync.native(x));
  let cur = P.resolve(p);
  const tail: string[] = [];
  for (;;) {
    try {
      const real = realpath(cur);
      return tail.length ? P.join(real, ...tail.reverse()) : real;
    } catch {
      const parent = P.dirname(cur);
      if (parent === cur) {
        return P.resolve(p);
      }
      tail.push(P.basename(cur));
      cur = parent;
    }
  }
}

/** Comparison key: Windows → lower case with `\`; no trailing separator except at a root. */
export function scopeKey(p: string, platform: NodeJS.Platform = process.platform): string {
  const P = api(platform);
  let k = platform === 'win32' ? P.normalize(p.replace(/\//g, '\\')).toLowerCase() : P.normalize(p);
  while (k.length > 1 && k.endsWith(P.sep) && P.dirname(k) !== k) {
    k = k.slice(0, -1);
  }
  return k;
}

/** True when `target` is one of `roots` or below one of them. */
export function isInsideWorkspace(
  target: string,
  roots: readonly string[],
  opts: PathScopeOptions = {}
): boolean {
  const platform = opts.platform ?? process.platform;
  const sep = api(platform).sep;
  const t = scopeKey(resolveScopePath(target, opts), platform);
  return roots.some((r) => {
    if (!r) {
      return false;
    }
    const root = scopeKey(resolveScopePath(r, opts), platform);
    const prefix = root.endsWith(sep) ? root : root + sep;
    return t === root || t.startsWith(prefix);
  });
}
