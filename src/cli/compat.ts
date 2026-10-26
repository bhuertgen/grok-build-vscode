/**
 * CLI compatibility floors for the Grok Build hybrid ACP client.
 * Soft/hard floors target the official CLI 1.0.x era.
 * Pure module — unit-testable without vscode / live CLI.
 */
import { compareVersions, extractVersionToken } from './semver';

/** Below this → hard incompatibility (treat CLI as not ready). */
export const CLI_HARD_MIN = '1.0.0';

/**
 * Below this (but ≥ hard) → soft warning banner; extension still usable.
 * Raised independently when a newer 1.x patch becomes the recommended baseline.
 * Policy: the soft floor is the latest tested stable.
 * 1.0.70 (tested stable, 2026-10-23: first stable after 1.0.67; unit +
 * smoke + ACP probe green, no ACP breakage — agent flags and
 * initialize/session/new warm responses identical):
 * Earlier floor 1.0.67 (2026-10-22): `--permission-mode plan` really starts
 * in plan mode (1.0.65), stricter per-subcommand allowlist for
 * `--permission-mode auto` (1.0.64), folder trust for project
 * hooks/rules/skills/MCP with the top-level `--trust` flag,
 * `_x.ai/models/update` with per-model reasoning efforts.
 * Earlier floor 1.0.62: write approvals mark binary/unreadable files as
 * "unreadable" (1.0.54), hooks returning `continue:false` end the turn with
 * `cancellationCategory: "HookStopped"` (1.0.60).
 * Earlier floor 1.0.52: GROK_MEMORY env (old --no-memory flag rejected),
 * multi-select elicitation (1.0.51), `cancelled` tool status (1.0.50).
 */
export const CLI_SOFT_MIN = '1.0.70';

/** Newest CLI this release was tested with (shown in docs, not enforced). */
export const CLI_TESTED_WITH = '1.0.70';

export type CliCompatLevel =
  | 'ok'
  | 'missing'
  | 'too_old'
  | 'soft_warn'
  | 'unknown';

export interface CliCompatAssessment {
  level: CliCompatLevel;
  /** Parsed semver token when available */
  version?: string;
  /** Raw --version output (or configured path probe text) */
  rawVersion?: string;
  hardMin: string;
  softMin: string;
  /** User-facing short status for banners / status bar */
  message: string;
  /** false when missing or hard-incompatible */
  usable: boolean;
}

export interface AssessCliCompatInput {
  /** Detection succeeded (binary found and responded) */
  detected: boolean;
  /** Raw stdout/stderr from `grok --version` */
  rawVersion?: string;
  /** Optional detection error when not detected */
  error?: string;
  /** Test / override hard floor (default CLI_HARD_MIN) */
  hardMin?: string;
  /** Test / override soft floor (default CLI_SOFT_MIN) */
  softMin?: string;
}

/**
 * Assess installed CLI against soft/hard floors.
 * Does not spawn processes — call after detectGrokCli / with mocked version.
 */
export function assessCliCompat(input: AssessCliCompatInput): CliCompatAssessment {
  const hardMin = input.hardMin ?? CLI_HARD_MIN;
  const softMin = input.softMin ?? CLI_SOFT_MIN;

  if (!input.detected) {
    return {
      level: 'missing',
      hardMin,
      softMin,
      rawVersion: input.rawVersion,
      message:
        input.error?.trim() ||
        'Grok Build CLI was not found. Install from https://x.ai/cli or set grokBuild.cliPath.',
      usable: false,
    };
  }

  const raw = input.rawVersion?.trim() || undefined;
  const version = extractVersionToken(raw);

  if (!version) {
    return {
      level: 'unknown',
      hardMin,
      softMin,
      rawVersion: raw,
      message: `Grok CLI found, but version could not be parsed. Recommend ≥ ${softMin} (\`grok --version\`).`,
      usable: true,
    };
  }

  if (compareVersions(version, hardMin) < 0) {
    return {
      level: 'too_old',
      version,
      rawVersion: raw,
      hardMin,
      softMin,
      message: `Grok CLI ${version} is too old (need ≥ ${hardMin}). Run \`grok update\` or reinstall from https://x.ai/cli.`,
      usable: false,
    };
  }

  if (compareVersions(version, softMin) < 0) {
    return {
      level: 'soft_warn',
      version,
      rawVersion: raw,
      hardMin,
      softMin,
      message: `Grok CLI ${version} works, but ≥ ${softMin} is recommended for ACP compatibility.`,
      usable: true,
    };
  }

  return {
    level: 'ok',
    version,
    rawVersion: raw,
    hardMin,
    softMin,
    message: `Grok CLI ${version} OK (≥ ${softMin})`,
    usable: true,
  };
}

/** True when the webview should show a CLI status / compat banner. */
export function shouldShowCompatBanner(level: CliCompatLevel): boolean {
  return level === 'missing' || level === 'too_old' || level === 'soft_warn' || level === 'unknown';
}
