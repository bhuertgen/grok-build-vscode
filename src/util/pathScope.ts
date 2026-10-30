/**
 * Workspace boundary checks for ACP fs/read_text_file and fs/write_text_file
 * (#45). Pure module (no vscode) — unit-tested.
 *
 * - `..` segments are resolved and symlinks are followed (via `realpath`)
 *   for the path and for every root, so a symlink inside the workspace that
 *   points outside counts as outside. For a path that does not exist yet
 *   (new file), the nearest existing ancestor is resolved.
 * - Windows: case-insensitive, `/` and `\` treated alike, drive letters
 *   compared case-insensitively (same idea as `cwd.ts`). Verbatim
 *   `\\?\` / `\\?\UNC\` prefixes and `\\.\C:\` device paths are the same
 *   file as the plain path — `fs.realpath` and Rust `canonicalize` disagree
 *   on that prefix, which made a session grant miss the next write.
 *   Trailing dots and spaces on a component are stripped the way Win32
 *   does for non-verbatim paths (`cl-zoom.cmd.` is `cl-zoom.cmd`).
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

/**
 * `\\?\C:\...` and `\\?\UNC\server\...` (and `\\.\C:\...`) name the same
 * files as the plain forms. Comparison keys must not keep the prefix:
 * one call resolves through realpath (prefix stripped or not, depending
 * on the Node build) and the next still has the verbatim path the CLI sent.
 */
function stripWin32VerbatimPrefix(p: string): string {
  const s = p.replace(/\//g, '\\');
  if (s.length >= 8 && s.slice(0, 8).toLowerCase() === '\\\\?\\unc\\') {
    return '\\\\' + s.slice(8);
  }
  if (s.length >= 4 && s.slice(0, 4).toLowerCase() === '\\\\?\\') {
    return s.slice(4);
  }
  // \\.\C:\foo is the DOS device form of C:\foo. Leave \\.\pipe\ and \\.\COM1.
  if (s.length >= 7 && s.slice(0, 4).toLowerCase() === '\\\\.\\' && /^[a-z]:\\/i.test(s.slice(4))) {
    return s.slice(4);
  }
  return s;
}

/** Win32 ignores trailing dots and spaces on each component unless the path is verbatim. */
function stripWin32TrailingDotSpace(normalized: string): string {
  const P = nodePath.win32;
  const root = P.parse(normalized).root;
  const rest = normalized.slice(root.length);
  if (!rest) {
    return root || normalized;
  }
  const cleaned: string[] = [];
  for (const seg of rest.split('\\')) {
    if (seg === '' || seg === '.') {
      continue;
    }
    if (seg === '..') {
      cleaned.push(seg);
      continue;
    }
    let s = seg;
    while (s.length > 0 && (s.endsWith('.') || s.endsWith(' '))) {
      s = s.slice(0, -1);
    }
    if (s.length > 0) {
      cleaned.push(s);
    }
  }
  return cleaned.length ? P.join(root, ...cleaned) : root || normalized;
}

function canonicalWin32(p: string): string {
  return stripWin32VerbatimPrefix(p);
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
      const real = platform === 'win32' ? canonicalWin32(realpath(cur)) : realpath(cur);
      return tail.length ? P.join(real, ...tail.reverse()) : real;
    } catch {
      const parent = P.dirname(cur);
      if (parent === cur) {
        const resolved = P.resolve(p);
        return platform === 'win32' ? canonicalWin32(resolved) : resolved;
      }
      tail.push(P.basename(cur));
      cur = parent;
    }
  }
}

/**
 * Comparison key: Windows → verbatim prefix removed, lower case, `\`,
 * trailing dots/spaces removed; no trailing separator except at a root.
 */
export function scopeKey(p: string, platform: NodeJS.Platform = process.platform): string {
  const P = api(platform);
  const prepared = platform === 'win32' ? canonicalWin32(p.replace(/\//g, '\\')) : p;
  let k = P.normalize(prepared);
  if (platform === 'win32') {
    k = stripWin32TrailingDotSpace(k).toLowerCase();
  }
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
