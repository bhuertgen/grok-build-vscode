/**
 * Permission-rule warnings from Grok CLI alpha ≥ 1.0.75 (#31, probe A).
 *
 * A trusted folder with broken project rules reports them on the
 * `session/new` and `session/load` result, not as a session update:
 * `_meta["x.ai/permissionRuleWarnings"]` is a string array, one entry per
 * rule. The key is omitted when there is nothing to report (clean config,
 * untrusted folder, stable 1.0.70).
 *
 * Pure — unit-tested. The chat shows the strings verbatim as one system
 * notice (`pushNotice`, kind `permission-rules`), not as an agent message.
 */

export const PERMISSION_RULE_WARNINGS_KEY = 'x.ai/permissionRuleWarnings';

/**
 * First line of the chat notice. `noticeKind` / `pushNotice` recognise the
 * kind from this prefix so a later load replaces the trailing copy (#52).
 */
export const PERMISSION_RULES_NOTICE_RE = /^\*\*Permission rule warnings?\*\*/;

/**
 * String entries from `result._meta`, in order, each distinct string once.
 * Missing key, a non-object meta, or a value that is not an array → `[]`.
 * Non-strings and blank entries are dropped.
 */
export function permissionRuleWarningsFromMeta(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return [];
  }
  const raw = (meta as Record<string, unknown>)[PERMISSION_RULE_WARNINGS_KEY];
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string' || item.trim() === '') {
      continue;
    }
    if (seen.has(item)) {
      continue;
    }
    seen.add(item);
    out.push(item);
  }
  return out;
}

/** One system-notice body, or `undefined` when there is nothing to show. */
export function formatPermissionRuleNotice(warnings: readonly string[]): string | undefined {
  if (warnings.length === 0) {
    return undefined;
  }
  const title =
    warnings.length === 1 ? '**Permission rule warning**' : '**Permission rule warnings**';
  return `${title}\n${warnings.join('\n')}`;
}

/** Notice body for a `session/new` or `session/load` result `_meta`, if any. */
export function permissionRuleNoticeFromMeta(meta: unknown): string | undefined {
  return formatPermissionRuleNotice(permissionRuleWarningsFromMeta(meta));
}
