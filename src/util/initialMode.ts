/**
 * Initial UI mode at session start (#38).
 * Pure module — no vscode dependency, unit-tested.
 *
 * Since Grok CLI 1.0.65, `grok --permission-mode plan agent stdio` really
 * starts the agent in plan mode (older CLIs accepted the flag but started in
 * the default mode). Grok's `session/new` does not return ACP `modes`, so the
 * extension derives the starting UI mode from the setting + CLI version.
 * A later `current_mode_update` from the agent still wins.
 */
import { compareVersions, extractVersionToken } from '../cli/semver';

/** First CLI version where `--permission-mode plan` starts in plan mode. */
export const PLAN_PERMISSION_MODE_MIN = '1.0.65';

export interface InitialModeInput {
  /** Mode explicitly requested by the caller (e.g. /plan, restart). */
  requestedMode?: string;
  /** grokBuild.defaultMode */
  defaultMode: string;
  /** grokBuild.cliPermissionMode */
  cliPermissionMode?: string;
  /** grokBuild.alwaysApprove — suppresses --permission-mode entirely */
  alwaysApprove?: boolean;
  /** CLI version reported by ACP initialize (`_meta.agentVersion`), if any */
  agentVersion?: string;
}

export type InitialModeReason =
  /** No plan permission mode configured → requested/default mode */
  | 'setting'
  /** cliPermissionMode=plan on a CLI that starts in plan mode */
  | 'cli_plan'
  /** cliPermissionMode=plan, but CLI is older than PLAN_PERMISSION_MODE_MIN */
  | 'cli_too_old';

export interface InitialModeResult {
  mode: string;
  reason: InitialModeReason;
  /** Parsed CLI version, when known */
  version?: string;
}

/** True when this CLI version starts in plan mode with `--permission-mode plan`. */
export function cliStartsInPlanMode(agentVersion?: string): boolean | undefined {
  const v = extractVersionToken(agentVersion);
  if (!v) {
    return undefined;
  }
  return compareVersions(v, PLAN_PERMISSION_MODE_MIN) >= 0;
}

export function resolveInitialMode(input: InitialModeInput): InitialModeResult {
  const base = input.requestedMode || input.defaultMode || 'execute';
  const version = extractVersionToken(input.agentVersion);
  if (input.cliPermissionMode !== 'plan' || input.alwaysApprove) {
    return { mode: base, reason: 'setting', version };
  }
  const starts = cliStartsInPlanMode(version);
  if (starts === false) {
    return { mode: base, reason: 'cli_too_old', version };
  }
  // Known ≥ 1.0.65, or version unknown (newer builds report it; assume the
  // user's explicit plan setting is honoured).
  return { mode: 'plan', reason: 'cli_plan', version };
}

/** One-line chat hint for an old CLI that ignores plan at start. */
export function planModeTooOldHint(version?: string): string {
  return (
    `\`grokBuild.cliPermissionMode\` is \`plan\`, but Grok CLI ${version ?? '(unknown)'} ` +
    `starts in the default mode. Plan mode at start needs CLI ≥ ${PLAN_PERMISSION_MODE_MIN} — run \`grok update\`.`
  );
}
