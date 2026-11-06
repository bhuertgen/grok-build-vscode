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
 * - A path with spaces is one hit, not the piece before the first space
 *   (CLI 1.0.74). In prose the path must end with a file extension so the
 *   span stops before the next word (`src/my file.ts` in a sentence).
 *   Quotes or inline code hold an extensionless absolute path too
 *   (`` `~/Library/Application Support` ``). Relative spaced paths still
 *   need an extension; `~/`, `/`, and drive paths may omit one inside
 *   those delimiters.
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
    /\[[^\]]*\]\(\s*(?:https?|file):[^)\s]+\)/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      ranges.push([m.index, m.index + m[0].length]);
    }
  }
  ranges.push(...maskBareUrls(text));
  return ranges;
}

/**
 * Bare http(s)/file URLs. A space ends the URL unless the next token still
 * looks like a path (`https://example.com/my docs/file.ts`), so that tail is
 * not detected as a file.
 */
function maskBareUrls(text: string): Range[] {
  const ranges: Range[] = [];
  const re = /\b(?:https?|file):\/\/[^\s<>)\]'"]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let end = m.index + m[0].length;
    for (;;) {
      const rest = text.slice(end);
      const cont = /^[ \t]+([^\s<>)\]'"]+)/.exec(rest);
      if (!cont || !/[\\/.]/.test(cont[1])) {
        break;
      }
      end += cont[0].length;
    }
    ranges.push([m.index, end]);
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

/** One filename word. Spaces join words; dots stay extension separators. */
const WORD = "[A-Za-z0-9_+@()'&,]+";
const SPACED = `${WORD}(?: +${WORD})*`;
const SPACED_FILE = `(?:${SPACED}(?:\\.${WORD}){0,6}\\.[A-Za-z][A-Za-z0-9]{0,9}|${DOTFILE})`;

const REL_SPACED = new RegExp(
  `^(?:(?:\\.{1,2}[\\\\/]){1,8}(?:${SPACED}[\\\\/]){0,24}|(?:${SPACED}[\\\\/]){1,24})${SPACED_FILE}$`
);
const ABS_SPACED = new RegExp(
  `^${ROOT}(?:${SPACED}[\\\\/]){0,24}(?:${SPACED_FILE}|${SPACED})$`
);

/**
 * Whole delimited token that contains a space (`"src/my file.ts"`,
 * `` `~/Library/Application Support/foo.txt` ``).
 * Non-spaced paths are left to the token scanner. Relative paths need an
 * extension so `feat/clickable paths` and `src/my folder` stay plain.
 * Absolute, `~/`, and drive paths may be extensionless, matching
 * `/usr/local/bin/grok`, but a final all-digit segment (`/my dir/123`) does not.
 */
function spacedDelimitedPath(pathPart: string): boolean {
  if (!pathPart.includes(' ') || pathPart.length > 300 || pathPart.includes('://')) {
    return false;
  }
  if (pathPart.startsWith(' ') || pathPart.endsWith(' ') || pathPart.includes('//')) {
    return false;
  }
  if (REL_SPACED.test(pathPart)) {
    return true;
  }
  if (!ABS_SPACED.test(pathPart)) {
    return false;
  }
  const finalSeg = pathPart.split(/[\\/]/).pop() ?? '';
  return !/^\d+$/.test(finalSeg);
}

const WORD_CHAR = /[A-Za-z0-9_+@()&,-]/;

function atPathBoundary(text: string, i: number): boolean {
  if (i <= 0) {
    return true;
  }
  return !/[A-Za-z0-9._+/\\-]/.test(text[i - 1]);
}

function readWord(text: string, i: number, limit: number): number {
  if (i >= limit || !WORD_CHAR.test(text[i])) {
    return -1;
  }
  let j = i + 1;
  while (j < limit && WORD_CHAR.test(text[j])) {
    j++;
  }
  return j;
}

/** Extension `[A-Za-z][A-Za-z0-9]{0,9}`. Fails when more alphanumerics remain. */
function readExt(text: string, i: number, limit: number): number {
  if (i >= limit || !/[A-Za-z]/.test(text[i])) {
    return -1;
  }
  let j = i + 1;
  let n = 1;
  while (j < limit && n < 10 && /[A-Za-z0-9]/.test(text[j])) {
    j++;
    n++;
  }
  if (j < limit && /[A-Za-z0-9]/.test(text[j])) {
    return -1;
  }
  return j;
}

/**
 * Directory segment. Returns the index of the slash that closes it, or -1.
 * At most one extra word, and only when that word sits against the slash
 * (`Application Support/`, `my docs/`). A longer run of words is a sentence.
 * The first segment of an unanchored relative path does not allow spaces,
 * so "See src/file.ts" does not swallow "See".
 */
function readDirSegment(
  text: string,
  i: number,
  limit: number,
  allowSpaces: boolean
): number {
  const start = readWord(text, i, limit);
  if (start < 0) {
    return -1;
  }
  if (start < limit && (text[start] === '/' || text[start] === '\\')) {
    return start;
  }
  if (!allowSpaces || text[start] !== ' ') {
    return -1;
  }
  let s = start;
  while (s < limit && text[s] === ' ') {
    s++;
  }
  const w = readWord(text, s, limit);
  if (w < 0) {
    return -1;
  }
  if (w < limit && (text[w] === '/' || text[w] === '\\')) {
    return w;
  }
  return -1;
}

/**
 * Final component with an extension (`my file.ts`, `index.d.ts`, `.gitignore`).
 * At most one space, and the second word must sit against the dot
 * (`my file.ts`). Words after the extension are the rest of the sentence.
 */
function readFinal(text: string, i: number, limit: number): number {
  if (text[i] === '.' && i + 1 < limit && /[A-Za-z]/.test(text[i + 1])) {
    let j = i + 2;
    let n = 1;
    while (j < limit && n < 40 && /[A-Za-z0-9_-]/.test(text[j])) {
      j++;
      n++;
    }
    if (j < limit && /[A-Za-z0-9_-]/.test(text[j])) {
      return -1;
    }
    return j;
  }
  let j = readWord(text, i, limit);
  if (j < 0) {
    return -1;
  }
  if (j < limit && text[j] === ' ') {
    let s = j;
    while (s < limit && text[s] === ' ') {
      s++;
    }
    const w = readWord(text, s, limit);
    if (w > 0 && text[w] === '.') {
      j = w;
    }
  }
  let lastGood = -1;
  while (j < limit && text[j] === '.') {
    const ext = readExt(text, j + 1, limit);
    if (ext < 0) {
      break;
    }
    j = ext;
    lastGood = j;
  }
  return lastGood;
}

/**
 * Path that contains a space and ends with a file extension.
 * Linear in the candidate (capped at 300). Returns the index after the path,
 * before any `:line` suffix.
 */
function trySpacedPath(text: string, i: number): number | null {
  const limit = Math.min(text.length, i + 300);
  let j = i;
  let anchored = false;
  if (text.startsWith('~/', i) || text.startsWith('~\\', i)) {
    j = i + 2;
    anchored = true;
  } else if (text.startsWith('\\\\', i)) {
    j = i + 2;
    anchored = true;
  } else if (/^[A-Za-z]:[\\/]/.test(text.slice(i, i + 3))) {
    j = i + 3;
    anchored = true;
  } else if (text[i] === '/' && text[i + 1] !== '/') {
    j = i + 1;
    anchored = true;
  } else {
    let guard = 0;
    while (
      guard++ < 8 &&
      j < limit &&
      (text.startsWith('./', j) ||
        text.startsWith('.\\', j) ||
        text.startsWith('../', j) ||
        text.startsWith('..\\', j))
    ) {
      j += text.startsWith('..', j) ? 3 : 2;
      anchored = true;
    }
  }
  let segs = 0;
  let first = !anchored;
  while (segs < 24) {
    const slash = readDirSegment(text, j, limit, anchored || !first);
    if (slash < 0) {
      break;
    }
    j = slash + 1;
    segs++;
    first = false;
  }
  const fileEnd = readFinal(text, j, limit);
  if (fileEnd < 0) {
    return null;
  }
  const body = text.slice(i, fileEnd);
  if (!body.includes(' ') || !/[\\/]/.test(body) || body.includes('//')) {
    return null;
  }
  return fileEnd;
}

function collectSpacedPaths(text: string, masks: Range[]): PathLinkHit[] {
  const hits: PathLinkHit[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!/[.~/\\A-Za-z]/.test(c) || !atPathBoundary(text, i)) {
      continue;
    }
    const pathEnd = trySpacedPath(text, i);
    if (pathEnd == null) {
      continue;
    }
    const hit = pathHit(text, i, pathEnd, masks);
    if (!hit) {
      continue;
    }
    hits.push(hit);
    i = hit.end - 1;
  }
  return hits;
}

function collectPaths(text: string, masks: Range[]): PathLinkHit[] {
  const hits: PathLinkHit[] = [];
  hits.push(...collectSpacedPaths(text, masks));
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

  // Quotes and inline code are the boundary for a path that contains spaces
  // (CLI 1.0.74 links the whole backtick span, not the token before the space).
  const delimited = [/(['"])([^'"\r\n]{1,300})\1/g, /`([^`\r\n]{1,300})`/g];
  for (const re of delimited) {
    let q: RegExpExecArray | null;
    while ((q = re.exec(text))) {
      const rawInner = q[q.length - 1];
      const lead = rawInner.length - rawInner.trimStart().length;
      const inner = rawInner.trim();
      if (!inner) {
        continue;
      }
      const innerStart = q.index + (q[0].length - rawInner.length) / 2 + lead;
      const loc = /:\d{1,7}(?::\d{1,6}|-\d{1,7})?$/.exec(inner);
      const pathPart = loc ? inner.slice(0, inner.length - loc[0].length) : inner;
      if (!spacedDelimitedPath(pathPart)) {
        continue;
      }
      const hit = pathHit(text, innerStart, innerStart + pathPart.length, masks);
      if (hit && hit.end === innerStart + inner.length) {
        hits.push(hit);
      }
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
