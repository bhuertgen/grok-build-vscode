/**
 * Helpers for binary / unreadable files in write approvals.
 * Pure module (no vscode) — unit-tested.
 *
 * Grok CLI ≥ 1.0.54 marks such files in the permission title, verified live
 * against 1.0.62:  "Write `/path/img.bin` (unreadable, no preview)"  (no diff content).
 */

import { isGermanLocale, localize } from './locale';

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
  return localize({ en: 'unreadable – no preview', de: 'nicht lesbar – keine Vorschau' }, lang);
}

interface ToolCallLike {
  kind?: string | null;
  rawInput?: unknown;
  locations?: Array<{ path?: string }> | null;
  _meta?: Record<string, unknown> | null;
}

function pickStr(o: unknown, ...keys: string[]): string | undefined {
  if (!o || typeof o !== 'object') {
    return undefined;
  }
  for (const k of keys) {
    const v = (o as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  return undefined;
}

/** Target path of a write/edit tool call (rawInput, x.ai/tool meta, or locations). */
export function extractWritePath(tc: ToolCallLike | undefined | null): string | undefined {
  if (!tc) {
    return undefined;
  }
  const meta = (tc._meta?.['x.ai/tool'] ?? undefined) as Record<string, unknown> | undefined;
  return (
    pickStr(tc.rawInput, 'file_path', 'path', 'target_file', 'filePath') ??
    pickStr(meta?.input, 'path', 'file_path') ??
    (tc.locations?.find((l) => typeof l?.path === 'string' && l.path)?.path || undefined)
  );
}

/** True for ACP `edit` permissions or Grok tools of kind write/edit. */
export function isWriteLikeToolCall(tc: ToolCallLike | undefined | null): boolean {
  if (!tc) {
    return false;
  }
  const meta = (tc._meta?.['x.ai/tool'] ?? undefined) as Record<string, unknown> | undefined;
  const metaKind = typeof meta?.kind === 'string' ? meta.kind : '';
  return tc.kind === 'edit' || metaKind === 'write' || metaKind === 'edit';
}
