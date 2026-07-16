/**
 * Pure CLI arg builder for `grok agent [flags…] stdio`.
 * No vscode dependency — unit-tested.
 */

export interface AgentArgOptions {
  /** Base args, default ['agent','stdio'] */
  baseArgs?: string[];
  model?: string;
  /** default true */
  noLeader?: boolean;
  reasoningEffort?: string;
  alwaysApprove?: boolean;
  extraFlags?: string[];
}

/**
 * Build argv after the executable name, e.g.
 * `['agent', '--no-leader', '-m', 'grok-4.5', 'stdio']`
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
  const has = (flag: string) => args.includes(flag) || flags.includes(flag);

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

  // Flags belong on `agent`, not on the `stdio` subcommand
  const agentIdx = args.findIndex((a) => a === 'agent');
  const insertAt = agentIdx >= 0 ? agentIdx + 1 : 0;
  args.splice(insertAt, 0, ...flags);
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
