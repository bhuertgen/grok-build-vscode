/**
 * Restore / start notices in the chat transcript (#52). Pure — unit-tested.
 *
 * "Session resumed", "Local history loaded" and the plan-mode hint are pushed
 * as system lines when a stored chat is restored. They are persisted with the
 * transcript, so every reload used to add another copy. `pushNotice` drops
 * notices of the same kind that trail the conversation (after the last
 * non-system message) before appending, so a chat ends with at most one of
 * each — also for transcripts that already contain stacked copies.
 */

export type NoticeKind = 'session-resumed' | 'local-history' | 'plan-hint' | 'folder-trust';

export interface NoticeMessageLike {
  role: string;
  content: string;
}

const PATTERNS: Array<[NoticeKind, RegExp]> = [
  ['session-resumed', /^\*\*Session resumed\*\*/],
  ['local-history', /^\*\*Local history loaded\*\*/],
  ['plan-hint', /^`grokBuild\.cliPermissionMode` is `plan`, but Grok CLI .* starts in the default mode\./],
  ['folder-trust', /^\*\*Folder trusted for Grok\*\*/],
];

/** Kind of a notice line, or undefined for any other content. */
export function noticeKind(content: string | undefined): NoticeKind | undefined {
  if (typeof content !== 'string') {
    return undefined;
  }
  for (const [kind, re] of PATTERNS) {
    if (re.test(content)) {
      return kind;
    }
  }
  return undefined;
}

/**
 * Append `msg` to `messages` (in place). If `msg` is a known notice, first
 * remove trailing system messages of the same kind. Returns `messages`.
 */
export function pushNotice<T extends NoticeMessageLike>(messages: T[], msg: T): T[] {
  const kind = msg.role === 'system' ? noticeKind(msg.content) : undefined;
  if (kind) {
    let lastConversation = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== 'system') {
        lastConversation = i;
        break;
      }
    }
    for (let i = messages.length - 1; i > lastConversation; i--) {
      const m = messages[i];
      if (m.role === 'system' && noticeKind(m.content) === kind) {
        messages.splice(i, 1);
      }
    }
  }
  messages.push(msg);
  return messages;
}
