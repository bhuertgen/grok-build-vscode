/**
 * Pure CLI arg builder for `grok [top-level flags…] agent [agent flags…] stdio`.
 * No vscode dependency — unit-tested.
 *
 * clap layout of the official CLI (verified with `grok --help` /
 * `grok agent --help` on 1.0.62 stable and 1.0.66 alpha):
 *   - `grok agent` only accepts -m/--model, --reasoning-effort, --always-approve,
 *     --leader/--no-leader, --debug/--debug-file, --agent-profile, --plugin-dir …
 *   - Session/policy flags (--permission-mode, --max-turns, …) exist ONLY on the
 *     top-level `grok` command. Placed after `agent` they fail with
 *     `error: unexpected argument '--permission-mode' found` and the agent
 *     process exits before ACP initialize (#37).
 */

/**
 * Flags that exist only as top-level `grok` options (not on `grok agent`).
 * They must appear BEFORE the `agent` subcommand.
 */
export const TOP_LEVEL_ONLY_FLAGS: readonly string[] = [
  '--permission-mode',
  '--max-turns',
  '--no-subagents',
  '--no-plan',
  '--disable-web-search',
  '--sandbox',
  '--tools',
  '--disallowed-tools',
  '--rules',
];

/** True if `flag` must be placed before `agent` (top-level-only option). */
export function isTopLevelOnlyFlag(flag: string): boolean {
  const name = flag.split('=')[0];
  return TOP_LEVEL_ONLY_FLAGS.includes(name);
}

export interface AgentArgOptions {
  /** Base args, default ['agent','stdio'] */
  baseArgs?: string[];
  model?: string;
  /** default true */
  noLeader?: boolean;
  reasoningEffort?: string;
  alwaysApprove?: boolean;
  /** Agent-level flags, inserted right after `agent` (before `stdio`). */
  extraFlags?: string[];
  /**
   * Top-level `grok` flags (e.g. `--permission-mode plan`), inserted BEFORE
   * `agent`. Pass flag/value pairs in order, e.g. `['--max-turns', '5']`.
   */
  topLevelFlags?: string[];
}

/** Top-level-only flags that take a value (`--flag <VALUE>`). */
const TOP_LEVEL_VALUE_FLAGS: readonly string[] = [
  '--permission-mode',
  '--max-turns',
  '--sandbox',
  '--tools',
  '--disallowed-tools',
  '--rules',
];

/** Add `flag [value]` groups from `src` to `dest`, skipping flags already present. */
function appendFlagGroups(
  src: string[],
  dest: string[],
  has: (flag: string) => boolean
): void {
  for (let i = 0; i < src.length; i++) {
    const f = src[i];
    if (!f) {
      continue;
    }
    const takesValue =
      !f.includes('=') && TOP_LEVEL_VALUE_FLAGS.includes(f) && i + 1 < src.length;
    if (f.startsWith('-') && has(f.split('=')[0])) {
      if (takesValue) {
        i++; // drop the value of a skipped duplicate
      }
      continue;
    }
    dest.push(f);
    if (takesValue) {
      dest.push(src[i + 1]);
      i++;
    }
  }
}

/** Settings subset that maps to CLI flags (pure — mirrors GrokBuildConfig). */
export interface AgentFlagConfig {
  cliPermissionMode?: string;
  alwaysApprove?: boolean;
  /** Extension UI permission mode ('allow-always' → --always-approve) */
  permissionMode?: string;
  maxTurns?: number | null;
  noSubagents?: boolean;
  noPlan?: boolean;
  disableWebSearch?: boolean;
  sandbox?: string;
  tools?: string;
  disallowedTools?: string;
  rules?: string;
  debug?: boolean;
  extraCliArgs?: string[];
  reasoningEffort?: string;
  defaultModel?: string;
}

/**
 * Map extension settings to the full CLI argv (after the executable).
 * Top-level-only flags go before `agent`, agent flags between `agent` and `stdio`:
 * `grok [--permission-mode plan --max-turns 5 …] agent [--no-leader -m … --debug] stdio`
 */
export function buildAgentArgsFromConfig(
  cfg: AgentFlagConfig,
  cliArgs: string[],
  model?: string
): string[] {
  const top: string[] = [];
  const agentLevel: string[] = [];

  if (!cfg.alwaysApprove) {
    if (cfg.cliPermissionMode) {
      if (cfg.cliPermissionMode === 'bypassPermissions') {
        agentLevel.push('--always-approve');
      } else {
        top.push('--permission-mode', cfg.cliPermissionMode);
      }
    } else if (cfg.permissionMode === 'allow-always') {
      agentLevel.push('--always-approve');
    }
  }
  if (cfg.maxTurns != null && cfg.maxTurns > 0) {
    top.push('--max-turns', String(cfg.maxTurns));
  }
  if (cfg.noSubagents) {
    top.push('--no-subagents');
  }
  if (cfg.noPlan) {
    top.push('--no-plan');
  }
  // Memory: no CLI flag (removed in CLI 1.0.51); mapped to GROK_MEMORY env in connect().
  if (cfg.disableWebSearch) {
    top.push('--disable-web-search');
  }
  if (cfg.sandbox?.trim()) {
    top.push('--sandbox', cfg.sandbox.trim());
  }
  if (cfg.tools?.trim()) {
    top.push('--tools', cfg.tools.trim());
  }
  if (cfg.disallowedTools?.trim()) {
    top.push('--disallowed-tools', cfg.disallowedTools.trim());
  }
  if (cfg.rules?.trim()) {
    top.push('--rules', cfg.rules.trim());
  }
  if (cfg.debug) {
    agentLevel.push('--debug'); // exists on both levels; agent-level as before
  }
  // Raw extra args stay agent-level (advanced; user controls placement).
  for (const e of cfg.extraCliArgs ?? []) {
    if (e) {
      agentLevel.push(e);
    }
  }

  return buildAgentArgv({
    baseArgs: cliArgs.length ? cliArgs : ['agent', 'stdio'],
    model: model ?? cfg.defaultModel,
    noLeader: true,
    reasoningEffort: cfg.reasoningEffort,
    alwaysApprove: cfg.alwaysApprove,
    extraFlags: agentLevel,
    topLevelFlags: top,
  });
}

/**
 * Build argv after the executable name, e.g.
 * `['--permission-mode', 'plan', 'agent', '--no-leader', '-m', 'grok-4.5', 'stdio']`
 */
export function buildAgentArgv(options: AgentArgOptions = {}): string[] {
  let args = options.baseArgs?.length
    ? [...options.baseArgs]
    : ['agent', 'stdio'];
  if (!args.includes('agent')) {
    args = ['agent', ...args];
  }
  if (!args.includes('stdio')) {
    args.push('stdio');
  }

  const flags: string[] = [];
  const topFlags: string[] = [];
  const has = (flag: string) =>
    args.some((a) => a === flag || a.startsWith(`${flag}=`)) ||
    flags.includes(flag) ||
    topFlags.includes(flag);

  const noLeader = options.noLeader !== false;
  if (noLeader && !has('--leader') && !has('--no-leader')) {
    flags.push('--no-leader');
  }

  const m = options.model?.trim();
  if (m && !has('-m') && !has('--model')) {
    flags.push('-m', m);
  }

  if (
    options.reasoningEffort?.trim() &&
    !has('--reasoning-effort') &&
    !has('--effort')
  ) {
    flags.push('--reasoning-effort', options.reasoningEffort.trim());
  }

  if (options.alwaysApprove && !has('--always-approve')) {
    flags.push('--always-approve');
  }

  for (const f of options.extraFlags ?? []) {
    if (f && !has(f)) {
      flags.push(f);
    }
  }

  appendFlagGroups(options.topLevelFlags ?? [], topFlags, has);

  // Agent-level flags belong on `agent`, not on the `stdio` subcommand
  const agentIdx = args.findIndex((a) => a === 'agent');
  const insertAt = agentIdx >= 0 ? agentIdx + 1 : 0;
  args.splice(insertAt, 0, ...flags);
  // Top-level-only flags go before the `agent` subcommand (#37)
  const agentPos = args.findIndex((a) => a === 'agent');
  args.splice(agentPos >= 0 ? agentPos : 0, 0, ...topFlags);
  return args;
}

/** True if -m / --model appears before `stdio` (correct clap layout). */
export function modelFlagBeforeStdio(args: string[]): boolean {
  const stdioIdx = args.indexOf('stdio');
  const mIdx = args.findIndex((a) => a === '-m' || a === '--model');
  if (mIdx < 0) {
    return true; // no model flag
  }
  if (stdioIdx < 0) {
    return false;
  }
  return mIdx < stdioIdx;
}

/**
 * True if every top-level-only flag in `args` appears before `agent`
 * (i.e. the CLI will not reject it with "unexpected argument").
 */
export function topLevelFlagsBeforeAgent(args: string[]): boolean {
  const agentIdx = args.indexOf('agent');
  return args.every((a, i) => !isTopLevelOnlyFlag(a) || (agentIdx >= 0 && i < agentIdx));
}
