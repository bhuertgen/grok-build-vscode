/**
 * Lightweight semver helpers for Grok CLI version strings.
 * Pure module — safe for unit tests without vscode.
 */

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
