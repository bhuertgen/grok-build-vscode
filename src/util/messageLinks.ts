/**
 * Detect file paths and `#123` issue/PR refs in assistant text.
 * Pure (no vscode, no Node APIs) so the webview can bundle the same code.
 *
 * Heuristics (true positives vs common false positives):
 * - A relative path needs a slash and a file extension (`src/cli/compat.ts`,
 *   `./README.md`, `../docs/en/USER_GUIDE.md`). Optional `:line`, `:line:col`,
 *   or `:start-end`. Dotfiles (`src/.gitignore`) count.
 * - An absolute path (`/usr/local/bin/grok`, `C:\src\foo.ts`, `~/proj/a.ts`)
 *   may omit the extension when the last segment is a name, not a number.
 * - Bare words (`README.md`, `compat.ts`), package versions (`1.0.72`,
 *   `lodash@4.17.21`), mime types (`image/png`), and branch-like tokens
 *   (`feat/clickable-paths`) are not paths.
 * - URLs and markdown `[label](https://…)` spans are skipped so https links
 *   are not wrapped again. Fenced code blocks are skipped.
 * - `#123` is an issue/PR ref. Hex colors (`#fff`), entities (`&#123;`),
 *   headings (`## Title`), and `@file#12-34` ranges are not.
 * - Subagent / task ids are intentionally not detected.
 */

export interface PathLinkHit {
  kind: 'path';
  start: number;
  end: number;
  /** Slice of the source, including `:line` / `:line:col` when present. */
  text: string;
  /** Path only, as written (no location suffix). */
  path: string;
  /** 1-based. */
  line?: number;
  /** 1-based. */
  column?: number;
  /** 1-based inclusive end line for `path:start-end`. */
  endLine?: number;
}

export interface PrLinkHit {
  kind: 'pr';
  start: number;
  end: number;
  text: string;
  number: number;
}

export type MessageLinkHit = PathLinkHit | PrLinkHit;

const ISSUE_TEMPLATE_RE =
  /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/[A-Za-z0-9._~:/+-]*\{n\}$/;

/** True when a forge template is safe to turn into an https link. */
export function isSafeIssueTemplate(tpl: string): boolean {
  return ISSUE_TEMPLATE_RE.test(tpl);
}

const SEG = '[A-Za-z0-9_+@-]{1,64}';
const FILE = `${SEG}(?:\\.${SEG}){0,6}\\.[A-Za-z][A-Za-z0-9]{0,9}`;
const DOTFILE = '\\.[A-Za-z][A-Za-z0-9_-]{0,40}';
const FINAL = `(?:${FILE}|${DOTFILE})`;
const ROOT = '(?:~[\\\\/]|[A-Za-z]:[\\\\/]|\\\\\\\\|/(?!/))';
const PREFIX_ABS = `${ROOT}(?:${SEG}[\\\\/]){0,24}`;
const PREFIX_DOT = `(?:\\.{1,2}[\\\\/]){1,8}(?:${SEG}[\\\\/]){0,24}`;
const PREFIX_REL = `(?:${SEG}[\\\\/]){1,24}`;

function pathRegex(): RegExp {
  return new RegExp(
    `(?<![A-Za-z0-9._+/\\\\-])((?:${PREFIX_ABS}|${PREFIX_DOT}|${PREFIX_REL})${FINAL})`,
    'g'
  );
}

function bareAbsoluteRegex(): RegExp {
  return new RegExp(
    `(?<![A-Za-z0-9._+/\\\\-])(${ROOT}(?:${SEG}[\\\\/]){1,24}[A-Za-z][A-Za-z0-9_+@-]{0,64})`,
    'g'
  );
}

type Range = [number, number];

function maskRanges(text: string): Range[] {
  const ranges: Range[] = [];
  let fence = -1;
  for (let i = 0; i < text.length - 2; i++) {
    if (text[i] === '`' && text[i + 1] === '`' && text[i + 2] === '`') {
      if (fence < 0) {
        fence = i;
      } else {
        ranges.push([fence, i + 3]);
        fence = -1;
        i += 2;
      }
    }
  }
  if (fence >= 0) {
    ranges.push([fence, text.length]);
  }

  const patterns = [
    /\b(?:https?|file):\/\/[^\s<>)\]'"]+/gi,
    /\[[^\]]*\]\(\s*(?:https?|file):[^)\s]+\)/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      ranges.push([m.index, m.index + m[0].length]);
    }
  }
  return ranges;
}

function overlaps(ranges: Range[], start: number, end: number): boolean {
  return ranges.some(([a, b]) => start < b && end > a);
}

interface LocationSuffix {
  end: number;
  line?: number;
  column?: number;
  endLine?: number;
}

/** `:line`, `:line:col`, or `:start-end` immediately after a path. */
function takeLocation(text: string, end: number): LocationSuffix {
  const slice = text.slice(end);
  const m = /^:(\d{1,7})(?::(\d{1,6})|-(\d{1,7}))?(?![\d:])(?!\.\d)/.exec(slice);
  if (!m) {
    return { end };
  }
  const line = Number(m[1]);
  const column = m[2] != null ? Number(m[2]) : undefined;
  const endLine = m[3] != null ? Number(m[3]) : undefined;
  if (line < 1 || line > 1_000_000) {
    return { end };
  }
  if (column != null && (column < 1 || column > 100_000)) {
    return { end };
  }
  if (endLine != null && (endLine < 1 || endLine > 1_000_000)) {
    return { end };
  }
  return {
    end: end + m[0].length,
    line,
    column,
    endLine,
  };
}

function pathHit(
  text: string,
  start: number,
  pathEnd: number,
  masks: Range[]
): PathLinkHit | null {
  if (pathEnd - start > 300 || pathEnd <= start) {
    return null;
  }
  const loc = takeLocation(text, pathEnd);
  if (loc.end - start > 320) {
    return null;
  }
  if (overlaps(masks, start, loc.end)) {
    return null;
  }
  const path = text.slice(start, pathEnd);
  if (path.includes('://')) {
    return null;
  }
  const hit: PathLinkHit = {
    kind: 'path',
    start,
    end: loc.end,
    text: text.slice(start, loc.end),
    path,
  };
  if (loc.line != null) {
    hit.line = loc.line;
  }
  if (loc.column != null) {
    hit.column = loc.column;
  }
  if (loc.endLine != null) {
    hit.endLine = loc.endLine;
  }
  return hit;
}

const SEG_SP = '[A-Za-z0-9 _+@-]{1,80}';

/** Whole quoted token, spaces allowed in segments (`"src/my file.ts"`). */
function quotedPathBody(pathPart: string): boolean {
  if (!/[/\\]/.test(pathPart) || pathPart.length > 300) {
    return false;
  }
  if (pathPart.startsWith(' ') || pathPart.endsWith(' ') || pathPart.includes('//')) {
    return false;
  }
  const re = new RegExp(
    `^(?:${ROOT}(?:${SEG_SP}[\\\\/]){0,24}|(?:\\.{1,2}[\\\\/]){1,8}(?:${SEG_SP}[\\\\/]){0,24}|(?:${SEG_SP}[\\\\/]){1,24})(?:${SEG_SP}\\.[A-Za-z][A-Za-z0-9]{0,9}|${DOTFILE})$`
  );
  return re.test(pathPart);
}

function collectPaths(text: string, masks: Range[]): PathLinkHit[] {
  const hits: PathLinkHit[] = [];
  for (const re of [pathRegex(), bareAbsoluteRegex()]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index;
      const pathEnd = start + m[1].length;
      const hit = pathHit(text, start, pathEnd, masks);
      if (hit) {
        hits.push(hit);
      }
    }
  }

  const quoted = /(['"])([^'"\r\n]{1,300})\1/g;
  let q: RegExpExecArray | null;
  while ((q = quoted.exec(text))) {
    const inner = q[2];
    const innerStart = q.index + 1;
    const loc = /:\d{1,7}(?::\d{1,6}|-\d{1,7})?$/.exec(inner);
    const pathPart = loc ? inner.slice(0, inner.length - loc[0].length) : inner;
    if (!quotedPathBody(pathPart)) {
      continue;
    }
    const hit = pathHit(text, innerStart, innerStart + pathPart.length, masks);
    if (hit && hit.end === innerStart + inner.length) {
      hits.push(hit);
    }
  }
  return hits;
}

function collectPrs(text: string, masks: Range[]): PrLinkHit[] {
  const hits: PrLinkHit[] = [];
  const re = /(^|[^A-Za-z0-9_&#])#(\d{1,7})(?![\dA-Fa-f-])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index + m[1].length;
    const digits = m[2];
    const end = start + 1 + digits.length;
    const number = Number(digits);
    if (!number || number > 10_000_000) {
      continue;
    }
    if (overlaps(masks, start, end)) {
      continue;
    }
    hits.push({
      kind: 'pr',
      start,
      end,
      text: text.slice(start, end),
      number,
    });
  }
  return hits;
}

function dedupe(hits: MessageLinkHit[]): MessageLinkHit[] {
  const sorted = [...hits].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: MessageLinkHit[] = [];
  let coveredUntil = -1;
  for (const hit of sorted) {
    if (hit.start < coveredUntil) {
      continue;
    }
    if (hit.end <= hit.start) {
      continue;
    }
    out.push(hit);
    coveredUntil = hit.end;
  }
  return out;
}

/** Non-overlapping path and `#123` hits, in source order. */
export function findMessageLinks(text: string): MessageLinkHit[] {
  if (!text) {
    return [];
  }
  const masks = maskRanges(text);
  return dedupe([...collectPaths(text, masks), ...collectPrs(text, masks)]);
}
