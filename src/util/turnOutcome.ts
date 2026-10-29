/**
 * Classify how an ACP prompt turn ended and build the chat info line.
 * Pure module (no vscode) — unit-tested.
 *
 * Grok CLI ≥ 1.0.60: a PreToolUse/PostToolUse(/Failure) hook answering
 * `{"continue": false, "stopReason": "…"}` ends the turn. Verified live against
 * CLI 1.0.62 — the `session/prompt` response is
 *   { stopReason: "cancelled",
 *     _meta: { cancellationCategory: "HookStopped",
 *              cancellationContext: { reason: "…", hook_name: "project/stop:pre_tool_use[0].hooks[0]" } } }
 * The ACP stopReason alone cannot tell this apart from a user cancel.
 *
 * CLI alpha ≥ 1.0.71 `failClosed: true`, probed live on 1.0.73 (15470685cfa0):
 * - A UserPromptSubmit hook that times out or crashes ends the turn with
 *   stopReason "cancelled" and cancellationCategory "HookDenied" (not
 *   HookStopped). cancellationContext still carries reason + hook_name, e.g.
 *   reason "fail-closed hook '<name>' failed: timed out after 1000ms".
 * - A PreToolUse hook that times out or crashes does not end the turn.
 *   session/prompt returns stopReason "end_turn" with no cancellationCategory.
 *   The denial is a tool_call_update { status: "failed", content text
 *   "Hook denied: …" }, which the tool row already shows.
 */

import { isGermanLocale } from './locale';

export type TurnEndKind =
  | 'end_turn'
  | 'cancelled'
  | 'hook_stopped'
  /** failClosed UserPromptSubmit: hook timed out or crashed (CLI alpha ≥ 1.0.71). */
  | 'hook_denied'
  | 'refusal'
  | 'max_tokens'
  | 'max_turn_requests'
  | 'other';

export interface TurnOutcome {
  kind: TurnEndKind;
  stopReason?: string;
  /** Hook identifier as sent by the CLI (e.g. `project/stop:pre_tool_use[0].hooks[0]`). */
  hookName?: string;
  /** Hook `stopReason` text. */
  reason?: string;
}

export interface PromptResultLike {
  stopReason?: string;
  _meta?: Record<string, unknown> | null;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Normalise e.g. `HookStopped`, `hook_stopped`, `hook-stopped` → `hookstopped`. */
function normCategory(v: unknown): string {
  return typeof v === 'string' ? v.replace(/[^a-z]/gi, '').toLowerCase() : '';
}

function hookKind(category: string): 'hook_stopped' | 'hook_denied' | undefined {
  if (category === 'hookstopped') {
    return 'hook_stopped';
  }
  if (category === 'hookdenied') {
    return 'hook_denied';
  }
  return undefined;
}

export function classifyTurnEnd(result: PromptResultLike | undefined | null): TurnOutcome {
  const stopReason = str(result?.stopReason);
  const meta = (result?._meta ?? {}) as Record<string, unknown>;
  const category = normCategory(meta.cancellationCategory ?? meta['x.ai/cancellationCategory']);
  const kind = hookKind(category);
  if (kind) {
    const ctx = (meta.cancellationContext ?? {}) as Record<string, unknown>;
    return {
      kind,
      stopReason,
      hookName: str(ctx.hook_name) ?? str(ctx.hookName),
      reason: str(ctx.reason) ?? str(ctx.stopReason),
    };
  }
  switch (stopReason) {
    case 'end_turn':
    case 'cancelled':
    case 'refusal':
    case 'max_tokens':
    case 'max_turn_requests':
      return { kind: stopReason, stopReason };
    default:
      return { kind: stopReason ? 'other' : 'end_turn', stopReason };
  }
}

/** Shorten the CLI hook id `project/stop:pre_tool_use[0].hooks[0]` → `project/stop`. */
export function shortHookName(name: string | undefined): string | undefined {
  if (!name) {
    return undefined;
  }
  const short = name.split(':')[0].trim();
  return short || name;
}

// Re-exported for existing callers; the implementation lives in ./locale (#48).
export { isGermanLocale };

/** Info line for a hook-stopped or fail-closed turn (markdown, italic). */
export function formatHookStopNotice(outcome: TurnOutcome, lang?: string): string {
  const de = isGermanLocale(lang);
  const hook = shortHookName(outcome.hookName);
  let text =
    outcome.kind === 'hook_denied'
      ? de
        ? 'Prompt blockiert, weil ein Hook fehlgeschlagen ist'
        : 'Prompt blocked because a hook failed'
      : de
        ? 'Turn durch Hook beendet'
        : 'Turn stopped by hook';
  if (hook) {
    text += ` (\`${hook}\`)`;
  }
  if (outcome.reason) {
    text += `: ${outcome.reason.replace(/\s+/g, ' ')}`;
  }
  return `ℹ️ _${text}_`;
}

/**
 * System line to append after the turn, or undefined for none.
 * `agentSpoke` = agent produced visible text in this turn.
 * Keeps the previous behaviour for user cancel / refusal (only when silent).
 */
export function turnEndNotice(
  outcome: TurnOutcome,
  agentSpoke: boolean,
  lang?: string
): string | undefined {
  switch (outcome.kind) {
    case 'hook_stopped':
    case 'hook_denied':
      return formatHookStopNotice(outcome, lang);
    case 'cancelled':
      return agentSpoke ? undefined : '_(cancelled)_';
    case 'refusal':
      return agentSpoke ? undefined : '_(agent refused)_';
    default:
      return undefined;
  }
}
