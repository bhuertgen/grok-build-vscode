/**
 * Map an ACP permission response to a UI decision (for resolving the inline card
 * regardless of which UI answered: webview card, native modal, timeout, turn end).
 * Pure module (no vscode) — unit-tested.
 */
import { localize, type LocalizedText } from './locale';

export type PermissionDecision = 'allowed' | 'allowed_always' | 'rejected' | 'cancelled';

interface OptionLike {
  optionId: string;
  kind?: string;
}
interface ResponseLike {
  outcome?: { outcome?: string; optionId?: string } | null;
}

export function permissionDecision(
  response: ResponseLike | undefined | null,
  options: OptionLike[] | undefined | null
): PermissionDecision {
  const o = response?.outcome;
  if (!o || o.outcome !== 'selected' || !o.optionId) {
    return 'cancelled';
  }
  const opt = (options ?? []).find((x) => x.optionId === o.optionId);
  const kind = opt?.kind ?? '';
  if (kind === 'allow_always') {
    return 'allowed_always';
  }
  if (kind === 'allow_once') {
    return 'allowed';
  }
  if (kind.startsWith('reject')) {
    return 'rejected';
  }
  // Unknown option kind: infer from id
  if (/reject|deny|disallow|dont[-_ ]?allow|don't[-_ ]?allow|not[-_ ]allow/i.test(o.optionId)) {
    return 'rejected';
  }
  return /allow/i.test(o.optionId) ? 'allowed' : 'cancelled';
}

const DECISION_LABELS: Record<PermissionDecision, LocalizedText> = {
  allowed: { en: 'Allowed', de: 'Erlaubt' },
  allowed_always: { en: 'Allowed always', de: 'Immer erlaubt' },
  rejected: { en: 'Rejected', de: 'Abgelehnt' },
  cancelled: { en: 'Cancelled', de: 'Abgebrochen' },
};

export function permissionDecisionLabel(d: PermissionDecision, lang?: string): string {
  return localize(DECISION_LABELS[d] ?? DECISION_LABELS.cancelled, lang);
}

/**
 * Option for a plain "Allow" (once). Prefers `allow_once`; falls back to
 * `allow_always` only when the agent offers no one-shot option.
 * (CLI 1.0.62 lists `allow-edits-session` (allow_always) FIRST, so a naive
 * `find(allow_once || allow_always)` silently granted session-wide approval.)
 */
export function pickAllowOnceOption<T extends OptionLike>(options: T[] | undefined | null): T | undefined {
  const list = options ?? [];
  return list.find((o) => o.kind === 'allow_once') ?? list.find((o) => o.kind === 'allow_always');
}

/** Option for "Allow always"; falls back to allow_once. */
export function pickAllowAlwaysOption<T extends OptionLike>(options: T[] | undefined | null): T | undefined {
  const list = options ?? [];
  return list.find((o) => o.kind === 'allow_always') ?? list.find((o) => o.kind === 'allow_once');
}

/** Option for "Reject" (once preferred). */
export function pickRejectOption<T extends OptionLike>(options: T[] | undefined | null): T | undefined {
  const list = options ?? [];
  return list.find((o) => o.kind === 'reject_once') ?? list.find((o) => o.kind === 'reject_always');
}

export type UiPermissionMode = 'ask' | 'allow-once' | 'allow-session' | 'allow-always';

/**
 * Option the extension answers automatically for `grokBuild.permissionMode`
 * (#44), or undefined → ask the user. Matches on ACP `kind` only, never on
 * the option name (a "Disallow" / "Don't allow" reject option is never an
 * allow), and never depends on option order.
 *
 * - `allow-always` / global allow-always → `allow_always` (fallback
 *   `allow_once`); the CLI also runs with `--always-approve`.
 * - `allow-session` → `allow_once` (fallback `allow_always` only when no
 *   one-shot option exists). The extension itself keeps answering for the
 *   rest of the VS Code session, so no CLI-side grant outlives a switch back
 *   to `ask`.
 * - `allow-once` → `allow_once` only; without one, the user is asked.
 * - A tool the user approved with "Allow always" earlier in this session
 *   (`sessionKeyAllowed`) → `pickAllowOnceOption()`.
 */
export function pickAutoAllowOption<T extends OptionLike>(
  options: T[] | undefined | null,
  ctx: { mode: UiPermissionMode | string; globalAllowAlways?: boolean; sessionKeyAllowed?: boolean }
): T | undefined {
  const list = options ?? [];
  if (ctx.globalAllowAlways || ctx.mode === 'allow-always') {
    const o = pickAllowAlwaysOption(list);
    if (o) {
      return o;
    }
  }
  if (ctx.mode === 'allow-session') {
    const o = pickAllowOnceOption(list);
    if (o) {
      return o;
    }
  }
  if (ctx.mode === 'allow-once') {
    const o = list.find((x) => x.kind === 'allow_once');
    if (o) {
      return o;
    }
  }
  if (ctx.sessionKeyAllowed) {
    return pickAllowOnceOption(list);
  }
  return undefined;
}
