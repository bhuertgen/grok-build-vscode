/**
 * `@rel/path#start-end` mentions (Claude-style).
 * Pure — no vscode. Shared by composer insert, prompt context, and tests.
 */

export interface FileRangeMention {
  /** Path as written after @ (relative or basename), no leading @ */
  path: string;
  startLine: number;
  endLine: number;
  /** Index of '@' in the source string */
  start: number;
  /** Index just after the mention */
  end: number;
  raw: string;
}

export interface SelectionRangeInput {
  /** Workspace-relative path using forward slashes, no leading slash */
  relativePath: string;
  /** 1-based inclusive */
  startLine: number;
  /** 1-based inclusive */
  endLine: number;
  /** How many cursors the editor has */
  selectionCount?: number;
  /** True when the primary selection has no characters */
  empty?: boolean;
}

export type SelectionMentionResult =
  | { ok: true; mention: string; startLine: number; endLine: number }
  | { ok: false; message: string };

const MENTION_RE = /@([^\s@#]+)#(\d+)-(\d+)/g;

export interface EditorSelectionLike {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

/**
 * VS Code selections are exclusive at the caret. A line selection that ends
 * at column 0 of the next line should not include that next line.
 * Returns 1-based inclusive lines, or null when the selection is empty.
 */
export function linesFromEditorSelection(
  sel: EditorSelectionLike
): { startLine: number; endLine: number } | null {
  const same =
    sel.start.line === sel.end.line && sel.start.character === sel.end.character;
  if (same) {
    return null;
  }
  let endLine0 = sel.end.line;
  if (
    sel.end.character === 0 &&
    (sel.end.line > sel.start.line ||
      (sel.end.line === sel.start.line && sel.start.character > 0))
  ) {
    endLine0 = sel.end.line - 1;
  }
  if (endLine0 < sel.start.line) {
    return null;
  }
  return { startLine: sel.start.line + 1, endLine: endLine0 + 1 };
}

/** Build `@path#start-end`. Lines are 1-based inclusive; swapped if reversed. */
export function formatFileRangeMention(
  relativePath: string,
  startLine: number,
  endLine: number
): string {
  const path = normalizeMentionPath(relativePath);
  const a = Math.max(1, Math.floor(startLine));
  const b = Math.max(1, Math.floor(endLine));
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `@${path}#${lo}-${hi}`;
}

export function normalizeMentionPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/g, '');
}

/**
 * Selection → composer token.
 * Empty selection and multi-cursor are rejected with a user-facing message.
 */
export function mentionFromSelection(
  input: SelectionRangeInput
): SelectionMentionResult {
  const count = input.selectionCount ?? 1;
  if (count > 1) {
    return {
      ok: false,
      message:
        'Multiple selections: keep a single range (multi-cursor is not supported for @file#range).',
    };
  }
  if (input.empty) {
    return {
      ok: false,
      message: 'No selection. Select lines in the editor, then try again.',
    };
  }
  const path = normalizeMentionPath(input.relativePath || '');
  if (!path) {
    return { ok: false, message: 'No file path for the current selection.' };
  }
  if (!Number.isFinite(input.startLine) || !Number.isFinite(input.endLine)) {
    return { ok: false, message: 'Selection has no line range.' };
  }
  const mention = formatFileRangeMention(path, input.startLine, input.endLine);
  const m = /#(\d+)-(\d+)$/.exec(mention);
  return {
    ok: true,
    mention,
    startLine: m ? Number(m[1]) : input.startLine,
    endLine: m ? Number(m[2]) : input.endLine,
  };
}

/** All `@path#start-end` mentions in a composer string (stable, non-overlapping). */
export function parseFileRangeMentions(text: string): FileRangeMention[] {
  if (!text) {
    return [];
  }
  const out: FileRangeMention[] = [];
  const re = new RegExp(MENTION_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const startLine = Number(m[2]);
    const endLine = Number(m[3]);
    if (!startLine || !endLine) {
      continue;
    }
    out.push({
      path: m[1],
      startLine: Math.min(startLine, endLine),
      endLine: Math.max(startLine, endLine),
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
    });
  }
  return out;
}

/**
 * Slice 1-based inclusive lines out of a file body.
 * Returns null when the range is outside the file.
 */
export function sliceLines(
  text: string,
  startLine: number,
  endLine: number
): string | null {
  if (!text && text !== '') {
    return null;
  }
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const lo = Math.max(1, Math.min(startLine, endLine));
  const hi = Math.max(startLine, endLine);
  if (lo > lines.length) {
    return null;
  }
  const slice = lines.slice(lo - 1, Math.min(hi, lines.length));
  return slice.join('\n');
}

/** Prompt text block that accompanies a range mention (mention + fenced body). */
export function rangeContextBlock(
  mention: string,
  body: string,
  truncated = false
): string {
  const note = truncated ? '\n/* …truncated… */' : '';
  return `${mention}\n\`\`\`\n${body}${note}\n\`\`\``;
}
