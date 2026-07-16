/**
 * Check GitHub Releases for a newer extension version (VSIX).
 * Works with public repos unauthenticated; private repos use VS Code GitHub auth when available.
 */
import * as https from 'node:https';
import * as vscode from 'vscode';
import { getLogger } from './logger';
import { compareVersions, extractVersionToken } from '../cli/updateCheck';

export interface ExtensionUpdateInfo {
  checked: boolean;
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  vsixUrl?: string;
  message?: string;
  error?: string;
}

const EXT_IDS = [
  'bhuertgen.grok-build-vscode',
  'grok-build.grok-build-vscode',
];

function getExtensionPackage(): { version?: string; repository?: unknown } {
  for (const id of EXT_IDS) {
    const ext = vscode.extensions.getExtension(id);
    if (ext?.packageJSON) {
      return ext.packageJSON as { version?: string; repository?: unknown };
    }
  }
  return {};
}

export function getInstalledExtensionVersion(): string {
  return getExtensionPackage().version ?? '0.0.0';
}

export function resolveUpdateRepo(): string {
  const cfg = vscode.workspace.getConfiguration('grokBuild');
  const fromSetting = cfg.get<string>('updateRepo', '')?.trim();
  if (fromSetting) {
    return fromSetting
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\.git$/, '');
  }
  const pkg = getExtensionPackage();
  const url =
    typeof pkg.repository === 'string'
      ? pkg.repository
      : (pkg.repository as { url?: string } | undefined)?.url ?? '';
  const m = url.match(/github\.com[/:]([^/]+\/[^/.]+)/i);
  if (m) {
    return m[1].replace(/\.git$/, '');
  }
  return 'bhuertgen/grok-build-vscode';
}

interface GhRelease {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
}

async function githubGetJson(
  apiPath: string,
  token?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: apiPath,
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'grok-build-vscode',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c.toString()));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body })
        );
      }
    );
    req.on('error', reject);
    req.setTimeout(12_000, () => {
      req.destroy(new Error('GitHub request timeout'));
    });
    req.end();
  });
}

async function getGithubToken(): Promise<string | undefined> {
  const cfg = vscode.workspace.getConfiguration('grokBuild');
  const manual = cfg.get<string>('githubToken', '')?.trim();
  if (manual) {
    return manual;
  }
  try {
    const session = await vscode.authentication.getSession(
      'github',
      ['repo'],
      { createIfNone: false }
    );
    return session?.accessToken;
  } catch {
    return undefined;
  }
}

export async function checkExtensionUpdate(): Promise<ExtensionUpdateInfo> {
  const log = getLogger();
  const currentVersion = getInstalledExtensionVersion();
  const repo = resolveUpdateRepo();
  const includePrerelease = vscode.workspace
    .getConfiguration('grokBuild')
    .get<boolean>('checkPrereleaseUpdates', false);

  try {
    const token = await getGithubToken();
    // Latest release (skips drafts). For prereleases, use /releases and pick first non-draft.
    let release: GhRelease | undefined;
    if (includePrerelease) {
      const list = await githubGetJson(
        `/repos/${repo}/releases?per_page=5`,
        token
      );
      if (list.status === 404) {
        return {
          checked: true,
          updateAvailable: false,
          currentVersion,
          error: `Repo ${repo} not found or private (sign in to GitHub in VS Code)`,
          message: undefined,
        };
      }
      if (list.status !== 200) {
        return {
          checked: false,
          updateAvailable: false,
          currentVersion,
          error: `GitHub HTTP ${list.status}`,
        };
      }
      const arr = JSON.parse(list.body) as GhRelease[];
      release = arr.find((r) => !r.draft);
    } else {
      const res = await githubGetJson(
        `/repos/${repo}/releases/latest`,
        token
      );
      if (res.status === 404) {
        // No releases yet — not an error for first publish
        return {
          checked: true,
          updateAvailable: false,
          currentVersion,
          message: `No GitHub releases on ${repo} yet`,
        };
      }
      if (res.status !== 200) {
        return {
          checked: false,
          updateAvailable: false,
          currentVersion,
          error: `GitHub HTTP ${res.status}`,
        };
      }
      release = JSON.parse(res.body) as GhRelease;
    }

    if (!release || release.draft) {
      return {
        checked: true,
        updateAvailable: false,
        currentVersion,
      };
    }
    if (release.prerelease && !includePrerelease) {
      return {
        checked: true,
        updateAvailable: false,
        currentVersion,
      };
    }

    const latestVersion =
      extractVersionToken(release.tag_name) ||
      extractVersionToken(release.tag_name?.replace(/^v/i, ''));
    if (!latestVersion) {
      return {
        checked: true,
        updateAvailable: false,
        currentVersion,
        error: `Could not parse tag ${release.tag_name}`,
      };
    }

    const vsix = release.assets?.find((a) =>
      /\.vsix$/i.test(a.name ?? '')
    );
    const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;

    return {
      checked: true,
      updateAvailable,
      currentVersion,
      latestVersion,
      releaseUrl: release.html_url,
      vsixUrl: vsix?.browser_download_url,
      message: updateAvailable
        ? `Extension ${currentVersion} → ${latestVersion} available`
        : `Extension up to date (${currentVersion})`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.debug('Extension update check failed', message);
    return {
      checked: false,
      updateAvailable: false,
      currentVersion,
      error: message,
    };
  }
}
