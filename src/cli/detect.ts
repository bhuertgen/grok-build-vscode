import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfig } from '../util/config';
import { getLogger } from '../util/logger';

export interface CliDetectionResult {
  ok: boolean;
  /** Path that was probed (configured or resolved). */
  cliPath: string;
  version?: string;
  error?: string;
}

/**
 * Probe whether the Grok Build CLI is available and responds to `--version`.
 * This is the only runtime dependency for the hybrid ACP architecture.
 */
export function detectGrokCli(cliPathOverride?: string): Promise<CliDetectionResult> {
  const cfg = getConfig();
  const cliPath = cliPathOverride ?? cfg.cliPath;
  const log = getLogger();

  return new Promise((resolve) => {
    const candidates = buildCandidates(cliPath);
    tryNext(candidates, 0, resolve, log);
  });
}

function buildCandidates(cliPath: string): string[] {
  const list: string[] = [cliPath];
  // Common install locations (best-effort; PATH is still primary)
  if (process.platform === 'win32') {
    const home = process.env.USERPROFILE ?? '';
    const local = process.env.LOCALAPPDATA ?? '';
    list.push(
      path.join(home, '.local', 'bin', 'grok.exe'),
      path.join(home, '.grok', 'bin', 'grok.exe'),
      path.join(local, 'grok', 'grok.exe')
    );
  } else {
    const home = process.env.HOME ?? '';
    list.push(
      path.join(home, '.local', 'bin', 'grok'),
      path.join(home, '.grok', 'bin', 'grok'),
      '/usr/local/bin/grok'
    );
  }
  // De-dupe
  return [...new Set(list.filter(Boolean))];
}

function tryNext(
  candidates: string[],
  index: number,
  resolve: (r: CliDetectionResult) => void,
  log: ReturnType<typeof getLogger>
): void {
  if (index >= candidates.length) {
    resolve({
      ok: false,
      cliPath: candidates[0] ?? 'grok',
      error:
        'Grok Build CLI was not found. Install it from https://x.ai/cli and ensure it is on your PATH, or set grokBuild.cliPath.',
    });
    return;
  }

  const cliPath = candidates[index];
  // If absolute-looking and missing, skip spawn
  if (
    (cliPath.includes('/') || cliPath.includes('\\')) &&
    path.isAbsolute(cliPath) &&
    !fs.existsSync(cliPath)
  ) {
    tryNext(candidates, index + 1, resolve, log);
    return;
  }

  let settled = false;
  const finish = (r: CliDetectionResult) => {
    if (settled) {
      return;
    }
    settled = true;
    resolve(r);
  };

  let out = '';
  let proc;
  try {
    // Avoid shell:true + args[] (Node DEP0190 red noise in Debug Console).
    // .cmd/.bat shims on Windows still need a shell — pass a single command string.
    const isWinShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cliPath);
    proc = isWinShim
      ? spawn(`"${cliPath}" --version`, {
          shell: true,
          windowsHide: true,
          env: { ...process.env },
        })
      : spawn(cliPath, ['--version'], {
          shell: false,
          windowsHide: true,
          env: { ...process.env },
        });
  } catch (err) {
    log.debug('CLI spawn failed', cliPath, err);
    tryNext(candidates, index + 1, resolve, log);
    return;
  }

  const timer = setTimeout(() => {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
    tryNext(candidates, index + 1, resolve, log);
  }, 8000);

  proc.stdout?.on('data', (d) => (out += d.toString()));
  proc.stderr?.on('data', (d) => (out += d.toString()));
  proc.on('error', () => {
    clearTimeout(timer);
    tryNext(candidates, index + 1, resolve, log);
  });
  proc.on('close', (code) => {
    clearTimeout(timer);
    const version = out.trim();
    if (code === 0 || version.length > 0) {
      log.info(`Grok CLI detected: ${cliPath} → ${version || 'OK'}`);
      finish({
        ok: true,
        cliPath,
        version: version || undefined,
      });
      return;
    }
    tryNext(candidates, index + 1, resolve, log);
  });
}

/** Install command suggestions by platform (for copy / terminal). */
export function getInstallInstructions(): {
  title: string;
  command: string;
  docsUrl: string;
  notes: string[];
} {
  const docsUrl = 'https://x.ai/cli';
  if (process.platform === 'win32') {
    return {
      title: 'Install Grok Build CLI (Windows)',
      command:
        'irm https://x.ai/cli/install.ps1 | iex',
      docsUrl,
      notes: [
        'Requires SuperGrok or X Premium Plus for the official CLI.',
        'After install, restart VS Code so PATH updates are picked up.',
        'Or set Settings → Grok Build → Cli Path to the full path of grok.exe.',
      ],
    };
  }
  return {
    title: 'Install Grok Build CLI (macOS / Linux)',
    command: 'curl -fsSL https://x.ai/cli/install.sh | bash',
    docsUrl,
    notes: [
      'Requires SuperGrok or X Premium Plus for the official CLI.',
      'After install, restart your terminal / VS Code if PATH was updated.',
      'Or set grokBuild.cliPath to the absolute path of the grok binary.',
    ],
  };
}
