import * as vscode from 'vscode';
import type { AgentMode } from '../acp/types';

export type CliPermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'auto'
  | 'dontAsk'
  | 'bypassPermissions'
  | 'plan'
  | '';

export interface GrokBuildConfig {
  cliPath: string;
  cliArgs: string[];
  /** editor = middle editor area; sidebar = left activity bar */
  openLocation: 'editor' | 'sidebar';
  defaultMode: AgentMode;
  defaultModel: string;
  /** CLI --reasoning-effort */
  reasoningEffort: string;
  /** CLI --permission-mode (agent behaviour) */
  cliPermissionMode: CliPermissionMode;
  /** CLI --always-approve */
  alwaysApprove: boolean;
  /** CLI --max-turns */
  maxTurns: number | null;
  /** CLI --no-subagents */
  noSubagents: boolean;
  /** CLI --no-plan */
  noPlan: boolean;
  /** CLI --no-memory */
  noMemory: boolean;
  /** CLI --experimental-memory */
  experimentalMemory: boolean;
  /** CLI --disable-web-search */
  disableWebSearch: boolean;
  /** CLI --sandbox */
  sandbox: string;
  /** CLI --tools (comma-separated allow list) */
  tools: string;
  /** CLI --disallowed-tools */
  disallowedTools: string;
  /** CLI --rules */
  rules: string;
  /** CLI --debug */
  debug: boolean;
  /** Extra raw args after built-in flags (advanced) */
  extraCliArgs: string[];
  autoIncludeActiveFile: boolean;
  autoIncludeSelection: boolean;
  /** Extension UI: how to handle ACP session/request_permission */
  permissionMode: 'ask' | 'allow-once' | 'allow-session' | 'allow-always';
  showDiffBeforeApply: boolean;
  /** Execute mode: auto-allow tool permissions (prevents hung turns) */
  autoAllowInExecuteMode: boolean;
  maxContextFileBytes: number;
  sessionHistoryLimit: number;
  enableTerminal: boolean;
  logLevel: string;
}

export function getConfig(): GrokBuildConfig {
  const c = vscode.workspace.getConfiguration('grokBuild');
  const maxTurns = c.get<number | null>('maxTurns', null);
  return {
    cliPath: c.get<string>('cliPath', 'grok'),
    cliArgs: c.get<string[]>('cliArgs', ['agent', 'stdio']),
    openLocation: c.get<'editor' | 'sidebar'>('openLocation', 'editor'),
    defaultMode: c.get<AgentMode>('defaultMode', 'execute'),
    defaultModel: c.get<string>('defaultModel', ''),
    reasoningEffort: c.get<string>('reasoningEffort', ''),
    cliPermissionMode: c.get<CliPermissionMode>('cliPermissionMode', ''),
    alwaysApprove: c.get<boolean>('alwaysApprove', false),
    maxTurns: maxTurns != null && maxTurns > 0 ? maxTurns : null,
    noSubagents: c.get<boolean>('noSubagents', false),
    noPlan: c.get<boolean>('noPlan', false),
    noMemory: c.get<boolean>('noMemory', false),
    experimentalMemory: c.get<boolean>('experimentalMemory', false),
    disableWebSearch: c.get<boolean>('disableWebSearch', false),
    sandbox: c.get<string>('sandbox', ''),
    tools: c.get<string>('tools', ''),
    disallowedTools: c.get<string>('disallowedTools', ''),
    rules: c.get<string>('rules', ''),
    debug: c.get<boolean>('debug', false),
    extraCliArgs: c.get<string[]>('extraCliArgs', []),
    autoIncludeActiveFile: c.get<boolean>('autoIncludeActiveFile', true),
    autoIncludeSelection: c.get<boolean>('autoIncludeSelection', true),
    permissionMode: c.get<'ask' | 'allow-once' | 'allow-session' | 'allow-always'>(
      'permissionMode',
      'ask'
    ),
    showDiffBeforeApply: c.get<boolean>('showDiffBeforeApply', false),
    autoAllowInExecuteMode: c.get<boolean>('autoAllowInExecuteMode', true),
    maxContextFileBytes: c.get<number>('maxContextFileBytes', 200_000),
    sessionHistoryLimit: c.get<number>('sessionHistoryLimit', 50),
    enableTerminal: c.get<boolean>('enableTerminal', true),
    logLevel: c.get<string>('logLevel', 'info'),
  };
}

export function getWorkspaceCwd(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].uri.fsPath;
  }
  return process.cwd();
}
