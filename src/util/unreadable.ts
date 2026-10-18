/**
 * Helpers for binary / unreadable files in write approvals.
 * Pure module (no vscode) — unit-tested.
 *
 * Grok CLI ≥ 1.0.54 marks such files in the permission title, verified live
 * against 1.0.62:  "Write `/path/img.bin` (unreadable, no preview)"  (no diff content).
 */

const UNREADABLE_SUFFIX = /\s*\((?:[^()]*\b)?unreadable\b[^()]*\)\s*$/i;

export interface ParsedPermissionTitle {
  /** Title without the "(unreadable…)" suffix. */
  title: string;
  unreadable: boolean;
}

export function parsePermissionTitle(title: string | undefined | null): ParsedPermissionTitle {
  const raw = typeof title === 'string' ? title : '';
  if (UNREADABLE_SUFFIX.test(raw)) {
    return { title: raw.replace(UNREADABLE_SUFFIX, '').trim(), unreadable: true };
  }
  return { title: raw, unreadable: false };
}

/** Binary heuristic: NUL byte or invalid UTF-8 within the first `sampleBytes`. */
export function isProbablyBinary(buf: Uint8Array, sampleBytes = 8192): boolean {
  if (!buf || buf.length === 0) {
    return false;
  }
  let sample = buf.subarray(0, Math.min(buf.length, sampleBytes));
  if (sample.includes(0)) {
    return true;
  }
  // Don't flag a multi-byte char cut at the sample boundary
  if (buf.length > sampleBytes) {
    let i = sample.length - 1;
    let back = 0;
    while (i >= 0 && back < 3 && (sample[i] & 0xc0) === 0x80) {
      i--;
      back++;
    }
    if (i >= 0 && sample[i] >= 0xc0) {
      sample = sample.subarray(0, i);
    }
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample);
    return false;
  } catch {
    return true;
  }
}

export function unreadableLabel(lang?: string): string {
  return typeof lang === 'string' && /^de\b/i.test(lang.trim())
    ? 'nicht lesbar – keine Vorschau'
    : 'unreadable – no preview';
}
