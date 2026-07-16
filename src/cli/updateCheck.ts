/**
 * Check whether the official Grok CLI has a newer version.
 * Uses `grok update --check --json` (and version.json as soft fallback).
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getConfig } from '../util/config';
import { getLogger } from '../util/logger';

export interface CliUpdateInfo {
  checked: boolean;
  updateAvailable: boolean;
  currentVersion?: string;
  latestVersion?: string;
  channel?: string;
  autoUpdate?: boolean;
  error?: string;
  /** Human summary for banners */
  message?: string;
}

interface UpdateJson {
  currentVersion?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  channel?: string;
  autoUpdate?: boolean;
  error?: string | null;
}

/**
 * Parse semver-ish strings like "0.2.101" or "grok 0.2.101 (hash) [stable]".
 */
export function extractVersionToken(raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }
  const m = String(raw).match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
  return m?.[1];
}

/** Compare a.b.c style versions. Returns positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) {
      return da - db;
    }
  }
  return 0;
}

export function checkCliUpdate(cliPathOverride?: string): Promise<CliUpdateInfo> {
  const cfg = getConfig();
  const cliPath = cliPathOverride ?? cfg.cliPath;
  const log = getLogger();

  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let proc;
    try {
      // Prefer JSON check; single argv list, no shell
      proc = spawn(cliPath, ['update', '--check', '--json'], {
        shell: false,
        windowsHide: true,
        env: { ...process.env },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      resolve(fallbackFromVersionFile(message));
      return;
    }

    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      resolve(fallbackFromVersionFile('Update check timed out'));
    }, 12_000);

    proc.stdout?.on('data', (d) => (out += d.toString()));
    proc.stderr?.on('data', (d) => (err += d.toString()));
    proc.on('error', (e) => {
      clearTimeout(timer);
      log.debug('grok update --check failed', e);
      resolve(fallbackFromVersionFile(e.message));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const text = (out || err).trim();
      // JSON may be on a single line among noise
      const jsonLine =
        text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l.startsWith('{') && l.includes('updateAvailable')) ??
        text;
      try {
        const j = JSON.parse(jsonLine) as UpdateJson;
        const updateAvailable = !!j.updateAvailable;
        const currentVersion = j.currentVersion;
        const latestVersion = j.latestVersion;
        resolve({
          checked: true,
          updateAvailable,
          currentVersion,
          latestVersion,
          channel: j.channel,
          autoUpdate: j.autoUpdate ?? undefined,
          error: j.error ?? undefined,
          message: updateAvailable
            ? `Grok CLI ${currentVersion ?? '?'} → ${latestVersion ?? 'newer'} available`
            : currentVersion
              ? `Grok CLI up to date (${currentVersion})`
              : 'Grok CLI up to date',
        });
      } catch {
        log.debug('Could not parse update --check JSON', text.slice(0, 200), code);
        resolve(fallbackFromVersionFile(err || out || `exit ${code}`));
      }
    });
  });
}

function fallbackFromVersionFile(errorHint?: string): CliUpdateInfo {
  try {
    const p = path.join(os.homedir(), '.grok', 'version.json');
    if (!fs.existsSync(p)) {
      return {
        checked: false,
        updateAvailable: false,
        error: errorHint,
        message: errorHint
          ? `Update check failed (${errorHint})`
          : undefined,
      };
    }
    const j = JSON.parse(fs.readFileSync(p, 'utf8')) as {
      version?: string;
      stable_version?: string;
    };
    const current = extractVersionToken(j.version);
    const stable = extractVersionToken(j.stable_version);
    if (current && stable && compareVersions(stable, current) > 0) {
      return {
        checked: true,
        updateAvailable: true,
        currentVersion: current,
        latestVersion: stable,
        message: `Grok CLI ${current} → ${stable} available`,
      };
    }
    return {
      checked: true,
      updateAvailable: false,
      currentVersion: current,
      latestVersion: stable,
      message: current ? `Grok CLI up to date (${current})` : 'Grok CLI up to date',
      error: errorHint,
    };
  } catch {
    return {
      checked: false,
      updateAvailable: false,
      error: errorHint,
    };
  }
}

/** Run `grok update` (install). Returns combined stdout/stderr. */
export function runCliUpdate(cliPathOverride?: string): Promise<{
  ok: boolean;
  output: string;
}> {
  const cfg = getConfig();
  const cliPath = cliPathOverride ?? cfg.cliPath;
  return new Promise((resolve) => {
    let out = '';
    let proc;
    try {
      proc = spawn(cliPath, ['update'], {
        shell: false,
        windowsHide: true,
        env: { ...process.env },
      });
    } catch (e) {
      resolve({
        ok: false,
        output: e instanceof Error ? e.message : String(e),
      });
      return;
    }
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      resolve({ ok: false, output: out || 'Update timed out' });
    }, 180_000);
    proc.stdout?.on('data', (d) => (out += d.toString()));
    proc.stderr?.on('data', (d) => (out += d.toString()));
    proc.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, output: e.message });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: out.trim() });
    });
  });
}
