import * as path from 'node:path';

/**
 * Normalize workspace paths so Windows drive-letter case and separators match.
 * Pure helper (no vscode) — unit-tested.
 */
export function normalizeCwdKey(cwd: string): string {
  try {
    return path.resolve(cwd).replace(/\\/g, '/').toLowerCase();
  } catch {
    return String(cwd || '')
      .replace(/\\/g, '/')
      .toLowerCase();
  }
}

export function sameCwd(a: string, b: string): boolean {
  return normalizeCwdKey(a) === normalizeCwdKey(b);
}
