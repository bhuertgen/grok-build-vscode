/**
 * Line-range slicing for ACP `fs/read_text_file` (`line` is 1-based, `limit`
 * is a line count). Pure module (no vscode) — unit-tested.
 *
 * Slices on line-start offsets and never re-joins, so the original line
 * endings (CRLF, LF or mixed) are preserved byte for byte (#47). Range
 * semantics match the previous `split(/\r?\n/).slice().join()`:
 * - the terminator of the last returned line is dropped, unless the range
 *   reaches the end of the text (then the text's own trailing newline stays);
 * - `line` beyond EOF or `limit: 0` → empty string.
 */
export function sliceTextLines(text: string, line?: number | null, limit?: number | null): string {
  if (line == null && limit == null) {
    return text;
  }
  // Line i spans [starts[i], ends[i]) without its terminator.
  const starts: number[] = [0];
  const ends: number[] = [];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
    ends.push(i > 0 && text[i - 1] === '\r' ? i - 1 : i);
    starts.push(i + 1);
  }
  ends.push(text.length);
  const count = starts.length;
  const start = Math.max(0, Math.floor((line ?? 1) - 1));
  const end = limit != null ? start + Math.max(0, Math.floor(limit)) : count;
  if (start >= count || end <= start) {
    return '';
  }
  if (end >= count) {
    return text.slice(starts[start]);
  }
  return text.slice(starts[start], ends[end - 1]);
}
