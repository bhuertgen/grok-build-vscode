/**
 * Git remote → https issue/PR URL template (`{n}` = number).
 * GitHub (and Gitea / Forgejo / Codeberg) use `/issues/{n}` — GitHub redirects
 * pull requests there. GitLab uses `/-/issues/{n}` (`#123` is an issue; `!123`
 * is a merge request). Unknown hosts get the GitHub-style path.
 * No remote, or a remote we cannot parse → null (the webview leaves `#123` as text).
 */
import { execFile } from 'node:child_process';
import { isSafeIssueTemplate } from './messageLinks';

export type GitRunner = (args: string[], cwd: string) => Promise<string | null>;

interface ParsedRemote {
  host: string;
  pathParts: string[];
}

function isGitlabHost(host: string): boolean {
  return (
    host === 'gitlab.com' ||
    host.startsWith('gitlab.') ||
    host.includes('.gitlab.')
  );
}

function cleanParts(pathname: string): string[] | null {
  const trimmed = pathname
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+/, '');
  if (!trimmed) {
    return null;
  }
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  if (
    parts.some(
      (p) => p === '.' || p === '..' || !/^[A-Za-z0-9._+-]+$/.test(p)
    )
  ) {
    return null;
  }
  return parts;
}

export function parseGitRemote(remote: string): ParsedRemote | null {
  const trimmed = remote.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
    if (
      url.protocol !== 'https:' &&
      url.protocol !== 'http:' &&
      url.protocol !== 'ssh:' &&
      url.protocol !== 'git:'
    ) {
      return null;
    }
    const parts = cleanParts(url.pathname);
    if (!url.hostname || !parts) {
      return null;
    }
    return { host: url.hostname, pathParts: parts };
  }

  const scp = /^(?:[^@\s]+@)?([^:/\s]+):([^:\s]+)$/.exec(trimmed);
  if (!scp) {
    return null;
  }
  const parts = cleanParts(scp[2]);
  if (!parts) {
    return null;
  }
  return { host: scp[1], pathParts: parts };
}

/** `https://host/owner/repo/issues/{n}` or a GitLab `/-/issues/{n}` URL. */
export function forgeIssueTemplate(remote: string): string | null {
  const parsed = parseGitRemote(remote);
  if (!parsed) {
    return null;
  }
  const host = parsed.host.toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')) {
    return null;
  }
  const base = `https://${host}/${parsed.pathParts.join('/')}`;
  const template = isGitlabHost(host)
    ? `${base}/-/issues/{n}`
    : `${base}/issues/{n}`;
  return isSafeIssueTemplate(template) ? template : null;
}

export function defaultGitRunner(args: string[], cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout: 2500,
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 64_000,
      },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        resolve(String(stdout ?? ''));
      }
    );
  });
}

/**
 * `origin`, else the first remote. Null when git has no usable forge URL.
 * Pass `run` in tests; the default spawns `git`.
 */
export async function loadForgeIssueTemplate(
  cwd: string,
  run: GitRunner = defaultGitRunner
): Promise<string | null> {
  if (!cwd) {
    return null;
  }
  let url = (await run(['remote', 'get-url', 'origin'], cwd))?.trim() ?? '';
  if (!url) {
    const list = (await run(['remote'], cwd)) ?? '';
    const name = list
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    if (name && /^[A-Za-z0-9._-]+$/.test(name)) {
      url = (await run(['remote', 'get-url', name], cwd))?.trim() ?? '';
    }
  }
  if (!url) {
    return null;
  }
  return forgeIssueTemplate(url);
}
