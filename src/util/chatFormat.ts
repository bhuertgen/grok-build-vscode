/**
 * Pure chat-formatting helpers (no vscode) — unit-tested.
 */

/** Remove trailing blank / rule-only lines that become residual “ruled paper” UI. */
export function stripTrailingDecorations(src: string): string {
  let text = src.replace(/\r\n/g, '\n');
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n');
  text = text.replace(
    /(?:\n[ \t]*(?:-{3,}|\*{3,}|_{3,}|[─━═_]{3,})[ \t]*)+\s*$/g,
    ''
  );
  text = text.replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
  return text;
}

export interface AttachmentRef {
  kind: string;
  label: string;
  path?: string;
  /** Pre-resolved relative path (optional; avoids vscode in tests) */
  relativePath?: string;
}

/**
 * Ensure the chat bubble shows @file names even if the user only typed
 * "lies die Datei" while chips held the real paths.
 */
export function formatUserMessageWithAttachments(
  text: string,
  attached: AttachmentRef[]
): string {
  if (!attached.length) {
    return text;
  }
  const mentions: string[] = [];
  for (const a of attached) {
    let ref = a.relativePath || a.label;
    if (!a.relativePath && a.path) {
      ref = a.path.replace(/\\/g, '/').split('/').slice(-2).join('/') || a.label;
      // Prefer basename if path is absolute-looking
      const base = a.path.replace(/\\/g, '/').split('/').pop();
      if (base && !a.relativePath) {
        ref = a.label || base;
      }
    }
    const mention = `@${ref}`;
    const already =
      text.includes(mention) ||
      text.includes(`@${a.label}`) ||
      (a.path != null && text.includes(a.path)) ||
      (a.relativePath != null && text.includes(`@${a.relativePath}`));
    if (!already) {
      mentions.push(mention);
    }
  }
  if (!mentions.length) {
    return text;
  }
  const head = mentions.join(' ');
  const body = text.trim();
  return body ? `${head}\n${body}` : head;
}

export interface TranscriptMessage {
  role: string;
  content?: string;
}

/** Compact transcript for cold-start agent context. */
export function buildHistorySeedTranscript(
  messages: TranscriptMessage[],
  maxChars = 14_000
): string {
  const lines: string[] = [
    '[Restored chat history from the VS Code UI — treat as prior project context. Do not re-answer old messages; continue from the current user request.]',
    '',
  ];
  let added = 0;
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'agent') {
      continue;
    }
    const body = String(m.content || '').trim();
    if (!body) {
      continue;
    }
    const who = m.role === 'user' ? 'User' : 'Grok';
    const clipped =
      body.length > 2_500 ? body.slice(0, 2_500) + '\n…[truncated]' : body;
    lines.push(`${who}:\n${clipped}`, '');
    added++;
  }
  if (added === 0) {
    return '';
  }
  let text = lines.join('\n').trim();
  if (text.length > maxChars) {
    text =
      text.slice(0, maxChars) +
      '\n\n…[older history truncated due to context limit]';
  }
  return text;
}

/**
 * Detect trailing @file query at cursor (Claude Code style).
 * Pure — shared contract with webview/main.js parseAtMention.
 */
export function parseAtMention(
  value: string,
  cursor?: number
): { query: string; start: number; end: number } | null {
  const pos = cursor ?? value.length;
  const before = value.slice(0, pos);
  const m = /(?:^|[\s])@([^\s@]*)$/.exec(before);
  if (!m) {
    return null;
  }
  const atIndexInBefore = before.lastIndexOf('@');
  if (atIndexInBefore < 0) {
    return null;
  }
  return {
    query: m[1] ?? '',
    start: atIndexInBefore,
    end: pos,
  };
}

/** Detect `/query` when the message starts with a slash command. */
export function parseSlashQuery(
  value: string
): { query: string; hasArgs: boolean; full: string } | null {
  const m = /^(?:\/)([^\s]*)(?:\s|$)/.exec(value);
  if (!m) {
    return null;
  }
  const hasArgs = /\s/.test(value.trim().slice(1));
  return {
    query: m[1].toLowerCase(),
    hasArgs,
    full: value,
  };
}
