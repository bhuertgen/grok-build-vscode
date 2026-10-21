import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfig } from '../util/config';
import { getLogger } from '../util/logger';
import {
  checkExplicitCliPath,
  invalidCliPathMessage,
  resolveCliCandidates,
  type CliPathFs,
} from './cliPath';

export interface CliDetectionResult {
  ok: boolean;
  /** Path that was probed (configured or resolved). */
  cliPath: string;
  version?: string;
  error?: string;
  /** Raw grokBuild.cliPath this detection was run for (#41). */
  configuredPath?: string;
  /** Explicit cliPath that does not exist / is not executable (#41). */
  invalidPath?: boolean;
}

/** Real fs adapter for checkExplicitCliPath. */
export const nodeCliPathFs: CliPathFs = {
  stat(p) {
    try {
      return fs.statSync(p);
    } catch {
      return null;
    }
  },
  isExecutable(p) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * Probe whether the Grok Build CLI is available and responds to `--version`.
 * This is the only runtime dependency for the hybrid ACP architecture.
 * An explicit grokBuild.cliPath is probed alone (no fallback, #41).
 */
export function detectGrokCli(cliPathOverride?: string): Promise<CliDetectionResult> {
  const cfg = getConfig();
  const configured = cliPathOverride ?? cfg.cliPath;
  const log = getLogger();
  const { explicit, candidates } = resolveCliCandidates(configured, {
    platform: process.platform,
    home: process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME,
    localAppData: process.env.LOCALAPPDATA,
  });

  if (explicit) {
    const problem = checkExplicitCliPath(candidates[0], nodeCliPathFs, process.platform);
    if (problem) {
      const error = invalidCliPathMessage(candidates[0], problem);
      log.warn(error);
      return Promise.resolve({
        ok: false,
        cliPath: candidates[0],
        configuredPath: configured,
        invalidPath: true,
        error,
      });
    }
  }

  return new Promise((resolve) => {
    tryNext(candidates, 0, (r) => {
      if (!r.ok && explicit) {
        r = {
          ...r,
          invalidPath: true,
          error: `grokBuild.cliPath points to ${candidates[0]} – it did not respond to --version. Fix the setting or clear it to use grok from PATH.`,
        };
      }
      resolve({ ...r, configuredPath: configured });
    }, log);
  });
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
