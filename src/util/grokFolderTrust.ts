/**
 * Grok CLI folder trust (P1, CLI 1.0.62+). Pure module (no vscode) — unit-tested.
 *
 * Grok only loads a project's hooks, rules (AGENTS.md …), skills and MCP
 * servers when the folder is trusted. Over ACP (`grok agent stdio`) there is
 * no interactive trust prompt: in an untrusted folder these sources are
 * skipped silently. Trust is granted with the top-level `--trust` flag (or
 * `/hooks-trust` in the TUI) and persisted in `$GROK_HOME/trusted_folders.toml`:
 *
 * ```toml
 * [folders."/path/to/repo"]
 * trusted = true
 * decided_at = 1792281600
 * ```
 *
 * A grant covers subdirectories of the same git repository; a nested git
 * checkout is a separate workspace. `GROK_FOLDER_TRUST=0` or
 * `[folder_trust] enabled = false` in `$GROK_HOME/config.toml` turns the
 * gate off. Grok does not gate the home directory or the filesystem root.
 */
import * as nodeFs from 'node:fs';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';

export type ProjectSourceKind = 'hooks' | 'rules' | 'skills' | 'mcp';

export interface ProjectSource {
  kind: ProjectSourceKind;
  /** Path relative to the inspected folder (forward slashes). */
  path: string;
}

export interface FolderTrustOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  platform?: NodeJS.Platform;
  /** Sync realpath; default fs.realpathSync.native (errors → path as-is). */
  realpath?: (p: string) => string;
}

export type FolderTrustState =
  /** Folder trust is turned off in the CLI: everything loads. */
  | 'disabled'
  /** Home directory or filesystem root: not gated by Grok. */
  | 'exempt'
  | 'trusted'
  /** Explicitly denied (`trusted = false`). */
  | 'denied'
  | 'untrusted';

export interface FolderTrustInfo {
  folder: string;
  state: FolderTrustState;
  /** Trusted folder entry that applies (exact or ancestor in the same repo). */
  trustedBy?: string;
  /** Git repository root, if the folder is inside one. */
  repoRoot?: string;
  sources: ProjectSource[];
}

function api(platform: NodeJS.Platform): nodePath.PlatformPath {
  return platform === 'win32' ? nodePath.win32 : nodePath.posix;
}

export function grokHomeDir(opts: FolderTrustOptions = {}): string {
  const env = opts.env ?? process.env;
  const P = api(opts.platform ?? process.platform);
  const custom = env.GROK_HOME?.trim();
  if (custom) {
    return P.resolve(custom);
  }
  return P.join(opts.homeDir ?? nodeOs.homedir(), '.grok');
}

export function trustStorePath(opts: FolderTrustOptions = {}): string {
  const P = api(opts.platform ?? process.platform);
  return P.join(grokHomeDir(opts), 'trusted_folders.toml');
}

function unescapeBasic(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (_m, esc: string) => {
    switch (esc[0]) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'u':
      case 'U':
        return String.fromCodePoint(parseInt(esc.slice(1), 16));
      default:
        return esc;
    }
  });
}

/**
 * Parse `trusted_folders.toml` (only the `[folders."<path>"]` tables and their
 * `trusted` key). Unknown content is ignored; a broken file yields an empty map.
 */
export function parseTrustedFolders(toml: string): Map<string, boolean> {
  const out = new Map<string, boolean>();
  let current: string | undefined;
  const header =
    /^\s*\[\s*folders\s*\.\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([A-Za-z0-9_-]+))\s*\]\s*(?:#.*)?$/;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    if (line.startsWith('[')) {
      const m = header.exec(line);
      current = m ? (m[1] !== undefined ? unescapeBasic(m[1]) : (m[2] ?? m[3])) : undefined;
      continue;
    }
    if (current === undefined) {
      continue;
    }
    const kv = /^trusted\s*=\s*(true|false)\b/.exec(line);
    if (kv) {
      out.set(current, kv[1] === 'true');
    }
  }
  return out;
}

/** `[folder_trust] enabled = false` in config.toml. */
export function folderTrustDisabledInConfig(toml: string): boolean {
  let inSection = false;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) {
      continue;
    }
    if (line.startsWith('[')) {
      inSection = /^\[\s*folder_trust\s*\]$/.test(line);
      continue;
    }
    if (inSection && /^enabled\s*=\s*false\b/.test(line)) {
      return true;
    }
  }
  return false;
}

export function folderTrustDisabledByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.GROK_FOLDER_TRUST?.trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'off' || v === 'no';
}

function readText(p: string): string | undefined {
  try {
    return nodeFs.readFileSync(p, 'utf8');
  } catch {
    return undefined;
  }
}

function isDir(p: string): boolean {
  try {
    return nodeFs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return nodeFs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function listDir(p: string): string[] {
  try {
    return nodeFs.readdirSync(p);
  } catch {
    return [];
  }
}

function exists(p: string): boolean {
  try {
    nodeFs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Nearest ancestor (or the folder itself) that contains `.git`. */
export function findRepoRoot(folder: string, platform: NodeJS.Platform = process.platform): string | undefined {
  const P = api(platform);
  let cur = P.resolve(folder);
  for (;;) {
    if (exists(P.join(cur, '.git'))) {
      return cur;
    }
    const parent = P.dirname(cur);
    if (parent === cur) {
      return undefined;
    }
    cur = parent;
  }
}

function keyOf(p: string, platform: NodeJS.Platform): string {
  const P = api(platform);
  let k = P.resolve(p);
  if (platform === 'win32') {
    k = k.replace(/\//g, '\\').toLowerCase();
  }
  if (k.length > 1 && (k.endsWith('/') || k.endsWith('\\')) && !/^[a-z]:\\$/i.test(k)) {
    k = k.slice(0, -1);
  }
  return k;
}

/** Directories from `top` down to `folder` (inclusive); `[folder]` if top is not an ancestor. */
function chain(top: string | undefined, folder: string, platform: NodeJS.Platform): string[] {
  const P = api(platform);
  const dirs: string[] = [];
  let cur = P.resolve(folder);
  const topKey = top ? keyOf(top, platform) : undefined;
  for (;;) {
    dirs.unshift(cur);
    if (!topKey || keyOf(cur, platform) === topKey) {
      break;
    }
    const parent = P.dirname(cur);
    if (parent === cur) {
      return [P.resolve(folder)];
    }
    cur = parent;
  }
  return dirs;
}

/**
 * Decide whether Grok trusts `folder`, given the parsed trust store: an entry
 * for the folder itself or for an ancestor inside the same git repository.
 * The nearest decision wins (a `trusted = false` below a trusted root denies).
 */
export function resolveFolderTrust(
  folder: string,
  store: Map<string, boolean>,
  repoRoot: string | undefined,
  opts: FolderTrustOptions = {}
): { state: 'trusted' | 'denied' | 'untrusted'; trustedBy?: string } {
  const platform = opts.platform ?? process.platform;
  const realpath = opts.realpath ?? ((x: string) => nodeFs.realpathSync.native(x));
  const keys = new Map<string, { path: string; trusted: boolean }>();
  for (const [p, trusted] of store) {
    keys.set(keyOf(p, platform), { path: p, trusted });
    try {
      keys.set(keyOf(realpath(p), platform), { path: p, trusted });
    } catch {
      /* missing folder */
    }
  }
  const candidates = (f: string) => {
    const list = [keyOf(f, platform)];
    try {
      list.push(keyOf(realpath(f), platform));
    } catch {
      /* ignore */
    }
    return list;
  };
  const dirs = chain(repoRoot, folder, platform).reverse();
  for (const d of dirs) {
    for (const k of candidates(d)) {
      const hit = keys.get(k);
      if (hit) {
        return hit.trusted
          ? { state: 'trusted', trustedBy: hit.path }
          : { state: 'denied', trustedBy: hit.path };
      }
    }
  }
  return { state: 'untrusted' };
}

const RULE_FILES = new Set(
  ['agents.md', 'agent.md', 'claude.md', 'claude.local.md'].map((s) => s.toLowerCase())
);

/**
 * Project sources that Grok gates behind folder trust, scanned from the repo
 * root down to `folder` (only `folder` outside a repo). Paths are relative
 * to `folder`'s repo root (or `folder`).
 */
export function detectProjectSources(
  folder: string,
  repoRoot: string | undefined,
  platform: NodeJS.Platform = process.platform
): ProjectSource[] {
  const P = api(platform);
  const base = repoRoot ?? P.resolve(folder);
  const out: ProjectSource[] = [];
  const seen = new Set<string>();
  const add = (kind: ProjectSourceKind, abs: string) => {
    const rel = (P.relative(base, abs) || P.basename(abs)).split(P.sep).join('/');
    const k = `${kind}:${rel}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ kind, path: rel });
    }
  };
  const hasMd = (dir: string, exts = ['.md']) =>
    listDir(dir).some((n) => exts.some((e) => n.toLowerCase().endsWith(e)));

  for (const dir of chain(repoRoot, folder, platform)) {
    // Rules: AGENTS.md / CLAUDE.md … and rules directories
    for (const name of listDir(dir)) {
      if (RULE_FILES.has(name.toLowerCase()) && isFile(P.join(dir, name))) {
        add('rules', P.join(dir, name));
      }
    }
    for (const rd of [
      ['.grok', 'rules'],
      ['.claude', 'rules'],
      ['.cursor', 'rules'],
    ]) {
      const d = P.join(dir, ...rd);
      if (isDir(d) && hasMd(d, ['.md', '.mdc'])) {
        add('rules', d);
      }
    }

    // Hooks
    const grokHooks = P.join(dir, '.grok', 'hooks');
    if (isDir(grokHooks)) {
      for (const n of listDir(grokHooks)) {
        if (n.toLowerCase().endsWith('.json')) {
          add('hooks', P.join(grokHooks, n));
        }
      }
    }
    for (const f of [
      ['.claude', 'settings.json'],
      ['.claude', 'settings.local.json'],
    ]) {
      const p = P.join(dir, ...f);
      const txt = readText(p);
      if (txt && /"hooks"\s*:/.test(txt)) {
        add('hooks', p);
      }
    }
    const cursorHooks = P.join(dir, '.cursor', 'hooks.json');
    if (isFile(cursorHooks)) {
      add('hooks', cursorHooks);
    }
    const grokConfig = P.join(dir, '.grok', 'config.toml');
    const cfgText = readText(grokConfig);
    if (cfgText) {
      if (/^\s*\[\[?\s*hooks\b/m.test(cfgText)) {
        add('hooks', grokConfig);
      }
      if (/^\s*\[\s*mcp_servers\b|^\s*\[\s*mcp\b/m.test(cfgText)) {
        add('mcp', grokConfig);
      }
    }

    // Skills / legacy commands
    for (const sd of [
      ['.grok', 'skills'],
      ['.grok', 'commands'],
      ['.claude', 'skills'],
      ['.claude', 'commands'],
    ]) {
      const d = P.join(dir, ...sd);
      if (isDir(d) && listDir(d).some((n) => !n.startsWith('.'))) {
        add('skills', d);
      }
    }

    // MCP
    for (const f of [['.mcp.json'], ['.cursor', 'mcp.json']]) {
      const p = P.join(dir, ...f);
      if (isFile(p)) {
        add('mcp', p);
      }
    }
  }
  return out;
}

/** Full check for one workspace folder. Never throws. */
export function inspectFolderTrust(folder: string, opts: FolderTrustOptions = {}): FolderTrustInfo {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  const P = api(platform);
  const resolved = P.resolve(folder);
  const repoRoot = findRepoRoot(resolved, platform);
  const sources = detectProjectSources(resolved, repoRoot, platform);
  const info: FolderTrustInfo = { folder: resolved, state: 'untrusted', repoRoot, sources };

  if (folderTrustDisabledByEnv(env)) {
    info.state = 'disabled';
    return info;
  }
  const cfg = readText(P.join(grokHomeDir(opts), 'config.toml'));
  if (cfg && folderTrustDisabledInConfig(cfg)) {
    info.state = 'disabled';
    return info;
  }
  const home = opts.homeDir ?? nodeOs.homedir();
  const k = keyOf(resolved, platform);
  if (k === keyOf(home, platform) || P.dirname(resolved) === resolved) {
    info.state = 'exempt';
    return info;
  }
  const store = parseTrustedFolders(readText(trustStorePath(opts)) ?? '');
  const r = resolveFolderTrust(resolved, store, repoRoot, opts);
  info.state = r.state;
  info.trustedBy = r.trustedBy;
  return info;
}

/** True when Grok is skipping project sources that exist in this folder. */
export function needsGrokTrust(info: FolderTrustInfo): boolean {
  return (info.state === 'untrusted' || info.state === 'denied') && info.sources.length > 0;
}

const KIND_LABEL: Record<ProjectSourceKind, string> = {
  hooks: 'hooks',
  rules: 'project rules',
  skills: 'skills',
  mcp: 'MCP servers',
};

/** "hooks (.grok/hooks/pre.json), project rules (AGENTS.md)" — max `perKind` paths each. */
export function describeProjectSources(sources: ProjectSource[], perKind = 2): string {
  const order: ProjectSourceKind[] = ['hooks', 'rules', 'skills', 'mcp'];
  const parts: string[] = [];
  for (const kind of order) {
    const paths = sources.filter((s) => s.kind === kind).map((s) => s.path);
    if (!paths.length) {
      continue;
    }
    const shown = paths.slice(0, perKind).join(', ');
    const more = paths.length > perKind ? `, +${paths.length - perKind} more` : '';
    parts.push(`${KIND_LABEL[kind]} (${shown}${more})`);
  }
  return parts.join(', ');
}

export interface GrokTrustBannerState {
  show: boolean;
  folder: string;
  folderName: string;
  /** e.g. "hooks (.grok/hooks/pre.json), project rules (AGENTS.md)" */
  summary: string;
  kinds: ProjectSourceKind[];
  /** "Trust folder" is offered only in a trusted VS Code workspace. */
  canTrust: boolean;
  message: string;
}

/**
 * Banner model for the chat view. Shown when Grok skips project sources in
 * the workspace folder, unless dismissed for that folder or trust was already
 * requested this session (the next agent start passes `--trust`).
 */
export function grokTrustBannerState(
  info: FolderTrustInfo | undefined,
  ctx: { vscodeTrusted: boolean; dismissed: boolean; trustRequested: boolean },
  platform: NodeJS.Platform = process.platform
): GrokTrustBannerState {
  const P = api(platform);
  const folder = info?.folder ?? '';
  const sources = info?.sources ?? [];
  const kinds = (['hooks', 'rules', 'skills', 'mcp'] as ProjectSourceKind[]).filter((k) =>
    sources.some((s) => s.kind === k)
  );
  const show = !!info && needsGrokTrust(info) && !ctx.dismissed && !ctx.trustRequested;
  const summary = describeProjectSources(sources);
  const denied = info?.state === 'denied';
  const message =
    `Grok CLI ${denied ? 'has marked this folder as not trusted' : 'does not trust this folder yet'}, ` +
    `so it ignores this project's ${summary || 'settings'}. ` +
    (ctx.vscodeTrusted
      ? 'Trust the folder to load them (the agent restarts; open chats keep their conversation).'
      : 'Trust the workspace in VS Code first (Restricted Mode), then you can trust it for Grok.');
  return {
    show,
    folder,
    folderName: folder ? P.basename(folder) || folder : '',
    summary,
    kinds,
    canTrust: show && ctx.vscodeTrusted,
    message,
  };
}
