/**
 * Map an ACP permission response to a UI decision (for resolving the inline card
 * regardless of which UI answered: webview card, native modal, timeout, turn end).
 * Pure module (no vscode) — unit-tested.
 */
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
  if (/reject|deny/i.test(o.optionId)) {
    return 'rejected';
  }
  return /allow/i.test(o.optionId) ? 'allowed' : 'cancelled';
}

export function permissionDecisionLabel(d: PermissionDecision, lang?: string): string {
  const de = typeof lang === 'string' && /^de\b/i.test(lang.trim());
  switch (d) {
    case 'allowed':
      return de ? 'Erlaubt' : 'Allowed';
    case 'allowed_always':
      return de ? 'Immer erlaubt' : 'Allowed always';
    case 'rejected':
      return de ? 'Abgelehnt' : 'Rejected';
    default:
      return de ? 'Abgebrochen' : 'Cancelled';
  }
}
